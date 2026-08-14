import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { DeucarianCommandHost } from "../deucarian-command-host.js";

class FakeWindow {
  constructor() {
    this.listeners = new Map();
    this.parent = {
      posts: [],
      postMessage: (message, origin) => this.parent.posts.push({ message, origin })
    };
  }

  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }
  dispatchEvent(event) {
    this.listeners.get(event.type)?.(event);
    return true;
  }
}

function command(generation, hostSession, message) {
  return {
    source: "deucarian-command-host",
    type: "deucarian-command",
    transport_id: "viewer",
    connection_generation: generation,
    host_session: hostSession,
    message
  };
}

test("jslib enforces origin, generation, size, lifecycle, and cleanup", async () => {
  const source = await readFile(
    new URL("../../Runtime/Plugins/WebGL/DeucarianCommandRoutingWebGL.jslib", import.meta.url),
    "utf8");
  const fakeWindow = new FakeWindow();
  const received = [];
  const library = {};
  const strings = new Map();
  let pointer = 1;
  const ptr = value => { const id = pointer++; strings.set(id, value); return id; };
  const context = vm.createContext({
    window: fakeWindow,
    document: { referrer: "https://host.example/path" },
    URL,
    CustomEvent: class {},
    JSON,
    Object,
    setTimeout,
    LibraryManager: { library },
    mergeInto: (target, additions) => Object.assign(target, additions),
    UTF8ToString: id => strings.get(id),
    stringToNewUTF8: value => value,
    SendMessage: (...args) => received.push(args)
  });
  vm.runInContext(source, context);

  const configuration = {
    transport_id: "viewer",
    mode: "parent_iframe",
    allowed_origins: ["https://host.example"],
    target_origin: "https://host.example",
    receiver_object: "Receiver",
    receiver_method: "Receive",
    maximum_message_characters: 96
  };
  library.DeucarianWebGlCommandInstall(ptr(JSON.stringify(configuration)));
  const listener = fakeWindow.listeners.get("message");
  const hostSession = "host-session-1";
  const valid = command(1, hostSession, { command: "ping", payload: {} });
  listener({ source: {}, origin: "https://host.example", data: valid });
  listener({ source: fakeWindow.parent, origin: "https://evil.example", data: valid });
  assert.equal(received.length, 0);

  listener({
    source: fakeWindow.parent,
    origin: "https://host.example",
    data: {
      source: "deucarian-command-host",
      type: "deucarian-command-probe",
      transport_id: "viewer",
      host_session: hostSession
    }
  });

  listener({ source: fakeWindow.parent, origin: "https://host.example", data: valid });
  assert.equal(received.length, 1);
  assert.match(received[0][2], /parent:https:\/\/host\.example/);
  assert.match(received[0][2], /connection_generation/);

  listener({
    source: fakeWindow.parent,
    origin: "https://host.example",
    data: command(0, hostSession, { command: "stale" })
  });
  assert.equal(
    fakeWindow.parent.posts.at(-1).message.error_code,
    "stale_connection_generation");

  listener({
    source: fakeWindow.parent,
    origin: "https://host.example",
    data: command(1, hostSession, { command: "oversize", payload: "x".repeat(200) })
  });
  assert.equal(fakeWindow.parent.posts.at(-1).message.error_code, "message_too_large");

  const postsBeforeReady = fakeWindow.parent.posts.length;
  library.DeucarianWebGlCommandNotifyReady(ptr("viewer"));
  assert.equal(
    fakeWindow.parent.posts.length,
    postsBeforeReady,
    "ready must not emit synchronously during bridge Start");
  await new Promise(resolve => setTimeout(resolve, 0));
  const ready = fakeWindow.parent.posts.at(-1);
  assert.equal(ready.origin, "https://host.example");
  assert.equal(ready.message.type, "deucarian-command-ready");
  assert.equal(ready.message.connection_generation, 1);

  const postsBeforeProbe = fakeWindow.parent.posts.length;
  listener({
    source: fakeWindow.parent,
    origin: "https://host.example",
    data: {
      source: "deucarian-command-host",
      type: "deucarian-command-probe",
      transport_id: "viewer",
      host_session: hostSession
    }
  });
  assert.equal(fakeWindow.parent.posts.length, postsBeforeProbe + 1);
  assert.equal(fakeWindow.parent.posts.at(-1).message.type, "deucarian-command-ready");
  assert.equal(fakeWindow.parent.posts.at(-1).message.host_session, hostSession);

  library.DeucarianWebGlCommandUninstall(ptr("viewer"));
  assert.equal(fakeWindow.parent.posts.at(-1).message.type, "deucarian-command-unavailable");
  assert.equal(fakeWindow.listeners.has("message"), false);

  assert.equal(
    library.DeucarianWebGlCommandGetParentOrigin(),
    "https://host.example");
});

test("real direct-page host delivers a command through the jslib to Unity", async () => {
  const source = await readFile(
    new URL("../../Runtime/Plugins/WebGL/DeucarianCommandRoutingWebGL.jslib", import.meta.url),
    "utf8");
  const fakeWindow = new FakeWindow();
  const received = [];
  const library = {};
  const strings = new Map();
  let pointer = 1;
  const ptr = value => { const id = pointer++; strings.set(id, value); return id; };
  class DirectCustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }
  const previousCustomEvent = globalThis.CustomEvent;
  globalThis.CustomEvent = DirectCustomEvent;

  try {
    vm.runInContext(source, vm.createContext({
      window: fakeWindow,
      document: { referrer: "" },
      URL,
      CustomEvent: DirectCustomEvent,
      JSON,
      Object,
      setTimeout,
      LibraryManager: { library },
      mergeInto: (target, additions) => Object.assign(target, additions),
      UTF8ToString: id => strings.get(id),
      stringToNewUTF8: value => value,
      SendMessage: (...args) => received.push(args)
    }));

    library.DeucarianWebGlCommandInstall(ptr(JSON.stringify({
      transport_id: "viewer",
      mode: "direct_page",
      allowed_origins: [],
      target_origin: "",
      receiver_object: "Receiver",
      receiver_method: "Receive",
      maximum_message_characters: 4096
    })));

    const host = new DeucarianCommandHost({
      transportId: "viewer",
      hostWindow: fakeWindow
    });
    host.start();
    library.DeucarianWebGlCommandNotifyReady(ptr("viewer"));
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(host.isReady, true);
    assert.equal(host.sendCommand({
      protocol_version: 1,
      command_id: "direct-command-1",
      command: "initialize_viewer",
      payload: { project_id: 7 }
    }), true);
    assert.equal(received.length, 1);
    assert.equal(received[0][0], "Receiver");
    assert.equal(received[0][1], "Receive");
    const delivered = JSON.parse(received[0][2]);
    assert.equal(delivered.remote_endpoint, "direct");
    assert.equal(delivered.connection_generation, 1);
    assert.equal(JSON.parse(delivered.message).command, "initialize_viewer");

    host.dispose();
    library.DeucarianWebGlCommandUninstall(ptr("viewer"));
  } finally {
    globalThis.CustomEvent = previousCustomEvent;
  }
});

test("reinstall uses a newer connection generation and cancels old ready", async () => {
  const source = await readFile(
    new URL("../../Runtime/Plugins/WebGL/DeucarianCommandRoutingWebGL.jslib", import.meta.url),
    "utf8");
  const fakeWindow = new FakeWindow();
  const library = {};
  const strings = new Map();
  let pointer = 1;
  const ptr = value => { const id = pointer++; strings.set(id, value); return id; };
  vm.runInContext(source, vm.createContext({
    window: fakeWindow,
    document: { referrer: "" },
    URL,
    CustomEvent: class {},
    JSON,
    Object,
    setTimeout,
    LibraryManager: { library },
    mergeInto: (target, additions) => Object.assign(target, additions),
    UTF8ToString: id => strings.get(id),
    stringToNewUTF8: value => value,
    SendMessage: () => {}
  }));
  const configuration = JSON.stringify({
    transport_id: "viewer",
    mode: "parent_iframe",
    allowed_origins: ["https://host.example"],
    target_origin: "https://host.example",
    receiver_object: "Receiver",
    receiver_method: "Receive",
    maximum_message_characters: 4096
  });

  library.DeucarianWebGlCommandInstall(ptr(configuration));
  library.DeucarianWebGlCommandNotifyReady(ptr("viewer"));
  library.DeucarianWebGlCommandUninstall(ptr("viewer"));
  library.DeucarianWebGlCommandInstall(ptr(configuration));
  library.DeucarianWebGlCommandNotifyReady(ptr("viewer"));
  await new Promise(resolve => setTimeout(resolve, 0));

  const readyMessages = fakeWindow.parent.posts
    .filter(item => item.message.type === "deucarian-command-ready");
  assert.equal(readyMessages.length, 1);
  assert.equal(readyMessages[0].message.connection_generation, 2);
  library.DeucarianWebGlCommandUninstall(ptr("viewer"));
});
