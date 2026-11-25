import assert from "node:assert/strict";
import test from "node:test";

import {
  canUseDesktopFileDialog,
  canUseTauriCommandBridge,
  invokeTauriCommand,
  openTextFileDesktop,
  saveBinaryFileDesktop,
  saveTextFileDesktop,
} from "../src/desktop-io.js";

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
  assert.deepEqual(calls.map((call) => call[0]), ["save", "write_text_file", "open", "read_file_bytes", "read_text_file"]);

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
  assert.deepEqual(calls.map((call) => call[0]), ["plugin:dialog|save", "write_text_file", "plugin:dialog|open", "read_file_bytes", "read_text_file", "sdk_scan_devices"]);

  globalThis.window = originalWindow;
});

test("desktop dialogs treat user cancellation as handled without invoking file commands", async () => {
  const originalWindow = globalThis.window;
  const commands = [];
  try {
    globalThis.window = {
      __TAURI__: {
        dialog: {
          save: async () => null,
          open: async () => ["/tmp/one.csv", "/tmp/two.csv"],
        },
        core: {
          invoke: async (command) => commands.push(command),
        },
      },
    };

    assert.deepEqual(await saveTextFileDesktop({ filename: "demo.csv", contents: "K,50" }), {
      handled: true,
      path: "",
      canceled: true,
    });
    assert.deepEqual(await openTextFileDesktop(), {
      handled: true,
      path: "",
      contents: "",
      canceled: true,
    });
    assert.deepEqual(commands, []);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("desktop binary save converts bytes and selects the ICC filter", async () => {
  const originalWindow = globalThis.window;
  const calls = [];
  try {
    globalThis.window = {
      __TAURI__: {
        dialog: {
          save: async (options) => {
            calls.push(["save", options]);
            return "/tmp/profile.icc";
          },
          open: async () => null,
        },
        core: {
          invoke: async (command, payload) => calls.push([command, payload]),
        },
      },
    };

    const result = await saveBinaryFileDesktop({
      filename: "profile.icc",
      contents: new Uint8Array([0, 127, 255]),
    });

    assert.deepEqual(result, { handled: true, path: "/tmp/profile.icc" });
    assert.deepEqual(calls[0][1].filters, [{ name: "ICC Profile", extensions: ["icc", "icm"] }]);
    assert.deepEqual(calls[1], ["write_binary_file", { path: "/tmp/profile.icc", contents: [0, 127, 255] }]);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("desktop file IO exposes bridge failures to the UI error boundary", async () => {
  const originalWindow = globalThis.window;
  try {
    delete globalThis.window;
    await assert.rejects(invokeTauriCommand("read_text_file"), /Tauri command bridge is unavailable/);

    globalThis.window = {
      __TAURI__: {
        dialog: {
          save: async () => "/tmp/demo.json",
          open: async () => "/tmp/demo.json",
        },
        core: {
          invoke: async (command) => {
            throw new Error(`${command} denied`);
          },
        },
      },
    };

    await assert.rejects(
      saveTextFileDesktop({ filename: "demo.json", contents: "{}" }),
      /write_text_file denied/
    );
    await assert.rejects(openTextFileDesktop(), /read_text_file denied/);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("review M5: text files are decoded as UTF-8, UTF-16 with BOM or GB18030", async () => {
  const { decodeTextBytes } = await import("../src/desktop-io.js");
  const utf16 = new Uint8Array([0xff, 0xfe, ...Array.from("C,50").flatMap((ch) => [ch.charCodeAt(0), 0])]);
  assert.equal(decodeTextBytes(utf16), "C,50");
  assert.equal(decodeTextBytes(new TextEncoder().encode("﻿纸白,95")), "纸白,95");
  const gb = new Uint8Array([0xd6, 0xbd, 0xb0, 0xd7]); // "纸白" in GB18030
  assert.equal(decodeTextBytes(gb), "纸白");
});
