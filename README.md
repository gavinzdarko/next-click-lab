# Next Click Lab

A small “can this read my mind?” experiment for **desktop Google Chrome**. It guesses your next visible link or button from pointer proximity, direction and hover duration. One subtle outline follows its best guess, with a small heuristic score label. Try hidden mode to see what happens when the outline cannot guide you.

This is a heuristic toy for noticing interaction patterns, not validated intent detection or an accessibility aid. The 0–100 score is a ranking score, **not probability or confidence calibrated against data**. There is no claimed accuracy.

## Install and try it

1. Download this repository (Code → Download ZIP) and unzip it, or clone it.
2. In desktop Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the **`extension/`** directory (the one containing `manifest.json`). No build is needed.
3. Pin **Next Click Lab** using Chrome’s Extensions menu. Open a non-sensitive HTTP(S) page, click its toolbar icon, then **Turn on**. The popup says **On · this document**. Dismiss it with Escape, then move your mouse toward a link/button and pause briefly.
4. Reopen the popup for the on/off switch, mode selector and session scoreboard. **Turn off** removes the outline and stops tracking. **Clear scores** resets both modes for this tab.

Chrome 120+ is the declared API minimum, not a claim of testing every version. This release supports desktop Chrome only; see [verification evidence](evidence/README.md) for the actual tested build. Chrome’s internal pages, extension pages, PDFs, file URLs, Web Store, incognito and some managed pages are unsupported. No Web Store listing or cross-browser release is included.

## A repeatable demo

With Node 22.14+ installed, run `npm ci` and `npm run demo`; open **http://127.0.0.1:4173**. The server binds loopback only.

- Enable **Visible** mode. Drift toward Fern; pause about half a second; click. The outline must not prevent the fixture action from completing. Move toward Moss to see the guess change.
- Reopen the popup and note predictions, actual clicks, correct and `n`. Toggle off, click again, and confirm counts stay unchanged.
- Enable **Hidden** mode. Move and click naturally; there should be no outline or live score. Its sample count is separate from Visible. Avoid watching the scoreboard between every click if evaluating yourself.
- Scroll to the lower garden. The old guess is cleared; move toward the new target. Disabled and invisible examples must not receive a highlight.
- Follow “Next page.” Prediction stops on the new document; this tab’s aggregates remain. Re-enable explicitly to continue. Clear scores to start a new session.

For a personal experiment, decide equal-length visible and hidden blocks in advance, alternate the order on repeated sessions, and report counts alongside rates. Dismiss the popup with Escape after changing mode before continuing on the page. Mode choice is manual, **not a randomized holdout**. Practice, page difficulty and carryover can confound any comparison. Tiny samples and scripted fixtures cannot establish real-world predictive performance or a causal effect of highlighting.

## Exactly what is scored

Each mode has its own counters for the current tab/browser session:

- **Actual clicks:** eligible, trusted primary mouse clicks while enabled, paired with a primary mouse pointer-down. A click means a DOM activation event, not proof a page action succeeded. Prevented default actions still count. Touch, pen, middle/right clicks, clicks on excluded targets and programmatic `.click()` calls do not count.
- **Predictions:** actual clicks with a valid previously computed guess frozen **at the start of pointer-down**. This is a count of scored trials with guesses, not every animation/update or distinct guess.
- **Correct:** predicted element and actual eligible element are exactly the same DOM element. A click on a child inside a button resolves to the button.
- **Hit rate = correct / actual clicks.** A no-prediction trial counts as a miss. **Coverage = predictions / actual clicks.** `n` is actual clicks; zero denominator displays `—`. Rates are measured session fractions, not forecasts.
- **Keyboard:** trusted zero-detail activations on eligible targets, reported separately and excluded from pointer rates. This category may also include browser-mediated non-pointer activation. No keys or key codes are observed.

The click handler never ranks candidates or consumes click coordinates as features. Pointer-down copies only a still-valid existing guess; intervening pointer movement does not update it while pressed. The last computed guess must be under 300ms old at pointer-down. It expires if the computed snapshot is 2s old at activation, or if its target is no longer eligible. Scroll, resize, DOM eligibility changes and navigation invalidate it. After each scored mouse click, fresh pointer movement is needed. Fast clicks may have no guess, which remains visible in coverage and hit rate.

## Predictor and lifecycle

Candidates are the first **400** matching `a[href]`, `button`, `summary`, or explicit ARIA button/link/menuitem elements in document order. Enabled, visible, viewport-intersecting, pointer-reachable targets only: hidden/transparent/inert/disabled ancestors and covered/clipped sampled points are excluded. Links must resolve to HTTP(S). Text fields, editable regions, form descendants and pages with password fields are excluded. Visibility is checked at three sample points; unusual geometry may be missed.

Every 120ms while on, proximity contributes up to 45 points, pointer alignment up to 10, being inside adds 25, and dwell adds up to 20. Scores below 18 produce no guess. Pointer samples expire after 1.8s idle. Scroll events clear the guess and impose a 180ms settling interval. The outline is a fixed `pointer-events:none` element with no interactive children. The extension never invokes a page action, changes page handlers, navigates or clicks on behalf of a user.

One timer, one MutationObserver and one abortable set of passive listeners belong to each enabled document. Start first tears down any old instance; off, pagehide and password detection abort tracking, disconnect the observer, clear timers and remove the outline. Off retains only an inert controller and one extension message listener so the popup can re-enable it. Full navigation does not auto-inject. SPA URL changes, history events and relevant DOM changes invalidate the guess. Background tabs and lost focus clear it. Animated target motion can be up to one 120ms tick behind.

No iframe/shadow-root traversal, arbitrary JavaScript-only click handlers, custom canvas hit regions, giant-page completeness or exact visual shape analysis. A matching element after the candidate cap can count as an actual click, but cannot be predicted; this reduces coverage honestly. DOM queries and mutation delivery still depend on page size/activity; the cap bounds expensive candidate evaluations, not native selector query cost.

## Permissions and privacy

The only permissions are:

- **`activeTab`:** temporary page access after the toolbar action. No persistent host grants or `<all_urls>`.
- **`scripting`:** inject packaged scripts into that tab’s top frame after Turn on, in Chrome’s isolated world.
- **`storage`:** numeric aggregate counters in `chrome.storage.session`. No disk-backed local/sync history. Aggregates survive a page navigation in the same tab, disappear on tab close, browser restart, extension reload/update/disable, or Clear scores. Content scripts cannot access session storage directly; the worker receives only mode and numeric counter deltas.

Interaction features stay in document memory. Pointer coordinates, dwell, scroll timing, ephemeral element references and a URL string used only to detect SPA navigation are never stored or sent outside the page controller. No page text, form values, field contents, keystrokes, credentials, page URLs or individual click records enter the scoreboard or a server. The extension contains no network requests, analytics, remotely hosted code or history learning. Past-click learning is deliberately omitted in this MVP.

Use the fixture or other non-sensitive pages; avoid banking, health, account and private messaging pages. Password-field detection and form exclusion are conservative guards, not a sensitive-site classifier. The extension still needs to inspect DOM structure and styles to identify targets on a page you enable.

## Development and verification

```sh
npm ci
npm run lint
npm test                 # browser fixture tests, fresh contexts, Google Chrome installed
npm run verify:chrome    # fresh profile; actually installs extension and uses toolbar popup
npm run perf             # repeatable off/hidden/visible overhead comparison
```

Install Google Chrome from its official vendor source first. `CHROME_CHANNEL=chrome` is the default. `HEADED=1 npm run verify:chrome` displays the installation verification. The automated installer uses the experimental **test-only** CDP Extensions domain, so a current Chrome build exposing `Extensions.loadUnpacked` and `Extensions.triggerAction` is required for that command. It uses a throwaway profile with `--enable-unsafe-extension-debugging`, never your ordinary profile. Normal manual installation does not use debugging flags or CDP, and the shipped extension uses only supported extension APIs.

Tests cover visibility/disabled/occluded targets, direction/dwell changes, pre-down freezing, no prediction, separate keyboard activation, untrusted clicks, hidden mode, scroll/removal/SPA/idle invalidation, repeated teardown and password guards. Fixture tests load the same predictor directly; the separate installed-extension test checks permissions, popup, worker aggregation, toggle, scroll, full navigation and clearing.

Performance uses three alternating rounds per off/hidden/visible mode on the same synthetic 400-button DOM and pointer path. The benchmark loads the packaged predictor directly; it excludes popup rendering and worker counter writes. Renderer task time includes automation/fixture work. Tick mean below 40ms is only a loose regression tripwire. Results depend on hardware, Chrome and scheduler; no general overhead or predictive-performance guarantee is implied. See committed JSON and screenshots in `evidence/` plus CI artifacts.

## Layout

- `extension/`: the unpacked MV3 extension; no runtime dependencies or build.
- `fixtures/`: two synthetic pages for the demo and navigation checks.
- `tests/`: meaningful browser tests of the predictor and lifecycle.
- `scripts/`: local fixture server, installed-Chrome verification and performance runner.
- `evidence/`: reproducible verification results and their limits.
- `.github/workflows/`: CI that reruns lint, tests, actual installation and overhead check.

## Official references

Implementation checked against Chrome’s current official [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting), [session storage](https://developer.chrome.com/docs/extensions/reference/api/storage), [content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) and [unpacked installation](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world) documentation. Automated installation is based on the [official CDP Extensions protocol](https://chromedevtools.github.io/devtools-protocol/tot/Extensions/).
