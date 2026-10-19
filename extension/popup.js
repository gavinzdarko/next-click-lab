let tab,
  live = { enabled: false, mode: "visible" };
const $ = (id) => document.getElementById(id);
const blank = () => ({ clicks: 0, predictions: 0, correct: 0, keyboard: 0 });
async function send(msg) {
  return chrome.tabs.sendMessage(tab.id, msg);
}
function renderLive() {
  $("toggle").textContent = live.enabled ? "Turn off" : "Turn on";
  $("toggle").setAttribute("aria-pressed", String(live.enabled));
  $("status").textContent = live.enabled ? "On · this document" : "Off";
  $("mode").value = live.mode;
  $("score").textContent =
    live.mode === "hidden"
      ? "Heuristic score: hidden"
      : `Heuristic score: ${live.score == null ? "—" : live.score + " / 100"}`;
}
async function refresh() {
  try {
    live = await send({ type: "status" });
  } catch {
    live = { enabled: false, mode: $("mode").value };
  }
  if (!live.enabled) live.mode = $("mode").value;
  renderLive();
  if (live.blocked)
    $("error").textContent =
      "Paused: this page contains a password field. Use a non-sensitive fixture page.";
  const data = (await chrome.storage.session.get(`tab:${tab.id}`))[
    `tab:${tab.id}`
  ] || { visible: blank(), hidden: blank() };
  $("scores").replaceChildren();
  for (const mode of ["visible", "hidden"]) {
    const s = data[mode],
      card = document.createElement("div");
    card.className = "card";
    const h = document.createElement("h3");
    h.textContent =
      mode === "visible" ? "VISIBLE · highlighted" : "HIDDEN · no highlight";
    card.append(h);
    const nums = document.createElement("div");
    nums.className = "numbers";
    for (const [key, title] of [
      ["predictions", "Predictions"],
      ["clicks", "Actual clicks"],
      ["correct", "Correct"],
    ]) {
      const part = document.createElement("div"),
        n = document.createElement("strong"),
        label = document.createElement("span");
      n.textContent = s[key];
      label.textContent = title;
      part.append(n, label);
      nums.append(part);
    }
    card.append(nums);
    const rate = document.createElement("p");
    rate.className = "rates";
    const pct = (n) =>
      s.clicks ? `${((100 * n) / s.clicks).toFixed(1)}%` : "—";
    rate.textContent = `Hit rate ${pct(s.correct)} · coverage ${pct(s.predictions)} · n=${s.clicks} · keyboard ${s.keyboard}`;
    card.append(rate);
    $("scores").append(card);
  }
}
async function initialize() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = new URL(tab.url || "about:blank");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.hostname === "chromewebstore.google.com" ||
    url.hostname === "chrome.google.com"
  )
    throw new Error(
      "This page is unsupported. Open a non-sensitive HTTP(S) page.",
    );
  $("toggle").onclick = async () => {
    try {
      $("error").textContent = "";
      if (live.enabled) await send({ type: "stop" });
      else {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["core.js", "content.js"],
        });
        await send({ type: "start", mode: $("mode").value });
      }
      await refresh();
    } catch {
      $("error").textContent =
        "Could not run here. Chrome blocks internal pages, the Web Store and some managed pages. Try the local fixture.";
    }
  };
  $("mode").onchange = async () => {
    try {
      if (live.enabled) await send({ type: "start", mode: $("mode").value });
      else live.mode = $("mode").value;
      await refresh();
    } catch {
      $("error").textContent = "Reopen this popup after navigation.";
    }
  };
  $("clear").onclick = async () => {
    // Freeze input by stopping, reset aggregate, then restart without any old prediction.
    const enabled = live.enabled,
      mode = live.mode;
    if (enabled) await send({ type: "stop" });
    await chrome.runtime.sendMessage({ type: "reset", tabId: tab.id });
    if (enabled) await send({ type: "start", mode });
    await refresh();
  };
  await refresh();
  setInterval(() => refresh().catch(() => {}), 500);
}
initialize().catch((e) => {
  $("error").textContent = e.message;
  $("toggle").disabled = true;
  $("status").textContent = "Unavailable";
});
