import { afterEach, describe, expect, it, vi } from "vitest";
import { accessStatus, bootstrap, isAbort } from "./api";

const valid = {
  enabled: true, unlocked: false, token: "csrf-token",
  profile: { username: "Operator", badge_id: "DSH-01" },
  startup: { enabled: true, override_enabled: null, reduced_motion: false, sound: true },
};
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("access status response", () => {
  it("accepts the explicit boolean status and only public identity metadata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => valid }));
    expect(await accessStatus()).toEqual(valid);
  });
  it.each([
    null,
    [],
    {},
    { ...valid, unlocked: "true" },
    { ...valid, enabled: "false", unlocked: true },
    { ...valid, token: "" },
    { ...valid, profile: null },
    { ...valid, profile: { username: 123, badge_id: "DSH-01" } },
    { ...valid, startup: { ...valid.startup, enabled: "false" } },
    { ...valid, startup: { ...valid.startup, override_enabled: "on" } },
  ])("rejects malformed access state instead of treating truthy values as unlocked (%j)", async (value) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => value }));
    await expect(accessStatus()).rejects.toThrow("本地服务返回了无效的访问状态");
  });
});

describe("startup request deadlines", () => {
  function hangingRequest(bodyOnly = false) {
    let pendingSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_path: string, options: RequestInit) => {
      const signal = options.signal as AbortSignal;
      pendingSignal = signal;
      const wait = () => new Promise<never>((_resolve, reject) => {
        const abort = () => reject(new DOMException("Cancelled", "AbortError"));
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
      });
      return bodyOnly ? Promise.resolve({ ok: true, status: 200, json: wait }) : wait();
    }));
    return () => pendingSignal;
  }

  it.each([accessStatus, bootstrap])("turns stalled startup headers into a retryable error", async (read) => {
    vi.useFakeTimers();
    const signal = hangingRequest();
    const result = read().catch(failure => failure);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(signal()?.aborted).toBe(true);
    const failure = await result;
    expect(failure).toMatchObject({ code: "startup_timeout", message: "连接本机 Harness 超时，请重试。" });
    expect(isAbort(failure)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("also bounds a stalled JSON body after successful headers", async () => {
    vi.useFakeTimers();
    hangingRequest(true);
    const result = bootstrap().catch(failure => failure);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await result).toMatchObject({ code: "startup_timeout" });
  });

  it.each([false, true])("preserves caller cancellation without leaving a timeout (body=%s)", async bodyOnly => {
    vi.useFakeTimers();
    const signal = hangingRequest(bodyOnly);
    const caller = new AbortController();
    const result = accessStatus(caller.signal).catch(failure => failure);
    await Promise.resolve();
    caller.abort();
    expect(isAbort(await result)).toBe(true);
    expect(signal()?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the deadline after a successful access read", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => valid }));
    await accessStatus();
    expect(vi.getTimerCount()).toBe(0);
  });
});
