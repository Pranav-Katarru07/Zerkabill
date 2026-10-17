import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── fake Supabase: a thenable query builder whose result comes from `respond` ──
type Op = { op: string; args: unknown[] };
let respond: (table: string, ops: Op[]) => unknown = () => ({ data: null });
const writes: { table: string; ops: Op[] }[] = [];

function builder(table: string) {
  const ops: Op[] = [];
  const b: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") {
          const result = respond(table, ops);
          if (ops.some((o) => o.op === "insert" || o.op === "update")) writes.push({ table, ops: [...ops] });
          return (res: (v: unknown) => void) => res(result);
        }
        return (...args: unknown[]) => {
          ops.push({ op: prop, args });
          return b;
        };
      },
    },
  );
  return b;
}

vi.mock("../src/db.js", () => ({ db: () => ({ from: (t: string) => builder(t) }), logEvent: async () => {} }));

const baseEnv = {
  PHOTON_PROJECT_ID: "pho_prj_test",
  ELEVENLABS_API_KEY: "k",
  ELEVENLABS_AGENT_ID: "agent",
  ELEVENLABS_PHONE_NUMBER_ID: "phone",
  DEMO_MODE: "true",
  DEMO_BILLING_OFFICE_NUMBER: "+14130000000",
};

const audit = {
  billId: "bill-1",
  conversationId: "conv-1",
  token: "t",
  provider: "Mercy Ridge Regional Medical Center",
  accountNumber: "7741-20926",
  admitDate: "2026-09-14",
  totalBilled: 4800,
  potentialSavings: 1239.99,
  state: "MA",
  patientName: "Maya",
  lines: [{ id: "li-4", position: 4, code: "73110", description: "XR WRIST", qty: 1, unitCharge: 268, totalCharge: 268, dateOfService: "2026-09-14", plainEnglish: "Wrist X-ray, at least 3 views.", plainEnglishVerified: true }],
  findings: [{ lineItemId: "li-4", rule: "duplicate", severity: "likely_error" as const, explanation: "", estimatedOverchargeUsd: 268, evidence: { amount: 268, duplicateOf: "L3" } }],
  approval: null,
  call: null,
};

const fetchMock = vi.fn();

beforeEach(async () => {
  vi.resetModules();
  writes.length = 0;
  fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ success: true, conversation_id: "conv_el_1", sip_call_id: "s" })));
  vi.stubGlobal("fetch", fetchMock);
  for (const [k, v] of Object.entries(baseEnv)) process.env[k] = v;
});
afterEach(() => vi.unstubAllGlobals());

async function start() {
  const { startDisputeCall } = await import("../src/voice/start-call.js");
  return startDisputeCall(audit);
}

/** Default happy-path DB: an unused approval to the demo number, no recent calls. */
function happyDb(over: Partial<{ approval: unknown; recentCalls: number; claimed: unknown[] }> = {}) {
  respond = (table, ops) => {
    const isUpdate = ops.some((o) => o.op === "update");
    const isInsert = ops.some((o) => o.op === "insert");
    if (table === "approvals" && isUpdate) return { data: over.claimed ?? [{ id: "ap-1" }] };
    if (table === "approvals") return { data: "approval" in over ? over.approval : { id: "ap-1", to_number: "+14130000000", used_at: null } };
    if (table === "calls" && isInsert) return { data: { id: "call-1" }, error: null };
    if (table === "calls" && ops.some((o) => o.op === "gt")) return { count: over.recentCalls ?? 0 };
    return { data: null, error: null };
  };
}

describe("call guards (never dial without them)", () => {
  it("refuses without an approval record", async () => {
    happyDb({ approval: null });
    await expect(start()).rejects.toThrow(/no approval/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a used approval", async () => {
    happyDb({ approval: { id: "ap-1", to_number: "+14130000000", used_at: "2026-10-17T00:00:00Z" } });
    await expect(start()).rejects.toThrow(/already used/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("in demo mode, refuses any number but the demo billing office", async () => {
    happyDb({ approval: { id: "ap-1", to_number: "+16175550123", used_at: null } });
    await expect(start()).rejects.toThrow(/demo mode/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rate-limits to one call per conversation per 5 minutes", async () => {
    happyDb({ recentCalls: 1 });
    await expect(start()).rejects.toThrow(/rate limited/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loses the race gracefully if another request claimed the approval first", async () => {
    happyDb({ claimed: [] });
    await expect(start()).rejects.toThrow(/already used/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("with everything in place, dials the approved number with the bill context", async () => {
    happyDb();
    await expect(start()).resolves.toBe("call-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ agent_id: "agent", agent_phone_number_id: "phone", to_number: "+14130000000" });
    expect(body.conversation_initiation_client_data.dynamic_variables).toMatchObject({
      patient_name: "Maya",
      account_number: "7741-20926",
      visit_date: "September 14, 2026",
      disputes_total: "about $1,240",
    });
    const vars = body.conversation_initiation_client_data.dynamic_variables;
    expect(vars.disputes).toMatch(/^1\. The wrist X-ray is billed twice on the same day, \$268 each/);
    expect(vars.disputes).not.toMatch(/73110/); // codes aren't read aloud
    expect(vars.disputes_count).toBe("1");
    // the approval is claimed before dialing
    const claimIdx = writes.findIndex((w) => w.table === "approvals");
    expect(claimIdx).toBeGreaterThanOrEqual(0);
  });

  it("marks the call failed if ElevenLabs rejects it", async () => {
    happyDb();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, message: "trunk auth failed" }), { status: 400 }));
    await expect(start()).rejects.toThrow(/trunk auth failed/);
    const failed = writes.find((w) => w.table === "calls" && w.ops.some((o) => o.op === "update" && (o.args[0] as any)?.status === "failed"));
    expect(failed).toBeTruthy();
  });
});

describe("approval words", async () => {
  const { YES, NO } = await import("../src/agent/call-flow.js");
  it("recognizes yes and no", () => {
    for (const t of ["yes", "Yes!", "yeah", "yep do it", "ok", "sure", "go ahead", "call them", "👍"]) expect(YES.test(t), t).toBe(true);
    for (const t of ["no", "nope", "not now", "wait", "stop"]) expect(NO.test(t), t).toBe(true);
    for (const t of ["maybe", "what will you say?", "know what"]) expect(YES.test(t), t).toBe(false);
  });
});

describe("post-call texts", async () => {
  const { outcomeTexts, readOutcome } = await import("../src/voice/finish.js");

  it("reads ElevenLabs data collection results", () => {
    const o = readOutcome({
      analysis: {
        transcript_summary: "The rep agreed to review.",
        data_collection_results: {
          outcome: { value: "agreed_to_review" },
          rep_name: { value: "Dana" },
          reference_number: { value: "4417" },
          next_step: { value: "Corrected bill in 7–10 business days" },
        },
      },
    });
    expect(o).toMatchObject({ outcome: "agreed_to_review", repName: "Dana", referenceNumber: "4417" });
  });

  it("texts the outcome, rep, reference number, and next step", () => {
    const texts = outcomeTexts(
      { outcome: "agreed_to_review", repName: "Dana", referenceNumber: "4417", nextStep: "Corrected bill in 7–10 business days", chargesAddressed: "all 3 charges", summary: "" },
      "Mercy Ridge",
      "Maya",
    );
    const all = texts.join("\n");
    expect(all).toContain("Mercy Ridge billing (Dana)");
    expect(all).toContain("reference # 4417");
    expect(all).toContain("corrected bill in 7–10 business days");
  });

  it("offers a 3-way call when they need the patient", () => {
    const texts = outcomeTexts({ outcome: "needs_patient", repName: "", referenceNumber: "", nextStep: "", chargesAddressed: "", summary: "" }, "Mercy Ridge", "Maya");
    expect(texts.join(" ")).toMatch(/3-way call/);
  });
});

describe("ambiguous start failures", () => {
  it("keeps the call in flight on a timeout instead of failing it (the webhook reconciles)", async () => {
    happyDb();
    fetchMock.mockRejectedValue(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));
    const { startDisputeCall } = await import("../src/voice/start-call.js");
    await expect(startDisputeCall(audit)).resolves.toBe("call-1");
    const failed = writes.find((w) => w.table === "calls" && w.ops.some((o) => o.op === "update" && (o.args[0] as any)?.status === "failed"));
    expect(failed).toBeUndefined();
  });

  it("passes our call id to ElevenLabs so the webhook can find the row", async () => {
    happyDb();
    const { startDisputeCall } = await import("../src/voice/start-call.js");
    await startDisputeCall(audit);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.conversation_initiation_client_data.dynamic_variables.zb_call_id).toBe("call-1");
  });
});
