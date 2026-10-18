// Conversation state machine: intake → awaiting_bill → auditing → review → (M4: awaiting_approval → calling → done)
import { auditImage } from "../audit/pipeline.js";
import { toBillMedia } from "../audit/media.js";
import { sha256 } from "../audit/parse.js";
import { env } from "../config.js";
import { logEvent } from "../db.js";
import { downloadAttachment, responding, sendText, type Inbound } from "../photon/client.js";
import { getOrCreateConversation, parseCache, priceCache, saveAudit, saveFailedBill, updateConversation, type Conversation } from "../store.js";
import { auditSummary, copy } from "./copy.js";
import { disputeScript, handleApprovalText, latestAuditToken, startCallForApproval } from "./call-flow.js";
import { extractIntake } from "./intake.js";

export async function handleMessage(msg: Inbound): Promise<void> {
  const convo = await getOrCreateConversation(msg.thread, msg.senderHandle);
  const say = sayer(msg);

  if (msg.content.type === "attachment") return handleBill(convo, msg, msg.content.attachmentId, say);
  if (msg.content.type !== "text") return;

  const text = msg.content.text.trim();
  const lower = text.toLowerCase();

  if (lower === "ping") return say(["pong 🏓"]);
  if (/^(reset|start over|restart)$/.test(lower)) {
    await updateConversation(convo.id, { state: "intake", intake_asked: false, hospital: null, insured: null, visit_date: null, patient_name: null });
    return say([copy.reset]);
  }

  switch (convo.state) {
    case "intake":
    case "awaiting_bill":
      return handleIntake(convo, text, say);
    case "auditing":
      return say([copy.stillWorking]);
    case "review":
    case "awaiting_approval": {
      const reply = await handleApprovalText(convo, text);
      if (reply === "start_call") {
        const token = await latestAuditToken(convo.id);
        if (token) await startCallForApproval(token);
        return;
      }
      return say(reply);
    }
    case "calling":
      return say(["i'm on the phone with them right now — i'll text you the second we're done."]);
    case "done":
      if (/\bscript\b/i.test(lower)) return say(await disputeScript(convo.id));
      return say([copy.fallback]);
    default:
      return say([copy.fallback]);
  }
}

// ── intake ───────────────────────────────────────────────────────────────────

async function handleIntake(convo: Conversation, text: string, say: Say): Promise<void> {
  const lastQuestion = convo.intake_asked ? copy.askIntake({ hospital: !convo.hospital, insured: convo.insured == null }) : null;
  const facts = await extractIntake(text, lastQuestion);
  const patch = {
    hospital: convo.hospital ?? facts.hospital,
    insured: convo.insured ?? facts.insured,
    visit_date: convo.visit_date ?? facts.visitDate,
    patient_name: convo.patient_name ?? facts.firstName,
  };
  const missing = { hospital: !patch.hospital, insured: patch.insured == null };

  // First contact: introduce ourselves and ask what's missing (at most once — never nag).
  if (!convo.intake_asked) {
    const needAsk = missing.hospital || missing.insured;
    await updateConversation(convo.id, { ...patch, intake_asked: true, state: needAsk ? "intake" : "awaiting_bill" });
    return say(needAsk ? [...copy.greeting, copy.askIntake(missing)] : [...copy.greeting, ...copy.askForBill]);
  }

  await updateConversation(convo.id, { ...patch, state: "awaiting_bill" });
  return say(copy.askForBill);
}

// ── bill ─────────────────────────────────────────────────────────────────────

async function handleBill(convo: Conversation, msg: Inbound, attachmentId: string, say: Say): Promise<void> {
  if (convo.state === "auditing") return say([copy.stillWorking]);
  await updateConversation(convo.id, { state: "auditing" });
  await say([copy.billReceived]);

  try {
    await responding(msg.thread, async () => {
      const file = await downloadAttachment(attachmentId);
      const media = await toBillMedia(file.bytes, file.mimeType);
      if (!media) {
        await updateConversation(convo.id, { state: "awaiting_bill" });
        return say([copy.notABill]);
      }

      const audit = await auditImage(media.bytes, media.mediaType, { parseCache, priceCache });
      await logEvent("audit.done", { status: audit.status, timings: "timings" in audit ? audit.timings : undefined }, convo.id);

      if (audit.status === "unreadable") {
        await saveFailedBill(convo.id, audit.parse.imageHash, "unreadable", audit.parse.bill);
        await updateConversation(convo.id, { state: "awaiting_bill" });
        return say(copy.unreadable);
      }
      if (audit.status === "not_itemized") {
        const hospital = convo.hospital ?? audit.parse.bill.provider;
        await saveFailedBill(convo.id, audit.parse.imageHash, "not_itemized", audit.parse.bill);
        await updateConversation(convo.id, { state: "awaiting_bill", hospital });
        return say(copy.notItemized(hospital));
      }

      const token = await saveAudit(convo.id, audit.parse.imageHash ?? sha256(media.bytes), audit, audit.parse.confidence);
      await updateConversation(convo.id, {
        state: "review",
        hospital: convo.hospital ?? audit.bill.provider,
        patient_name: convo.patient_name ?? audit.bill.patientFirstName,
        visit_date: convo.visit_date ?? audit.bill.admitDate,
      });
      const base = env().PUBLIC_BASE_URL;
      await say(auditSummary(audit, base ? `${base}/audit/${token}` : undefined));
    });
  } catch (err) {
    console.error("[bill] audit failed", err);
    await logEvent("audit.error", { error: String(err) }, convo.id);
    await updateConversation(convo.id, { state: "awaiting_bill" });
    await say([copy.failed]);
  }
}

// ── sending ──────────────────────────────────────────────────────────────────

type Say = (texts: string[]) => Promise<void>;

/** Sends texts in order, a beat apart, each with an idempotency key tied to the inbound message. */
function sayer(msg: Inbound): Say {
  let n = 0;
  return async (texts) => {
    for (const text of texts) {
      if (n > 0) await pause(text);
      await sendText(msg.thread, text, { idempotencyKey: `${msg.id}:${n++}` });
    }
  };
}

/** A short, length-based beat so several texts read like someone typing, not a webhook dump. */
const pause = (next: string) => new Promise((r) => setTimeout(r, Math.min(1400, 350 + next.length * 8)));
