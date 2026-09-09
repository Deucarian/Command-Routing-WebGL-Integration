import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL(
  "../../Runtime/Plugins/WebGL/DeucarianCommandRoutingWebGL.jslib",
  import.meta.url), "utf8");

function createHarness() {
  const listeners = new Map();
  const library = {};
  const window = {
    parent: { postMessage() {} },
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: type => listeners.delete(type)
  };
  vm.runInNewContext(source, {
    window,
    LibraryManager: { library },
    mergeInto: Object.assign,
    UTF8ToString: value => value
  });
  return { window, listeners, library };
}

const valid = {
  transport_id: "viewer",
  mode: "parent_iframe",
  allowed_origins: ["https://host.example"],
  target_origin: "https://host.example",
  receiver_object: "Receiver",
  receiver_method: "Receive",
  maximum_message_characters: 4096
};

test("stripped empty configuration cannot create an unnamed transport", () => {
  const { window, listeners, library } = createHarness();
  assert.throws(() => library.DeucarianWebGlCommandInstall("{}"),
    /configuration is incomplete or invalid/);
  assert.equal(window.__deucarianCommandRouting, undefined);
  assert.equal(listeners.size, 0);
});

test("invalid replacement leaves the running transport and listener intact", () => {
  const { window, listeners, library } = createHarness();
  library.DeucarianWebGlCommandInstall(JSON.stringify(valid));
  const transport = window.__deucarianCommandRouting.transports.viewer;
  const listener = listeners.get("message");
  const invalidConfigurations = [
    null,
    [],
    ...Object.keys(valid).map(key => {
      const incomplete = { ...valid };
      delete incomplete[key];
      return incomplete;
    }),
    { ...valid, mode: "unexpected" },
    { ...valid, allowed_origins: "https://host.example" },
    { ...valid, allowed_origins: [null] },
    { ...valid, target_origin: "https://other.example" },
    { ...valid, allowed_origins: ["*"], target_origin: "*" },
    { ...valid, maximum_message_characters: "4096" },
    { ...valid, maximum_message_characters: 0 },
    { ...valid, maximum_message_characters: 1.5 }
  ];
  for (const configuration of invalidConfigurations) {
    assert.throws(() => library.DeucarianWebGlCommandInstall(
      JSON.stringify(configuration)), /configuration is incomplete or invalid/);
    assert.equal(window.__deucarianCommandRouting.transports.viewer, transport);
    assert.equal(window.__deucarianCommandRouting.nextGeneration, 1);
    assert.equal(listeners.get("message"), listener);
    assert.deepEqual(Object.keys(window.__deucarianCommandRouting.transports),
      ["viewer"]);
  }
});
