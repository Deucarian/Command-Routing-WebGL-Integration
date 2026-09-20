import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../../Runtime/Plugins/WebGL/DeucarianCommandRoutingWebGL.jslib", import.meta.url), "utf8");
for (const protocol of ["simultria", "deucarian"]) {
  for (const mode of ["parent_iframe", "direct_page"]) {
    test(`${protocol} ${mode} negotiates once and preserves origin, session and generation guards`, async () => {
      const events = [];
      const delivered = [];
      const listeners = new Map();
      const library = {};
      const parent = { postMessage: (message, origin) => events.push({ message, origin }) };
      const window = {
        parent,
        addEventListener: (type, listener) => listeners.set(type, listener),
        removeEventListener: type => listeners.delete(type),
        dispatchEvent: event => events.push({ message: event.detail, type: event.type })
      };
      vm.runInNewContext(source, {
        window, document: { referrer: "https://host.example/project" }, URL,
        LibraryManager: { library }, mergeInto: (target, entries) => Object.assign(target, entries),
        UTF8ToString: value => value, stringToNewUTF8: value => value, setTimeout,
        SendMessage: (...args) => delivered.push(JSON.parse(args[2])),
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
      });
      library.DeucarianWebGlCommandInstall(JSON.stringify({
        transport_id: "viewer", mode, allowed_origins: ["https://host.example"],
        target_origin: mode === "parent_iframe" ? "https://host.example" : "",
        receiver_object: "Receiver", receiver_method: "Receive", maximum_message_characters: 128
      }));
      library.DeucarianWebGlCommandNotifyReady("viewer");
      await new Promise(resolve => setTimeout(resolve, 0));
      const send = (data, overrides = {}) => {
        if (mode === "parent_iframe") listeners.get("message")({ source: parent, origin: "https://host.example", data, ...overrides });
        else listeners.get(data.type)?.({ detail: data });
      };
      const probe = { source: protocol + "-command-host", type: protocol + "-command-probe", transport_id: "viewer", host_session: "host-one" };
      if (mode === "parent_iframe") {
        const before = events.length;
        send(probe, { origin: "https://evil.example" });
        send(probe, { source: {} });
        assert.equal(events.length, before);
      }
      send(probe);
      const ready = events.at(-1).message;
      assert.equal(ready.type, protocol + "-command-ready");
      assert.equal(ready.source, protocol + "-command-transport");
      assert.equal(ready.host_session, "host-one");
      if (mode === "direct_page") assert.equal(events.at(-1).type, ready.type);
      const command = { ...probe, type: protocol + "-command", connection_generation: ready.connection_generation, message: { command: "ping" } };
      send({ ...command, host_session: "stale" });
      send({ ...command, connection_generation: ready.connection_generation + 1 });
      const other = protocol === "simultria" ? "deucarian" : "simultria";
      send({ ...command, source: other + "-command-host", type: other + "-command" });
      send({ ...command, type: other + "-command" });
      send({ ...command, message: "x".repeat(129) });
      assert.equal(delivered.length, 0);
      send(command);
      assert.equal(delivered.length, 1);
      assert.equal(JSON.parse(delivered[0].message).command, "ping");
      library.DeucarianWebGlCommandSend("viewer", JSON.stringify({ success: true }), "");
      assert.equal(events.at(-1).message.type, protocol + "-command-response");
      library.DeucarianWebGlCommandSendEvent("viewer", "viewer_ready", "{}", "");
      assert.equal(events.at(-1).message.type, protocol + "-command-event");
      library.DeucarianWebGlCommandUninstall("viewer");
      assert.equal(events.at(-1).message.type, protocol + "-command-unavailable");
      assert.equal(listeners.size, 0);
    });
  }
}
