import { logger } from "../logger.js";

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

/**
 * Maintains a WebSocket connection to the Muffler bot relay, parsing speaking/quiet events and
 * reconnecting with exponential backoff. An optional token is sent as a URL query parameter.
 */
export class RelayClient {
  /** @type {string} Relay WebSocket URL. */
  #url;
  /** @type {string} Optional relay token. */
  #token;
  /** @type {(userId: string) => void} */
  #onSpeaking;
  /** @type {(userId: string) => void} */
  #onQuiet;
  /** @type {(status: "connected"|"disconnected") => void} */
  #onStatus;
  /** @type {WebSocket|null} */
  #socket = null;
  /** @type {number} Current backoff delay. */
  #reconnectMs = RECONNECT_BASE_MS;
  /** @type {ReturnType<typeof setTimeout>|null} */
  #reconnectTimer = null;
  /** @type {boolean} Whether disconnect() was called (suppresses reconnect). */
  #closed = false;

  /**
   * @param {object} options - Client options.
   * @param {string} options.url - Relay WebSocket URL (e.g. ws://localhost:8080).
   * @param {string} [options.token] - Optional relay token.
   * @param {(userId: string) => void} options.onSpeaking - Called when a user starts speaking.
   * @param {(userId: string) => void} options.onQuiet - Called when a user stops speaking.
   * @param {(status: "connected"|"disconnected") => void} [options.onStatus] - Status callback.
   */
  constructor({ url, token, onSpeaking, onQuiet, onStatus }) {
    this.#url = url;
    this.#token = token ?? "";
    this.#onSpeaking = onSpeaking;
    this.#onQuiet = onQuiet;
    this.#onStatus = onStatus ?? (() => {});
  }

  /**
   * Opens the connection (and keeps it open across drops via backoff reconnect).
   * @returns {void}
   */
  connect() {
    this.#closed = false;
    this.#open();
  }

  /**
   * Closes the connection and suppresses further reconnects.
   * @returns {void}
   */
  disconnect() {
    this.#closed = true;
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    if (this.#socket) {
      this.#socket.close();
      this.#socket = null;
    }
  }

  /**
   * Opens a single WebSocket and wires its lifecycle events.
   * @returns {void}
   */
  #open() {
    const url = this.#token ? `${this.#url}?token=${encodeURIComponent(this.#token)}` : this.#url;
    let socket;
    try {
      socket = new WebSocket(url);
    } catch (error) {
      logger.error("Relay connection failed", error);
      this.#scheduleReconnect();
      return;
    }
    this.#socket = socket;
    socket.addEventListener("open", () => {
      this.#reconnectMs = RECONNECT_BASE_MS;
      this.#onStatus("connected");
      logger.info("Relay connected.");
    });
    socket.addEventListener("message", (event) => this.#handle(event.data));
    socket.addEventListener("close", () => {
      this.#socket = null;
      this.#onStatus("disconnected");
      if (!this.#closed) {
        this.#scheduleReconnect();
      }
    });
    socket.addEventListener("error", () => socket.close());
  }

  /**
   * Parses a relay message and dispatches speaking/quiet callbacks.
   * @param {string} data - Raw message payload.
   * @returns {void}
   */
  #handle(data) {
    let message;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }
    if (!message || typeof message.userId !== "string") {
      return;
    }
    if (message.type === "speaking") {
      this.#onSpeaking(message.userId);
    } else if (message.type === "quiet") {
      this.#onQuiet(message.userId);
    }
  }

  /**
   * Schedules a reconnect with exponential backoff, capped at the maximum delay.
   * @returns {void}
   */
  #scheduleReconnect() {
    if (this.#closed || this.#reconnectTimer) {
      return;
    }
    const delay = this.#reconnectMs;
    this.#reconnectMs = Math.min(this.#reconnectMs * 2, RECONNECT_MAX_MS);
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.#open();
    }, delay);
  }
}
