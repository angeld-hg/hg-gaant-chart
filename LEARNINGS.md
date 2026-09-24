# Learnings

## 2026-09-24: gantt-chart-manager (PR #1)

Key learnings (from the Friction table in the retro):
- F1: Check whether a goldfish is still running before you re-dispatch it. Large plans take 15-20 min, and two authors must never work on one artifact.
- F2: Keep slices to one new e2e spec each and time-box every command. After a watchdog stall, resume once, then split the slice.
- F3: If slices run e2e in parallel, S1 must make e2e ports and the DB configurable through env. The elephant may pass per-slice env facts, but never summaries.
- F4: Concurrent Playwright runs cause flaky timing tests. Run at most 2 e2e suites at once, and run verify alone.
- F5: Reviewers and the verifier should write their own reports under reviews/, so the elephant doesn't have to transcribe them.
- F6: When fixing a review finding, fix the whole class. List every sibling call site (CR7 repeated CR1).
- F7: Discover should check whether .adlc/ is git-ignored and ask the user whether to track it.
- F8: The external guardrail hooks block `..`, "auth" and `-n` inside words. Check auth with `gh api user --jq .login`.
- F9: One-off. The plan's S9 contradicted itself, and the implementer flagged it correctly.
- F10: Working as designed. Out-of-lane edits to shared test infrastructure were escalated as BLOCKED.

Decision on the proposed edits (retro-proposed-edits.md):
- E1-E7 approved for the angel plugin, delivered as a branch + PR on angeld-hg/angel-adlc.
- E8 not approved: no note added to the local verification profile (.adlc/verification.md).
- The external guardrail false positives (`..` path traversal, "auth" credential reads, and `-n` in a commit message read as `--no-verify`) will be reported to that plugin's owners.

Detail: [.adlc/gantt-chart-manager/retro.md](.adlc/gantt-chart-manager/retro.md)
