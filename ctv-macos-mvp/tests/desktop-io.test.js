import assert from "node:assert/strict";
import test from "node:test";

import { canUseDesktopFileDialog, openTextFileDesktop, saveTextFileDesktop } from "../src/desktop-io.js";

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
