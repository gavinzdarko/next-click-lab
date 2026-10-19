# Final implementation review

Manual review by the implementing agent; not an independent security audit or a human usability study.

Reviewed the final manifest, injection/message boundaries, candidate/score loop, event ordering, teardown, popup/worker storage path, fixtures, test assertions, benchmark and installation/privacy documentation.

Findings resolved before merge:

- Relative HTTP(S) links are resolved against `baseURI` rather than rejected by a prefix heuristic.
- The pointer trial is frozen from the existing guess before pointer-down, with no click target/coordinates used in ranking. Missing/invalidated guesses remain misses in the denominator. A controlled ordering test separates freshness from runner latency; separate tests exercise real-time expiry.
- A capture-phase window blur listener also received element blur. It now checks that the event target is the window. A focused-button sequence regression test and installed visible-to-hidden sequence cover the fix.
- Scroll position is checked against an ephemeral snapshot as well as scroll events, so queued scroll delivery cannot preserve a stale guess. Removed, hidden, disabled and obscured candidates fail eligibility checks.
- Repeated starts abort the old passive listeners, disconnect the single observer, cancel timers and remove the outline. Pointer re-entry recovers from a missed drag release. Mutation batches larger than 32 records clear the guess immediately.
- The worker serializes counter writes and score clearing. No page text, field values, keys, URLs or click records enter storage. Only numeric per-mode aggregates are stored in session storage, with tab-close cleanup.
- Hidden mode conceals both the outline and score; neither mode is described as calibrated. Synthetic correct clicks test functionality and are not predictive-performance evidence.
- Production code has no network calls, automatic click/navigation calls, broad host permissions or persistent learning. Secret-pattern and secret-file scans found no credentials; dependency audit reported zero vulnerabilities at delivery.

The local shell could not launch Chrome under the macOS sandbox, and native UI access was not approved. Browser evidence comes from the linked GitHub Actions run in a new Linux Chrome profile. The installed test uses the real toolbar popup and public Puppeteer extension APIs; it does not substitute a mocked content script or grant broad host access.

Known limits remain intentional: candidate/type cap, top frame/light DOM only, sampled occlusion, 120ms refresh, idle expiry, conservative form/password exclusions, manual evaluation blocks, and no real-world accuracy or causal-effect evidence. The direct-predictor benchmark excludes popup rendering and worker writes and does not establish a production latency/memory guarantee. See README and the captured reports for details.
