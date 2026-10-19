/* Shared classic script: isolated extension world in production; fixture world in tests. */
(() => {
  const SELECTOR =
    'a[href],button,[role="button"],[role="link"],[role="menuitem"],summary';
  const LIMIT = 400;
  const blank = () => ({ clicks: 0, predictions: 0, correct: 0, keyboard: 0 });
  function eligible(el, doc) {
    if (
      !el?.isConnected ||
      !el.matches(SELECTOR) ||
      el.closest(
        'form,[inert],[hidden],[aria-disabled="true"],[aria-hidden="true"],input,textarea,select,[contenteditable]:not([contenteditable="false"])',
      ) ||
      el.matches(":disabled")
    )
      return false;
    if (el.tagName === "A") {
      try {
        if (
          !["http:", "https:"].includes(
            new URL(el.getAttribute("href"), doc.baseURI).protocol,
          )
        )
          return false;
      } catch {
        return false;
      }
    }
    const win = doc.defaultView;
    for (let p = el; p; p = p.parentElement) {
      const s = win.getComputedStyle(p);
      if (
        s.display === "none" ||
        s.visibility !== "visible" ||
        Number(s.opacity) === 0 ||
        s.contentVisibility === "hidden"
      )
        return false;
    }
    const r = el.getBoundingClientRect();
    const left = Math.max(0, r.left),
      right = Math.min(win.innerWidth, r.right);
    const top = Math.max(0, r.top),
      bottom = Math.min(win.innerHeight, r.bottom);
    if (
      right - left < 2 ||
      bottom - top < 2 ||
      win.getComputedStyle(el).pointerEvents === "none"
    )
      return false;
    // Sample the visible box; fail closed for covered/clipped targets.
    return [
      [0.5, 0.5],
      [0.15, 0.15],
      [0.85, 0.85],
    ].some(([x, y]) => {
      const hit = doc.elementFromPoint(
        left + (right - left) * x,
        top + (bottom - top) * y,
      );
      return hit === el || (el.contains(hit) && hit?.closest(SELECTOR) === el);
    });
  }
  function score(rect, pointer, hoverMs, now) {
    if (!pointer || now - pointer.time > 1800) return 0;
    const x = Math.max(rect.left, Math.min(pointer.x, rect.right));
    const y = Math.max(rect.top, Math.min(pointer.y, rect.bottom));
    const distance = Math.hypot(pointer.x - x, pointer.y - y);
    const proximity = 45 / (1 + distance / 100);
    const inside = distance === 0;
    const dx = (rect.left + rect.right) / 2 - pointer.x,
      dy = (rect.top + rect.bottom) / 2 - pointer.y;
    const speed = Math.hypot(pointer.vx, pointer.vy);
    const alignment =
      speed > 0.02
        ? Math.max(
            0,
            (dx * pointer.vx + dy * pointer.vy) /
              (Math.hypot(dx, dy) * speed || 1),
          )
        : 0;
    return Math.round(
      proximity +
        (inside ? 25 + Math.min(20, hoverMs / 35) : 0) +
        alignment * 10,
    );
  }
  class Predictor {
    constructor(
      doc,
      { onTrial = () => {}, now = () => performance.now() } = {},
    ) {
      this.doc = doc;
      this.win = doc.defaultView;
      this.onTrial = onTrial;
      this.now = now;
      this.enabled = false;
      this.mode = "visible";
      this.stats = { visible: blank(), hidden: blank() };
      this.prediction = null;
      this.pointer = null;
      this.frozen = null;
      this.pressed = false;
      this.hover = null;
      this.hoverSince = 0;
      this.lastScroll = -Infinity;
      this.work = { ticks: 0, totalMs: 0, maxMs: 0 };
    }
    start(mode = "visible") {
      this.stop();
      this.mode = mode;
      this.blocked = false;
      if (this.doc.querySelector('input[type="password"]')) {
        this.blocked = true;
        return;
      }
      this.enabled = true;
      this.abort = new this.win.AbortController();
      const listen = (target, name, fn) =>
        target.addEventListener(name, fn, {
          capture: true,
          passive: true,
          signal: this.abort.signal,
        });
      listen(this.doc, "pointermove", (e) => {
        if (!e.isTrusted || e.pointerType !== "mouse" || this.pressed) return;
        const t = this.now(),
          old = this.pointer,
          dt = Math.max(1, t - (old?.time ?? t));
        this.pointer = {
          x: e.clientX,
          y: e.clientY,
          time: t,
          vx: old ? (e.clientX - old.x) / dt : 0,
          vy: old ? (e.clientY - old.y) / dt : 0,
        };
      });
      listen(this.doc, "pointerdown", (e) => {
        if (!e.isTrusted || e.button !== 0 || e.pointerType !== "mouse") return;
        // Freeze ONLY the already computed guess. Never rank using down/click coordinates or target.
        this.frozen = this.validPrediction();
        this.pressed = true;
      });
      listen(this.doc, "pointerup", () => {
        // click follows pointerup synchronously; release a drag with no click too.
        this.release = this.win.setTimeout(() => {
          this.pressed = false;
          this.frozen = null;
        }, 0);
      });
      listen(this.doc, "pointercancel", () => {
        this.pressed = false;
        this.frozen = null;
        this.invalidate();
      });
      listen(this.doc, "click", (e) => this.click(e));
      listen(this.doc, "scroll", () => {
        this.lastScroll = this.now();
        this.invalidate();
      });
      listen(this.win, "resize", () => this.invalidate());
      listen(this.win, "blur", () => {
        this.pointer = null;
        this.pressed = false;
        this.invalidate();
      });
      listen(this.doc, "visibilitychange", () => {
        this.pointer = null;
        this.invalidate();
      });
      listen(this.win, "pagehide", () => this.stop());
      listen(this.win, "popstate", () => {
        this.pointer = null;
        this.invalidate();
      });
      listen(this.win, "hashchange", () => {
        this.pointer = null;
        this.invalidate();
      });
      this.url = this.win.location.href; // ephemeral navigation comparison only; never transmitted/stored.
      this.overlay = this.doc.createElement("div");
      this.overlay.setAttribute("data-next-click-lab", "");
      this.overlay.setAttribute("aria-hidden", "true");
      this.overlay.style.cssText =
        "all:initial!important;position:fixed!important;pointer-events:none!important;z-index:2147483647!important;border:2px solid #7367d7!important;border-radius:7px!important;box-shadow:0 0 0 3px #7367d71a!important;box-sizing:border-box!important;display:none!important;";
      this.caption = this.doc.createElement("span");
      this.caption.style.cssText =
        "all:initial!important;position:absolute!important;left:0!important;bottom:calc(100% + 5px)!important;pointer-events:none!important;white-space:nowrap!important;background:#f8f7ff!important;color:#6555a2!important;border-radius:4px!important;padding:3px 6px!important;font:10px system-ui!important;";
      this.overlay.append(this.caption);
      this.doc.documentElement.append(this.overlay);
      this.observer = new this.win.MutationObserver((records) => {
        if (records.some((r) => !this.overlay?.contains(r.target)))
          this.invalidate();
      });
      this.observer.observe(this.doc.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: [
          "hidden",
          "disabled",
          "class",
          "style",
          "aria-disabled",
          "aria-hidden",
          "inert",
          "open",
        ],
      });
      this.timer = this.win.setInterval(() => this.tick(), 120);
    }
    invalidate() {
      this.prediction = null;
      this.frozen = null;
      this.hover = null;
      if (this.overlay)
        this.overlay.style.setProperty("display", "none", "important");
    }
    validPrediction() {
      const p = this.prediction;
      return p &&
        this.now() - p.at < 300 &&
        this.now() - (this.pointer?.time ?? -Infinity) < 1800 &&
        eligible(p.el, this.doc)
        ? { ...p }
        : null;
    }
    tick() {
      if (!this.enabled) return;
      const begin = this.now();
      if (this.doc.querySelector('input[type="password"]')) {
        this.stop();
        this.blocked = true;
        return;
      }
      if (this.url !== this.win.location.href) {
        this.url = this.win.location.href;
        this.pointer = null;
        this.invalidate();
      }
      if (this.doc.hidden || this.pressed || begin - this.lastScroll < 180) {
        if (!this.pressed) this.invalidate();
        return;
      }
      let best = null;
      if (this.pointer && begin - this.pointer.time < 1800) {
        const items = this.doc.querySelectorAll(SELECTOR);
        for (let i = 0; i < Math.min(items.length, LIMIT); i++) {
          const el = items[i];
          if (!eligible(el, this.doc)) continue;
          const r = el.getBoundingClientRect();
          const inside =
            this.pointer.x >= r.left &&
            this.pointer.x <= r.right &&
            this.pointer.y >= r.top &&
            this.pointer.y <= r.bottom;
          const value = score(
            r,
            this.pointer,
            inside && this.hover === el ? begin - this.hoverSince : 0,
            begin,
          );
          if (value >= 18 && (!best || value > best.score))
            best = { el, score: value, at: begin, inside };
        }
      }
      const hovered = best?.inside ? best.el : null;
      if (hovered !== this.hover) {
        this.hover = hovered;
        this.hoverSince = begin;
      }
      this.prediction = best;
      this.paint();
      const elapsed = this.now() - begin;
      this.work.ticks++;
      this.work.totalMs += elapsed;
      this.work.maxMs = Math.max(this.work.maxMs, elapsed);
    }
    paint() {
      this.overlay.style.setProperty("display", "none", "important");
      if (this.mode === "hidden" || !this.prediction) return;
      this.caption.textContent = `Heuristic ${this.prediction.score} / 100`;
      const r = this.prediction.el.getBoundingClientRect();
      for (const [key, value] of Object.entries({
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
      }))
        this.overlay.style.setProperty(key, `${value}px`, "important");
      this.overlay.style.setProperty("display", "block", "important");
    }
    click(e) {
      if (!this.enabled || !e.isTrusted || e.button !== 0) return;
      const el =
        e.target instanceof this.win.Element
          ? e.target.closest(SELECTOR)
          : null;
      if (!eligible(el, this.doc)) return;
      if (e.detail === 0) {
        this.stats[this.mode].keyboard++;
        this.onTrial(this.mode, { keyboard: 1 });
        return;
      }
      // Touch/pen and unpaired/programmatic clicks do not enter pointer metrics.
      if (!this.pressed) return;
      const p = this.frozen;
      const valid = p && this.now() - p.at < 2000 && eligible(p.el, this.doc);
      const delta = {
        clicks: 1,
        predictions: valid ? 1 : 0,
        correct: valid && p.el === el ? 1 : 0,
      };
      for (const key of Object.keys(delta))
        this.stats[this.mode][key] += delta[key];
      this.onTrial(this.mode, delta);
      this.pressed = false;
      this.pointer = null;
      this.invalidate();
    }
    stop() {
      this.enabled = false;
      this.abort?.abort();
      this.observer?.disconnect();
      this.win.clearInterval(this.timer);
      this.win.clearTimeout(this.release);
      this.overlay?.remove();
      this.overlay = null;
      this.pointer = null;
      this.pressed = false;
      this.invalidate();
    }
    status() {
      const p = this.validPrediction();
      return {
        enabled: this.enabled,
        blocked: this.blocked,
        mode: this.mode,
        score: this.mode === "visible" ? (p?.score ?? null) : null,
        stats: this.stats,
        work: this.work,
      };
    }
  }
  globalThis.NextClickLab = { Predictor, eligible, score, blank, LIMIT };
})();
