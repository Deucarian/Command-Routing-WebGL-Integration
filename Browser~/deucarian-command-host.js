const INBOUND_SOURCE = "deucarian-command-host";
const OUTBOUND_SOURCE = "deucarian-command-transport";
const DEFAULT_MAXIMUM_MESSAGE_CHARACTERS = 262144;
const DIRECT_EVENTS = [
  "deucarian-command-ready",
  "deucarian-command-unavailable",
  "deucarian-command-response",
  "deucarian-command-event",
  "deucarian-command-error"
];

export class DeucarianCommandHost {
  constructor(options = {}) {
    this.hostWindow = options.hostWindow || window;
    this.iframe = options.iframe || null;
    const configuredTarget = this.iframe?.contentWindow || options.targetWindow || null;
    this.mode = this.iframe || configuredTarget && configuredTarget !== this.hostWindow
      ? "iframe"
      : "direct";
    this.targetWindow = configuredTarget ||
      (this.mode === "direct" ? this.hostWindow : null);
    this.targetOrigin = normalizeOrigin(options.targetOrigin, this.mode === "iframe");
    this.transportId = normalizeTransportId(options.transportId || "viewer");
    this.maximumPendingCommands = normalizePositiveInteger(
      options.maximumPendingCommands,
      64,
      "maximumPendingCommands");
    this.maximumMessageCharacters = normalizePositiveInteger(
      options.maximumMessageCharacters,
      DEFAULT_MAXIMUM_MESSAGE_CHARACTERS,
      "maximumMessageCharacters");
    this.queue = [];
    this.listeners = new Map();
    this.ready = false;
    this.started = false;
    this.disposed = false;
    this.generation = 0;
    this.hostSession = createHostSession();
    this.onWindowMessage = this.onWindowMessage.bind(this);
    this.onDirectMessage = this.onDirectMessage.bind(this);
    this.onIframeLoad = this.onIframeLoad.bind(this);
  }

  get isReady() {
    return this.ready;
  }

  get connectionGeneration() {
    return this.generation;
  }

  get pendingCommandCount() {
    return this.queue.length;
  }

  start() {
    this.throwIfDisposed();
    if (this.started) return;
    this.started = true;
    this.attachTransportListeners();
    this.iframe?.addEventListener?.("load", this.onIframeLoad, false);
    this.requestReady();
  }

  stop() {
    if (this.disposed || !this.started) return;
    this.detachTransportListeners();
    this.iframe?.removeEventListener?.("load", this.onIframeLoad, false);
    this.started = false;
    this.markUnavailable();
    this.emit("deucarian-command-unavailable", {
      source: OUTBOUND_SOURCE,
      type: "deucarian-command-unavailable",
      transport_id: this.transportId,
      connection_generation: this.generation,
      host_session: this.hostSession,
      reason: "host_stopped"
    });
  }

  replaceTarget(targetWindow, targetOrigin, iframe = null) {
    this.throwIfDisposed();
    if (!targetWindow) {
      throw new TypeError("A target window is required.");
    }

    const wasStarted = this.started;
    if (wasStarted) {
      this.detachTransportListeners();
      this.iframe?.removeEventListener?.("load", this.onIframeLoad, false);
    }

    this.iframe = iframe;
    this.targetWindow = targetWindow;
    this.mode = targetWindow === this.hostWindow ? "direct" : "iframe";
    this.targetOrigin = normalizeOrigin(targetOrigin, this.mode === "iframe");
    this.generation = 0;
    this.hostSession = createHostSession();
    this.markUnavailable();
    this.emit("deucarian-command-unavailable", {
      source: OUTBOUND_SOURCE,
      type: "deucarian-command-unavailable",
      transport_id: this.transportId,
      connection_generation: 0,
      host_session: this.hostSession,
      reason: "target_replaced"
    });

    if (wasStarted) {
      this.attachTransportListeners();
      this.iframe?.addEventListener?.("load", this.onIframeLoad, false);
      this.requestReady();
    }
  }

  requestReady() {
    this.throwIfDisposed();
    if (!this.started) {
      throw new Error("The command host must be started before requesting readiness.");
    }

    const probe = {
      source: INBOUND_SOURCE,
      type: "deucarian-command-probe",
      transport_id: this.transportId,
      connection_generation: this.generation,
      host_session: this.hostSession
    };
    if (this.mode === "iframe") {
      if (!this.targetWindow) return false;
      this.targetWindow.postMessage(probe, this.targetOrigin);
    } else {
      this.hostWindow.dispatchEvent(
        new CustomEvent("deucarian-command-probe", { detail: probe }));
    }
    return true;
  }

  on(type, listener) {
    this.throwIfDisposed();
    if (typeof listener !== "function") {
      throw new TypeError("A listener function is required.");
    }
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
    return () => listeners.delete(listener);
  }

  sendCommand(envelope) {
    this.throwIfDisposed();
    if (!this.started) {
      throw new Error("The command host must be started before sending commands.");
    }
    if (!envelope || typeof envelope.command !== "string" || !envelope.command.trim()) {
      throw new TypeError("A canonical command envelope is required.");
    }

    const envelopeJson = JSON.stringify(envelope);
    if (envelopeJson.length > this.maximumMessageCharacters) {
      const error = new RangeError(
        `The command exceeds the ${this.maximumMessageCharacters}-character limit.`);
      error.code = "message_too_large";
      throw error;
    }

    if (!this.ready) {
      if (this.queue.length >= this.maximumPendingCommands) {
        const error = new Error("The pending command queue is full.");
        error.code = "pending_queue_full";
        throw error;
      }
      this.queue.push(envelopeJson);
      return false;
    }

    this.postEnvelope(envelopeJson);
    return true;
  }

  dispose() {
    if (this.disposed) return;
    if (this.started) {
      this.detachTransportListeners();
      this.iframe?.removeEventListener?.("load", this.onIframeLoad, false);
    }
    this.ready = false;
    this.started = false;
    this.disposed = true;
    this.queue = [];
    this.listeners.clear();
  }

  onWindowMessage(event) {
    if (event.source !== this.targetWindow || event.origin !== this.targetOrigin) return;
    this.accept(event.data);
  }

  onDirectMessage(event) {
    this.accept(event.detail);
  }

  accept(message) {
    if (!message || message.source !== OUTBOUND_SOURCE ||
        message.transport_id !== this.transportId) return false;

    if (message.type === "deucarian-command-ready") {
      if (message.host_session !== this.hostSession) {
        if (this.started) this.requestReady();
        return false;
      }
      const generation = normalizeGeneration(message.connection_generation);
      if (generation === null || generation < this.generation) return false;
      this.generation = generation;
      this.ready = true;
      const pending = this.queue.splice(0);
      pending.forEach(envelopeJson => this.postEnvelope(envelopeJson));
    } else if (message.type === "deucarian-command-unavailable") {
      if (message.host_session !== this.hostSession) return false;
      const generation = normalizeGeneration(message.connection_generation);
      if (generation !== null && generation < this.generation) return false;
      if (generation !== null) this.generation = generation;
      this.markUnavailable();
    } else if (!this.ready ||
        message.host_session !== this.hostSession ||
        message.connection_generation !== this.generation) {
      return false;
    }

    this.emit(message.type, message);
    return true;
  }

  onIframeLoad() {
    if (this.iframe?.contentWindow) {
      this.targetWindow = this.iframe.contentWindow;
    }
    this.generation = 0;
    this.hostSession = createHostSession();
    const message = {
      source: OUTBOUND_SOURCE,
      type: "deucarian-command-unavailable",
      transport_id: this.transportId,
      connection_generation: 0,
      host_session: this.hostSession,
      reason: "iframe_reloaded"
    };
    this.markUnavailable();
    this.emit(message.type, message);
    if (this.targetWindow) this.requestReady();
  }

  attachTransportListeners() {
    if (this.mode === "iframe") {
      this.hostWindow.addEventListener("message", this.onWindowMessage, false);
      return;
    }
    DIRECT_EVENTS.forEach(type =>
      this.hostWindow.addEventListener(type, this.onDirectMessage, false));
  }

  detachTransportListeners() {
    if (this.mode === "iframe") {
      this.hostWindow.removeEventListener("message", this.onWindowMessage, false);
      return;
    }
    DIRECT_EVENTS.forEach(type =>
      this.hostWindow.removeEventListener(type, this.onDirectMessage, false));
  }

  postEnvelope(envelopeJson) {
    this.post({
      source: INBOUND_SOURCE,
      type: "deucarian-command",
      transport_id: this.transportId,
      connection_generation: this.generation,
      host_session: this.hostSession,
      message: JSON.parse(envelopeJson)
    });
  }

  post(message) {
    if (this.mode === "iframe") {
      this.targetWindow.postMessage(message, this.targetOrigin);
    } else {
      this.hostWindow.dispatchEvent(
        new CustomEvent("deucarian-command", { detail: message }));
    }
  }

  markUnavailable() {
    this.ready = false;
  }

  emit(type, message) {
    (this.listeners.get(type) || []).forEach(listener => listener(message));
  }

  throwIfDisposed() {
    if (this.disposed) {
      throw new Error("The command host has been disposed.");
    }
  }
}

function normalizeOrigin(value, required) {
  if (!required && !value) return "";
  const parsed = new URL(value);
  const origin = parsed.origin;
  if (value === "*" || origin === "null" ||
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.pathname !== "/" || parsed.search || parsed.hash ||
      parsed.username || parsed.password) {
    throw new TypeError("An exact HTTP(S) origin is required.");
  }
  return origin;
}

function normalizeTransportId(value) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > 96) {
    throw new TypeError("A transport ID between 1 and 96 characters is required.");
  }
  return normalized;
}

function normalizePositiveInteger(value, fallback, name) {
  const normalized = value === undefined ? fallback : value;
  if (!Number.isInteger(normalized) || normalized < 1) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
  return normalized;
}

function normalizeGeneration(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

let nextHostSession = 0;

function createHostSession() {
  nextHostSession += 1;
  const randomPart = globalThis.crypto?.randomUUID?.() ||
    Math.random().toString(36).slice(2);
  return `host-${Date.now().toString(36)}-${nextHostSession.toString(36)}-${randomPart}`;
}
