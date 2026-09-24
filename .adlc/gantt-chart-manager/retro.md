# Retro: gantt-chart-manager

Shipped as PR #1 (https://github.com/angeld-hg/hg-gaant-chart/pull/1) on 2026-09-24. Source: state.md decision log, reviews/*.md, and this session.

## What went well
- **Decisions stayed with the user.** 19 decisions (D1-D19), each asked with a recommended option, and none settled by an agent. Follow-up branching worked: D2 auto-push led to D5 push-only.
- **Spec review paid for itself.** Round 1 caught a self-contradicting AC12 example and an undefined API contract (clamp vs reject, which became D9) before any code existed.
- **Independent verification was real.** The verifier read test assertions rather than titles and wrote its own brute-force check for the critical path (3000 graphs). It proved that check and the CR7 test could fail by running sabotaged copies, and it found the AC16 test gap.
- **Code review caught what verification couldn't.** A write-ordering race (CR1, major) and a cross-site import hole (CR2). All 43 ACs passed before those fixes.
- **Resume from state.md worked.** The session restarted mid-plan, and the SessionStart brief plus state.md let work continue with nothing lost.
- **Parallel waves ran without file collisions.** S2+S3, S6+S7, S8+S12, S9+S10+S11 and S13a/b/c. File ownership held, and the only two out-of-lane edits were escalated as BLOCKED rather than made silently.
- **Test-first held up.** Implementers reported red-first runs with the failure reason. When a test passed first, because the behaviour already existed, they proved it could fail another way.

## Friction
| # | What happened | Root cause | Fix type | Proposed change |
|---|---|---|---|---|
| F1 | The elephant restarted the planner after ~10 min. The original was still working (it took 17 min) and finished, so a duplicate had to be killed. | No guidance on expected goldfish durations, and no "check before re-dispatch" step | skill (start) | Before re-dispatching, check ListAgents / the notification. Never run two authors on one artifact. Large plans can take 15-20 min. |
| F2 | Implementers stalled on the 600 s watchdog three times (S7 once, S13 twice). S13 only finished after being split into 3 parts. | S13 bundled 3 specs plus a fixture plus optional perf work, with long Playwright runs and no time-boxing | agent (planner, implementer) + skill (implement) | Planner: one new e2e spec per slice, and split "quality gate" slices by spec. Implementer: time-box every command. Implement skill: after a stall, resume once, then split the slice. |
| F3 | Parallel UI slices would have collided on e2e ports and the DB. This was found only by the discover refresh after S1, and needed a chore. The elephant then had to add port assignments to every dispatch, against "Nothing more". | The plan didn't make e2e isolation a scaffold requirement, and the implement skill forbids per-wave environment facts | agent (planner) + skill (implement) | Planner: if any two slices both run e2e in parallel, S1 must make e2e ports/DB env-configurable. Implement skill: the elephant may pass per-slice environment facts (ports), never summaries. |
| F4 | Tests flaked under load: roster 2/5 once, AC25 266 ms once, a layout test timed out once. This happened only when 3-4 agents ran e2e at the same time. | Machine load from concurrent Playwright runs (load average 26-45) | verification profile + skill (implement, verify) | verification.md: cap concurrent e2e runs at 2. Run verify alone, not beside reviewers that run e2e. |
| F5 | The elephant rewrote every reviewer and verifier report into reviews/ by hand (about 8 reports, several thousand tokens each). | code-reviewer, drift-checker, spec-reviewer and verifier have no Write tool, so their reports come back only as messages | agent + hook | Give those four goldfish Write limited to `.adlc/<slug>/reviews/`, enforced by goldfish-gate / elephant-guard. They save their own report, and the elephant reads just the verdict. |
| F6 | CR7 (rename skips the write queue) was the same class of bug as CR1, but it was found only in review round 2, which cost an extra fix, review and verify cycle. | The CR1 fix changed the one call site the finding named, not every sibling write path | agent (implementer, code-reviewer) | Implementer on a review finding: "fix the class, not the instance: list every sibling call site and either fix it or say why it's exempt." The code reviewer asks for that list. |
| F7 | `.adlc` was in .gitignore (added by something before S1), so the spec trail would silently not ship. It was caught only because S1's report mentioned it. | Discover doesn't ask whether .adlc/ should be tracked | skill (discover) | Discover step 1: check `git check-ignore .adlc`, and ask the user to commit or ignore. |
| F8 | Guardrail hooks outside angel blocked valid commands: any command containing `..`, anything containing "auth" (including `gh auth status`, a precondition in the ship skill), and a commit message containing "shortened-name", misread as `-n` / `--no-verify`. | The HG guardrails plugin's regexes are too broad, and the ship skill assumes `gh auth status` is callable | skill (ship) + external | Ship skill: check auth with `gh api user --jq .login`. Report the three false positives to the guardrails plugin owners. |
| F9 | The plan's S9 test list contradicted its own step 3 (A->A shown vs not offered). This surfaced only at implement time and in review. | The plan drift check compares plan against spec, not the plan's internal consistency | nothing | One-off. The implementer flagged it correctly. |
| F10 | Two out-of-lane BLOCKED reports: a shared e2e fixture (D13) and test_roundtrip.py (CR2). | Shared test infrastructure had a single owner | nothing | Working as designed. BLOCKED, approve, a one-line change. |

## Numbers
- **Revise loops:** spec 1 (REVISE, then READY); plan 0 (PROCEED plus a fix pass); review 2 rounds plus a pre-push round 3.
- **Slices:** 13, with S13 split into 3, plus 3 chores/fixes. 5 parallel waves.
- **Decisions:** 19. **Waivers:** 1 (D19, console.log in a test). **Stalls:** 3. **Verification runs:** 3, each 43/43.
- **Tests at ship:** pytest 379, vitest 165, e2e 77.
- **Review findings:** 7 fixed (1 major), 0 waived.
