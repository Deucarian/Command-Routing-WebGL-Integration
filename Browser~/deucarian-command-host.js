const INBOUND_SOURCE = "deucarian-command-host";
const OUTBOUND_SOURCE = "deucarian-command-transport";

export class DeucarianCommandHost {
  constructor(options = {}) {
    this.transportId = options.transportId || "viewer";
    this.targetWindow = options.targetWindow || window;
    this.targetOrigin = normalizeOrigin(options.targetOrigin, this.targetWindow !== window);
    this.mode = this.targetWindow === window ? "direct" : "iframe";
    this.maximumPendingCommands = options.maximumPendingCommands || 64;
    this.queue = [];
    this.listeners = new Map();
    this.ready = false;
    this.started = false;
    this.onWindowMessage = this.onWindowMessage.bind(this);
    this.onDirectMessage = this.onDirectMessage.bind(this);
  }

  start() {
    if (this.started) return;
    this.started = true;
    if (this.mode === "iframe") {
      window.addEventListener("message", this.onWindowMessage, false);
    } else {
      ["deucarian-command-ready", "deucarian-command-response", "deucarian-command-event"]
        .forEach(type => window.addEventListener(type, this.onDirectMessage, false));
    }
  }

  on(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
    return () => listeners.delete(listener);
  }

  sendCommand(envelope) {
    if (!envelope || typeof envelope.command !== "string") {
      throw new TypeError("A canonical command envelope is required.");
    }
    const message = {
      source: INBOUND_SOURCE,
      type: "deucarian-command",
      transport_id: this.transportId,
      message: envelope
    };
    if (!this.ready) {
      if (this.queue.length >= this.maximumPendingCommands) {
        throw new Error("The pre-ready command queue is full.");
      }
      this.queue.push(message);
      return false;
    }
    this.post(message);
    return true;
  }

  dispose() {
    if (!this.started) return;
    if (this.mode === "iframe") {
      window.removeEventListener("message", this.onWindowMessage, false);
    } else {
      ["deucarian-command-ready", "deucarian-command-response", "deucarian-command-event"]
        .forEach(type => window.removeEventListener(type, this.onDirectMessage, false));
    }
    this.queue = [];
    this.listeners.clear();
    this.ready = false;
    this.started = false;
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
        message.transport_id !== this.transportId) return;
    if (message.type === "deucarian-command-ready") {
      this.ready = true;
      const pending = this.queue.splice(0);
      pending.forEach(item => this.post(item));
    }
    this.emit(message.type, message);
  }

  post(message) {
    if (this.mode === "iframe") {
      this.targetWindow.postMessage(message, this.targetOrigin);
    } else {
      window.dispatchEvent(new CustomEvent("deucarian-command", { detail: message }));
    }
  }

  emit(type, message) {
    (this.listeners.get(type) || []).forEach(listener => listener(message));
  }
}

export function createLegacyUnityDirectSender(
  unityInstance,
  receiverObject = "ViewerCommandReceiver",
  receiverMethod = "ReceiveCommandJson") {
  if (!unityInstance || typeof unityInstance.SendMessage !== "function") {
    throw new TypeError("A Unity instance with SendMessage is required.");
  }
  return envelope => unityInstance.SendMessage(
    receiverObject,
    receiverMethod,
    JSON.stringify(envelope));
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
