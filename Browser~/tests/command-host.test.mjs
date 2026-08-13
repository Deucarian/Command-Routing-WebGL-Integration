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

test("iframe queues commands and validates source plus origin", () => {
  const viewerWindow = new FakeWindow();
  const host = new DeucarianCommandHost({
    transportId: "viewer",
    targetWindow: viewerWindow,
    targetOrigin: "https://viewer.example"
  });
  host.start();
  assert.equal(host.sendCommand({ command: "initialize_viewer", payload: {} }), false);
  assert.equal(host.sendCommand({ command: "select_activity", payload: { revision: 2 } }), false);

  const ready = {
    source: "deucarian-command-transport",
    type: "deucarian-command-ready",
    transport_id: "viewer"
  };
  browserWindow.dispatchEvent(messageEvent(new FakeWindow(), "https://viewer.example", ready));
  browserWindow.dispatchEvent(messageEvent(viewerWindow, "https://wrong.example", ready));
  assert.equal(viewerWindow.posts.length, 0);

  browserWindow.dispatchEvent(messageEvent(viewerWindow, "https://viewer.example", ready));
  assert.equal(viewerWindow.posts.length, 2);
  assert.equal(viewerWindow.posts[0].targetOrigin, "https://viewer.example");
  assert.equal(viewerWindow.posts[0].message.message.command, "initialize_viewer");
  assert.equal(viewerWindow.posts[1].message.message.command, "select_activity");

  host.dispose();
  browserWindow.dispatchEvent(messageEvent(viewerWindow, "https://viewer.example", ready));
  assert.equal(viewerWindow.posts.length, 2);
});

test("iframe rejects wildcard target origin", () => {
  assert.throws(() => new DeucarianCommandHost({
    targetWindow: new FakeWindow(),
    targetOrigin: "*"
  }));
});
