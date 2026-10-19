(() => {
  if (globalThis.nextClickController) return;
  const controller = new NextClickLab.Predictor(document, {
    onTrial: (mode, delta) => {
      chrome.runtime
        .sendMessage({ type: "trial", mode, delta })
        .catch(() => controller.stop());
    },
  });
  globalThis.nextClickController = controller;
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type === "start")
      controller.start(msg.mode === "hidden" ? "hidden" : "visible");
    if (msg.type === "stop") controller.stop();
    if (["start", "stop", "status"].includes(msg.type))
      reply(controller.status());
  });
})();
