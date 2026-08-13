import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

class FakeWindow {
  constructor() {
    this.listeners = new Map();
    this.parent = { posts: [], postMessage: (message, origin) => this.parent.posts.push({ message, origin }) };
  }

  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }
  dispatchEvent() { }
}

test("jslib accepts only the configured parent and cleans up", async () => {
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
    CustomEvent: class {},
    JSON,
    Object,
    setTimeout,
    LibraryManager: { library },
    mergeInto: (target, additions) => Object.assign(target, additions),
    UTF8ToString: id => strings.get(id),
    SendMessage: (...args) => received.push(args)
  });
  vm.runInContext(source, context);

  library.DeucarianWebGlCommandInstall(ptr(JSON.stringify({
    transport_id: "viewer",
    mode: "parent_iframe",
    allowed_origins: ["https://host.example"],
    target_origin: "https://host.example",
    receiver_object: "Receiver",
    receiver_method: "Receive",
    maximum_message_characters: 4096
  })));
  const listener = fakeWindow.listeners.get("message");
  const command = {
    source: "deucarian-command-host",
    type: "deucarian-command",
    transport_id: "viewer",
    message: { command: "ping", payload: {} }
  };
  listener({ source: {}, origin: "https://host.example", data: command });
  listener({ source: fakeWindow.parent, origin: "https://evil.example", data: command });
  assert.equal(received.length, 0);
  listener({ source: fakeWindow.parent, origin: "https://host.example", data: command });
  assert.equal(received.length, 1);
  assert.match(received[0][2], /parent:https:\/\/host\.example/);

  library.DeucarianWebGlCommandNotifyReady(ptr("viewer"));
  assert.equal(fakeWindow.parent.posts.length, 0, "ready must not flush commands during bridge Start");
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(fakeWindow.parent.posts[0].origin, "https://host.example");
  assert.notEqual(fakeWindow.parent.posts[0].origin, "*");

  const readyCount = fakeWindow.parent.posts.length;
  library.DeucarianWebGlCommandNotifyReady(ptr("viewer"));
  library.DeucarianWebGlCommandUninstall(ptr("viewer"));
  library.DeucarianWebGlCommandInstall(ptr(JSON.stringify({
    transport_id: "viewer",
    mode: "parent_iframe",
    allowed_origins: ["https://host.example"],
    target_origin: "https://host.example",
    receiver_object: "Receiver",
    receiver_method: "Receive",
    maximum_message_characters: 4096
  })));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(fakeWindow.parent.posts.length, readyCount, "a stopped generation must not emit ready");

  library.DeucarianWebGlCommandUninstall(ptr("viewer"));
  assert.equal(fakeWindow.listeners.has("message"), false);
});
