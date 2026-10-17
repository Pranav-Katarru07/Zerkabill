import { describe, expect, it } from "vitest";
import { hedged } from "../src/audit/pipeline.js";

const later = <T>(ms: number, v: T, fail = false) =>
  new Promise<T>((res, rej) => setTimeout(() => (fail ? rej(new Error(String(v))) : res(v)), ms));

describe("hedged", () => {
  it("returns the first call when it's fast", async () => {
    let calls = 0;
    await expect(hedged(() => (calls++, later(5, "a")), 50)).resolves.toBe("a");
    expect(calls).toBe(1);
  });

  it("races a backup when the first is slow, and the faster one wins", async () => {
    const results = [later(200, "slow"), later(10, "fast")];
    let i = 0;
    await expect(hedged(() => results[i++], 20)).resolves.toBe("fast");
    expect(i).toBe(2);
  });

  it("starts the backup right away if the first attempt fails", async () => {
    const results = [later(5, "boom", true), later(5, "ok")];
    let i = 0;
    await expect(hedged(() => results[i++], 1000)).resolves.toBe("ok");
  });

  it("rejects only when both attempts fail", async () => {
    const results = [later(5, "one", true), later(5, "two", true)];
    let i = 0;
    await expect(hedged(() => results[i++], 1000)).rejects.toThrow("two");
  });
});
