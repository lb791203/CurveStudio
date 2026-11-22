import assert from "node:assert/strict";
import test from "node:test";

import { bindAsyncAction } from "../src/ui-actions.js";

function fakeElement() {
  const listeners = new Map();
  return {
    addEventListener(name, listener) {
      listeners.set(name, listener);
    },
    dispatch(name, event = {}) {
      return listeners.get(name)?.(event);
    },
  };
}

test("bindAsyncAction forwards UI events to successful async actions", async () => {
  const element = fakeElement();
  const received = [];
  assert.equal(bindAsyncAction(element, async (event) => received.push(event.id)), true);

  await element.dispatch("click", { id: "load-sample" });

  assert.deepEqual(received, ["load-sample"]);
});

test("bindAsyncAction turns rejected UI actions into visible errors", async () => {
  const element = fakeElement();
  const messages = [];
  bindAsyncAction(element, async () => {
    throw new Error("HTTP 503");
  }, {
    errorPrefix: "示例数据加载失败",
    onError: (message) => messages.push(message),
  });

  await element.dispatch("click");

  assert.deepEqual(messages, ["示例数据加载失败：HTTP 503"]);
});

test("bindAsyncAction ignores missing UI elements", () => {
  assert.equal(bindAsyncAction(null, async () => {}), false);
});

test("bindAsyncAction uses the browser alert as its default error boundary", async () => {
  const originalWindow = globalThis.window;
  const messages = [];
  try {
    globalThis.window = { alert: (message) => messages.push(message) };
    const element = fakeElement();
    bindAsyncAction(element, async () => {
      throw new Error("offline");
    });

    await element.dispatch("click");

    assert.deepEqual(messages, ["操作失败：offline"]);
  } finally {
    globalThis.window = originalWindow;
  }
});
