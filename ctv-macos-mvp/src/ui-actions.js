export function bindAsyncAction(element, action, options = {}) {
  if (!element?.addEventListener || typeof action !== "function") return false;
  const eventName = options.eventName || "click";
  element.addEventListener(eventName, async (event) => {
    try {
      await action(event);
    } catch (error) {
      const prefix = options.errorPrefix || "操作失败";
      const message = `${prefix}：${error.message || error}`;
      const onError = options.onError || ((text) => globalThis.window?.alert?.(text));
      onError(message, error);
    }
  });
  return true;
}
