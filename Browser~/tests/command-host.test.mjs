import assert from "node:assert/strict";
import test from "node:test";

class FakeWindow extends EventTarget {
  constructor() {
    super();
    this.posts = [];
  }

  postMessage(message, targetOrigin) {
    this.posts.push({ message, targetOrigin });
  }
}

class FakeIframe extends EventTarget {
  constructor(contentWindow) {
    super();
    this.contentWindow = contentWindow;
  }
}

const browserWindow = new FakeWindow();
globalThis.window = browserWindow;
globalThis.CustomEvent = class extends Event {
  constructor(type, options = {}) {
    super(type);
    this.detail = options.detail;
  }
};

const { DeucarianCommandHost } = await import("../deucarian-command-host.js");

function messageEvent(source, origin, data) {
  const event = new Event("message");
  Object.defineProperties(event, {
    source: { value: source },
    origin: { value: origin },
    data: { value: data }
  });
  return event;
}

function lifecycle(type, generation, hostSession) {
  return {
    source: "deucarian-command-transport",
    type,
    transport_id: "viewer",
    connection_generation: generation,
    host_session: hostSession
  };
}

function latestProbe(targetWindow) {
  return targetWindow.posts.findLast(entry =>
    entry.message.type === "deucarian-command-probe").message;
}

test("iframe queues commands and validates source, origin, and generation", () => {
  const viewerWindow = new FakeWindow();
  const host = new DeucarianCommandHost({
    transportId: "viewer",
    targetWindow: viewerWindow,
    targetOrigin: "https://viewer.example"
  });
  let readyEvents = 0;
  const unsubscribe = host.on("deucarian-command-ready", () => readyEvents++);
  host.start();
  assert.equal(viewerWindow.posts[0].message.type, "deucarian-command-probe");
  const hostSession = viewerWindow.posts[0].message.host_session;
  viewerWindow.posts.length = 0;
  assert.equal(host.sendCommand({ command: "initialize_viewer", payload: {} }), false);
  assert.equal(host.sendCommand({ command: "select_activity", payload: { revision: 2 } }), false);

  const ready = lifecycle("deucarian-command-ready", 1, hostSession);
  browserWindow.dispatchEvent(
    messageEvent(new FakeWindow(), "https://viewer.example", ready));
  browserWindow.dispatchEvent(
    messageEvent(viewerWindow, "https://wrong.example", ready));
  assert.equal(viewerWindow.posts.length, 0);

  browserWindow.dispatchEvent(
    messageEvent(viewerWindow, "https://viewer.example", ready));
  assert.equal(host.isReady, true);
  assert.equal(host.connectionGeneration, 1);
  assert.equal(host.pendingCommandCount, 0);
  assert.equal(readyEvents, 1);
  assert.equal(viewerWindow.posts.length, 2);
  assert.equal(viewerWindow.posts[0].targetOrigin, "https://viewer.example");
  assert.equal(viewerWindow.posts[0].message.connection_generation, 1);
  assert.equal(viewerWindow.posts[0].message.message.command, "initialize_viewer");
  assert.equal(viewerWindow.posts[1].message.message.command, "select_activity");

  unsubscribe();
  host.dispose();
  browserWindow.dispatchEvent(
    messageEvent(viewerWindow, "https://viewer.example", ready));
  assert.equal(viewerWindow.posts.length, 2);
});

test("downtime resets readiness and replays queued commands on a newer generation", () => {
  const viewerWindow = new FakeWindow();
  const iframe = new FakeIframe(viewerWindow);
  const host = new DeucarianCommandHost({
    iframe,
    targetOrigin: "https://viewer.example"
  });
  host.start();
  const initialSession = latestProbe(viewerWindow).host_session;
  viewerWindow.posts.length = 0;
  browserWindow.dispatchEvent(messageEvent(
    viewerWindow,
    "https://viewer.example",
    lifecycle("deucarian-command-ready", 4, initialSession)));
  assert.equal(host.isReady, true);

  browserWindow.dispatchEvent(messageEvent(
    viewerWindow,
    "https://viewer.example",
    lifecycle("deucarian-command-unavailable", 4, initialSession)));
  assert.equal(host.isReady, false);
  assert.equal(host.sendCommand({ command: "latest_state", payload: { revision: 8 } }), false);
  assert.equal(host.pendingCommandCount, 1);

  browserWindow.dispatchEvent(messageEvent(
    viewerWindow,
    "https://viewer.example",
    lifecycle("deucarian-command-ready", 3, initialSession)));
  assert.equal(viewerWindow.posts.length, 0, "stale readiness cannot flush the queue");
  browserWindow.dispatchEvent(messageEvent(
    viewerWindow,
    "https://viewer.example",
    lifecycle("deucarian-command-ready", 5, initialSession)));
  assert.equal(viewerWindow.posts.length, 1);
  assert.equal(viewerWindow.posts[0].message.connection_generation, 5);
  assert.equal(viewerWindow.posts[0].message.message.command, "latest_state");

  iframe.dispatchEvent(new Event("load"));
  assert.equal(host.isReady, false);
  assert.equal(viewerWindow.posts.at(-1).message.type, "deucarian-command-probe");
  const reloadedSession = latestProbe(viewerWindow).host_session;
  assert.notEqual(reloadedSession, initialSession);
  browserWindow.dispatchEvent(messageEvent(
    viewerWindow,
    "https://viewer.example",
    lifecycle("deucarian-command-ready", 1, reloadedSession)));
  assert.equal(host.isReady, true, "a new iframe document can restart at generation 1");
  assert.equal(host.connectionGeneration, 1);
  host.stop();
  host.start();
  host.dispose();
});

test("replaceTarget rejects old iframe messages and uses the new exact origin", () => {
  const first = new FakeWindow();
  const second = new FakeWindow();
  const host = new DeucarianCommandHost({
    targetWindow: first,
    targetOrigin: "https://first.example"
  });
  host.start();
  const firstSession = latestProbe(first).host_session;
  first.posts.length = 0;
  host.replaceTarget(second, "https://second.example");
  assert.equal(second.posts[0].message.type, "deucarian-command-probe");
  const secondSession = latestProbe(second).host_session;
  second.posts.length = 0;

  browserWindow.dispatchEvent(messageEvent(
    first,
    "https://first.example",
    lifecycle("deucarian-command-ready", 1, firstSession)));
  assert.equal(host.isReady, false);
  browserWindow.dispatchEvent(messageEvent(
    second,
    "https://second.example",
    lifecycle(
      "deucarian-command-ready",
      1,
      secondSession)));
  assert.equal(host.isReady, true);
  host.sendCommand({ command: "ping", payload: {} });
  assert.equal(second.posts[0].targetOrigin, "https://second.example");
  host.dispose();
});

test("iframe waits for contentWindow and probes after its first load", () => {
  const iframe = new FakeIframe(null);
  const host = new DeucarianCommandHost({
    iframe,
    targetOrigin: "https://viewer.example"
  });

  assert.doesNotThrow(() => host.start());
  const viewerWindow = new FakeWindow();
  iframe.contentWindow = viewerWindow;
  iframe.dispatchEvent(new Event("load"));

  const probe = latestProbe(viewerWindow);
  assert.equal(probe.type, "deucarian-command-probe");
  browserWindow.dispatchEvent(messageEvent(
    viewerWindow,
    "https://viewer.example",
    lifecycle("deucarian-command-ready", 1, probe.host_session)));
  assert.equal(host.isReady, true);
  host.dispose();
});

test("stale responses and events are rejected across connection generations", () => {
  const viewerWindow = new FakeWindow();
  const host = new DeucarianCommandHost({
    targetWindow: viewerWindow,
    targetOrigin: "https://viewer.example"
  });
  const accepted = [];
  host.on("deucarian-command-response", message => accepted.push(message));
  host.start();
  const session = latestProbe(viewerWindow).host_session;
  browserWindow.dispatchEvent(messageEvent(
    viewerWindow,
    "https://viewer.example",
    lifecycle("deucarian-command-ready", 2, session)));

  browserWindow.dispatchEvent(messageEvent(
    viewerWindow,
    "https://viewer.example",
    { ...lifecycle("deucarian-command-response", 1, session), message: { ok: false } }));
  browserWindow.dispatchEvent(messageEvent(
    viewerWindow,
    "https://viewer.example",
    { ...lifecycle("deucarian-command-response", 2, "old-session"), message: { ok: false } }));
  browserWindow.dispatchEvent(messageEvent(
    viewerWindow,
    "https://viewer.example",
    { ...lifecycle("deucarian-command-response", 2, session), message: { ok: true } }));

  assert.deepEqual(accepted.map(entry => entry.message), [{ ok: true }]);
  host.dispose();
});

test("dispose before start is terminal and oversize commands fail explicitly", () => {
  const disposed = new DeucarianCommandHost();
  disposed.dispose();
  assert.throws(() => disposed.start(), /disposed/);
  assert.throws(() => disposed.on("event", () => {}), /disposed/);

  const active = new DeucarianCommandHost({ maximumMessageCharacters: 24 });
  active.start();
  assert.throws(
    () => active.sendCommand({ command: "message_that_is_too_large", payload: {} }),
    error => error instanceof RangeError && error.code === "message_too_large");
  active.dispose();
});

test("iframe rejects wildcard target origin", () => {
  assert.throws(() => new DeucarianCommandHost({
    targetWindow: new FakeWindow(),
    targetOrigin: "*"
  }));
});
