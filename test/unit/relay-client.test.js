import { afterEach, describe, expect, it, vi } from "vitest";
import { RelayClient } from "../../src/relay/client.js";

/** Minimal fake WebSocket capturing listeners and the constructed URL. */
class FakeSocket {
  static last = null;

  /**
   * @param {string} url - The connection URL.
   */
  constructor(url) {
    this.url = url;
    this.listeners = {};
    FakeSocket.last = this;
  }

  /**
   * @param {string} type - Event type.
   * @param {Function} fn - Listener.
   * @returns {void}
   */
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }

  /**
   * @param {string} type - Event type to dispatch.
   * @param {object} [event] - Event payload.
   * @returns {void}
   */
  emit(type, event) {
    (this.listeners[type] || []).forEach((fn) => fn(event));
  }

  /** @returns {void} */
  close() {
    this.emit("close", {});
  }
}

afterEach(() => {
  delete globalThis.WebSocket;
  vi.useRealTimers();
});

describe("RelayClient", () => {
  it("dispatches speaking and quiet callbacks from messages", () => {
    globalThis.WebSocket = FakeSocket;
    const onSpeaking = vi.fn();
    const onQuiet = vi.fn();
    new RelayClient({ url: "ws://x", onSpeaking, onQuiet }).connect();
    FakeSocket.last.emit("message", { data: JSON.stringify({ type: "speaking", userId: "1" }) });
    FakeSocket.last.emit("message", { data: JSON.stringify({ type: "quiet", userId: "1" }) });
    expect(onSpeaking).toHaveBeenCalledWith("1");
    expect(onQuiet).toHaveBeenCalledWith("1");
  });

  it("ignores malformed messages", () => {
    globalThis.WebSocket = FakeSocket;
    const onSpeaking = vi.fn();
    new RelayClient({ url: "ws://x", onSpeaking, onQuiet: vi.fn() }).connect();
    FakeSocket.last.emit("message", { data: "not json" });
    FakeSocket.last.emit("message", { data: JSON.stringify({ type: "speaking" }) });
    expect(onSpeaking).not.toHaveBeenCalled();
  });

  it("appends the token as a query parameter", () => {
    globalThis.WebSocket = FakeSocket;
    new RelayClient({ url: "ws://x", token: "secret", onSpeaking: vi.fn(), onQuiet: vi.fn() }).connect();
    expect(FakeSocket.last.url).toBe("ws://x?token=secret");
  });

  it("reconnects with backoff after an unexpected close", () => {
    vi.useFakeTimers();
    globalThis.WebSocket = FakeSocket;
    new RelayClient({ url: "ws://x", onSpeaking: vi.fn(), onQuiet: vi.fn() }).connect();
    const first = FakeSocket.last;
    first.close();
    expect(FakeSocket.last).toBe(first);
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.last).not.toBe(first);
  });

  it("does not reconnect after disconnect()", () => {
    vi.useFakeTimers();
    globalThis.WebSocket = FakeSocket;
    const client = new RelayClient({ url: "ws://x", onSpeaking: vi.fn(), onQuiet: vi.fn() });
    client.connect();
    const first = FakeSocket.last;
    client.disconnect();
    vi.advanceTimersByTime(5000);
    expect(FakeSocket.last).toBe(first);
  });
});
