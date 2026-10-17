import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyPhotonSignature } from "../src/photon/verify.js";
import { toInbound } from "../src/photon/webhook.js";

const SECRET = "test-secret";
const body = JSON.stringify({ hello: "world" });
const now = () => String(Math.floor(Date.now() / 1000));

describe("verifyPhotonSignature", () => {
  it("accepts a valid spectrum v0 signature", () => {
    const ts = now();
    const sig = "v0=" + createHmac("sha256", SECRET).update(`v0:${ts}:${body}`).digest("hex");
    const h = new Headers({ "x-spectrum-signature": sig, "x-spectrum-timestamp": ts });
    expect(verifyPhotonSignature(h, body, SECRET)).toEqual({ ok: true, scheme: "spectrum" });
  });

  it("accepts a valid standard-webhooks signature", () => {
    const ts = now();
    const key = Buffer.from("c2VjcmV0LWJ5dGVz", "base64");
    const sig = createHmac("sha256", key).update(`msg_1.${ts}.${body}`).digest("base64");
    const h = new Headers({ "webhook-id": "msg_1", "webhook-timestamp": ts, "webhook-signature": `v1,bogus v1,${sig}` });
    expect(verifyPhotonSignature(h, body, "whsec_c2VjcmV0LWJ5dGVz")).toEqual({ ok: true, scheme: "standard" });
  });

  it("rejects a tampered body", () => {
    const ts = now();
    const sig = "v0=" + createHmac("sha256", SECRET).update(`v0:${ts}:${body}`).digest("hex");
    const h = new Headers({ "x-spectrum-signature": sig, "x-spectrum-timestamp": ts });
    expect(verifyPhotonSignature(h, body + " ", SECRET).ok).toBe(false);
  });

  it("rejects stale timestamps and missing headers", () => {
    const ts = String(Math.floor(Date.now() / 1000) - 3600);
    const sig = "v0=" + createHmac("sha256", SECRET).update(`v0:${ts}:${body}`).digest("hex");
    expect(verifyPhotonSignature(new Headers({ "x-spectrum-signature": sig, "x-spectrum-timestamp": ts }), body, SECRET).ok).toBe(false);
    expect(verifyPhotonSignature(new Headers(), body, SECRET).ok).toBe(false);
  });
});

const received = {
  id: "pho_msg_01abc",
  status: "received",
  platform: "imessage",
  space: { id: "pho_spc_01xyz" },
  sentBy: { id: "pho_usr_01maya", handle: "+15550001111" },
  receivedBy: { id: "pho_usr_01agent" },
  content: { type: "text", format: "plain", text: "ping" },
};

describe("toInbound", () => {
  it("finds the message under data.message", () => {
    const m = toInbound({ type: "message.received", data: { message: received } });
    expect(m).toEqual({
      id: "pho_msg_01abc",
      thread: { spaceId: "pho_spc_01xyz", agentUserId: "pho_usr_01agent" },
      senderHandle: "+15550001111",
      content: { type: "text", text: "ping" },
    });
  });

  it("normalizes attachments", () => {
    const m = toInbound({ data: { ...received, content: { type: "attachment", attachmentId: "pho_att_1" } } });
    expect(m?.content).toEqual({ type: "attachment", attachmentId: "pho_att_1" });
  });

  it("ignores outbound/status events", () => {
    expect(toInbound({ data: { ...received, status: "delivered" } })).toBeUndefined();
    expect(toInbound("nope")).toBeUndefined();
  });
});
