import assert from "node:assert/strict";
import test from "node:test";

import { canUseDesktopFileDialog, canUseTauriCommandBridge, invokeTauriCommand, openTextFileDesktop, saveTextFileDesktop } from "../src/desktop-io.js";

test("desktop file IO reports unavailable outside Tauri", async () => {
  const originalWindow = globalThis.window;
  delete globalThis.window;

  assert.equal(canUseDesktopFileDialog(), false);
  assert.deepEqual(await saveTextFileDesktop({ filename: "demo.json", contents: "{}" }), { handled: false, path: "" });
  assert.deepEqual(await openTextFileDesktop(), { handled: false, path: "", contents: "" });

  globalThis.window = originalWindow;
});

test("desktop file IO uses Tauri dialog and command bridge", async () => {
  const originalWindow = globalThis.window;
  const calls = [];
  globalThis.window = {
    __TAURI__: {
      dialog: {
        save: async (options) => {
          calls.push(["save", options.defaultPath]);
          return "/tmp/demo.json";
        },
        open: async () => {
          calls.push(["open"]);
          return "/tmp/demo.json";
        },
      },
      core: {
        invoke: async (command, payload) => {
          calls.push([command, payload.path, payload.contents || ""]);
          return command === "read_text_file" ? "{\"ok\":true}" : payload.path;
        },
      },
    },
  };

  assert.equal(canUseDesktopFileDialog(), true);
  assert.deepEqual(await saveTextFileDesktop({ filename: "demo.json", contents: "{}" }), { handled: true, path: "/tmp/demo.json" });
  assert.deepEqual(await openTextFileDesktop(), { handled: true, path: "/tmp/demo.json", contents: "{\"ok\":true}" });
  assert.deepEqual(calls.map((call) => call[0]), ["save", "write_text_file", "open", "read_text_file"]);

  globalThis.window = originalWindow;
});

test("desktop file IO works without global Tauri API", async () => {
  const originalWindow = globalThis.window;
  const calls = [];
  globalThis.window = {
    __TAURI_INTERNALS__: {
      invoke: async (command, payload) => {
        calls.push([command, payload]);
        if (command === "plugin:dialog|save") return "/tmp/no-global.json";
        if (command === "plugin:dialog|open") return "/tmp/no-global.json";
        if (command === "read_text_file") return "{\"ok\":\"internal\"}";
        return payload.path;
      },
    },
  };

  assert.equal(canUseDesktopFileDialog(), true);
  assert.equal(canUseTauriCommandBridge(), true);
  assert.deepEqual(await saveTextFileDesktop({ filename: "demo.json", contents: "{}" }), { handled: true, path: "/tmp/no-global.json" });
  assert.deepEqual(await openTextFileDesktop(), { handled: true, path: "/tmp/no-global.json", contents: "{\"ok\":\"internal\"}" });
  assert.deepEqual(await invokeTauriCommand("sdk_scan_devices"), undefined);
  assert.deepEqual(calls.map((call) => call[0]), ["plugin:dialog|save", "write_text_file", "plugin:dialog|open", "read_text_file", "sdk_scan_devices"]);

  globalThis.window = originalWindow;
});
