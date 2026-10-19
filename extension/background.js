// Only numeric aggregates. Session storage is inaccessible to content scripts by default.
let queue = Promise.resolve();
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (
    msg.type === "reset" &&
    !sender.tab &&
    sender.url === chrome.runtime.getURL("popup.html") &&
    Number.isInteger(msg.tabId)
  ) {
    queue = queue
      .then(async () => {
        await chrome.storage.session.remove(`tab:${msg.tabId}`);
        reply({ ok: true });
      })
      .catch(() => reply({ ok: false }));
    return true;
  }
  if (msg.type !== "trial" || !sender.tab || sender.frameId !== 0) return;
  queue = queue
    .then(async () => {
      if (!["visible", "hidden"].includes(msg.mode)) return;
      const delta = msg.delta;
      if (
        !delta ||
        Object.keys(delta).some(
          (k) => !["clicks", "predictions", "correct", "keyboard"].includes(k),
        ) ||
        Object.values(delta).some((v) => v !== 0 && v !== 1)
      )
        return;
      const key = `tab:${sender.tab.id}`,
        data = (await chrome.storage.session.get(key))[key] || {
          visible: { clicks: 0, predictions: 0, correct: 0, keyboard: 0 },
          hidden: { clicks: 0, predictions: 0, correct: 0, keyboard: 0 },
        };
      for (const [k, v] of Object.entries(delta)) data[msg.mode][k] += v;
      await chrome.storage.session.set({ [key]: data });
      reply({ ok: true });
    })
    .catch(() => reply({ ok: false }));
  return true;
});
chrome.tabs.onRemoved.addListener((id) => {
  queue = queue.then(() => chrome.storage.session.remove(`tab:${id}`));
});
