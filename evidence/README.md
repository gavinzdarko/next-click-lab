# Verification evidence

Captured from [passing GitHub Actions run 39302124819](https://github.com/gavinzdarko/next-click-lab/actions/runs/39302124819), source commit `2233423`. The shipped extension files match [extension-sha256.json](extension-sha256.json); later delivery commits add documentation/evidence and clean stale CI artifacts. The PR's final checks rerun the complete workflow on its final head.

**Actually tested:** Google Chrome **155.0.8059.39**, Linux. Ten browser fixture tests passed, plus actual unpacked installation in a brand-new temporary profile, real toolbar-popup enable/mode/off/clear controls, visible highlight alignment and click-through page action, separate hidden scoring, scrolling, link-click navigation, same-tab score retention and second-document re-enabling. Installation verification used headed Chrome under Xvfb through Puppeteer's public extension APIs. No host-permission shortcut or mocked content-script replacement was used. Fixture unit/integration tests and the performance check used headless Chrome with the same production predictor loaded directly.

- [chrome-verification.json](chrome-verification.json): raw captured installation/workflow report and limitations.
- [chrome-visible.png](chrome-visible.png): actual fixture with one subtle pointer-transparent outline and labeled heuristic score.
- [chrome-popup.png](chrome-popup.png): actual toolbar popup after the first controlled visible click; both mode counters fit within the popup.
- [performance.json](performance.json): nine raw samples: three each of off, hidden and visible on the identical 400-button page/path.
- [REVIEW.md](REVIEW.md): final implementation review, resolved findings and remaining limits.

The installed functional sequence observed **visible: 2 actual clicks, 2 predictions, 2 correct; hidden: 1 actual click, 1 prediction, 1 correct**, before clearing. The first visible click appears in the screenshot; the second follows a navigation link. These are scripted expected-path assertions with **n=2 and n=1**, not evidence of real-world accuracy or a causal highlighting effect. No human evaluation or personal browsing data was used. Keyboard/no-prediction/mismatch/disabled/removal/focus/teardown cases are exercised separately by the fixture suite.

In this captured microbenchmark, hidden-mode tick means ranged from **5.208–5.569ms** and visible-mode means from **5.630–5.922ms**, at a 120ms interval. Off had zero predictor ticks. The largest sampled tick was 16.2ms. These are observations on one CI runner, not a general latency guarantee. Renderer task time includes fixture/automation work; popup rendering, worker writes, real-site complexity, background-tab behavior and memory retention are not quantified by this benchmark. Native selectors still scan the document even though only the first 400 candidate matches are evaluated.

Local limitations: shell-launched Chrome aborted under macOS sandbox restrictions (MachPortRendezvous permission denial); native UI tool access to Chrome was rejected. No local macOS installation or human browsing session is claimed. Normal manual Load unpacked installation is documented, but the captured installation itself used the browser's CDP test interface.
