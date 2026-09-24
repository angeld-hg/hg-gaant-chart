# Proposed edits from the gantt-chart-manager retro

The paths below are relative to `plugins/angel/` in the plugin repo, angeld-hg/angel-adlc (v0.2.0). Each edit maps to one or more friction rows in `retro.md`.

## E1 (F2, F3): planner — slice size and parallel e2e isolation
`agents/planner.md`, "How to work", after step 4, add:
```markdown
4b. Keep slices small enough for one goldfish run: at most one new e2e spec per slice. Split
   "quality gate" work (perf, layout, full-flow) into one slice per spec. If two slices that both
   run e2e are marked parallel, S1 (or the scaffold slice) must make the e2e ports, DB path and
   output directory configurable through the environment, so parallel runs can't collide.
```

## E2 (F2, F6): implementer — time-boxing and fixing the whole class
`agents/implementer.md`, "Rules", add:
```markdown
8. Time-box every command you run (use a polling loop if the OS has no `timeout`, and pass
   `--timeout` / `--global-timeout` to Playwright). A goldfish that sits silent for 10 minutes gets
   killed by the watchdog and loses its work.
9. When you are fixing a review finding, fix the class, not the instance. List every sibling call
   site that has the same flaw and fix it, or say why it's exempt. Put that list in your report.
```

## E3 (F2, F3, F4): implement skill — environment facts, stalls, concurrency
`skills/implement/SKILL.md`:

In "2. Dispatch a wave", replace
```markdown
- the feature folder path and the slice id. Nothing more: it reads its slice from plan.md.
```
with
```markdown
- the feature folder path and the slice id. It reads its slice from plan.md. Also pass
  per-slice environment facts it can't know: which ports or DB path to use for e2e so that
  parallel slices don't collide, and which other slices are running. Never pass summaries of the
  spec or plan.
- Run at most 2 slices that execute e2e at the same time; load makes timing-based tests flaky.
```
Then add a step between 3 and 4:
```markdown
## 3b. Stalls
If an implementer is killed by the watchdog, check `git status` for partial work and leftover
processes, then resume the same agent once with SendMessage. If it stalls again, split the slice
into smaller parts with disjoint files and dispatch fresh agents. Record the split in state.md.
```

## E4 (F1): start skill — check before re-dispatching
`skills/start/SKILL.md`, "Rules for the elephant", add:
```markdown
8. **Never run two goldfish on the same artifact.** If a goldfish seems slow, check ListAgents or
   wait for its notification before re-dispatching. Large plans can take 15-20 minutes. If you do
   restart one, stop the old one first with TaskStop.
```

## E5 (F5): reviewers and verifier save their own reports
In `agents/code-reviewer.md`, `drift-checker.md`, `spec-reviewer.md` and `verifier.md`:
`tools: Read, Grep, Glob, Bash` becomes `tools: Read, Grep, Glob, Bash, Write`, plus this line:
```markdown
Write your full report to the path the elephant gives you under `.adlc/<slug>/reviews/`. That is the
only file you may write. Your final message is the verdict line plus 5 lines or fewer.
```
In `hooks/elephant-guard.sh` (or a new `reviewer-write-guard.sh` on PreToolUse Write), deny Write from
these four agent types unless the path matches `.adlc/*/reviews/*.md`. The review, verify, spec and
plan skills then pass the output path, and the elephant reads only the verdict.

## E6 (F7): discover — ask whether .adlc/ is tracked
`skills/discover/SKILL.md`, step 1, add:
```markdown
Check `git check-ignore -q .adlc/ACTIVE`. If .adlc/ is ignored, ask the user whether to commit the
ADLC artifacts (recommended: yes, so the spec, decisions and evidence travel with the PR) or keep
them local.
```

## E7 (F8): ship — an auth check that survives guardrails
`skills/ship/SKILL.md`, step 1, replace
```markdown
- `gh auth status` succeeds.
```
with
```markdown
- gh is authenticated: `gh api user --jq .login` prints a login. Prefer this over `gh auth status`,
  which some guardrail hooks block.
```

## E8 (F4): verification profile for this repo (local file, not the plugin)
`.adlc/verification.md`, add under "Gaps" or environment rules:
```markdown
- Concurrent Playwright runs raise load enough to flake the AC25 timing and some layout and roster
  specs. Run at most 2 e2e suites at once, and run verification alone.
```

## External (F8): the HG guardrails plugin (not angel)
Report these false positives to its maintainers:
- **Path traversal:** any `..` in a command is blocked, including `git log main..HEAD` and `HEAD..origin/main`.
- **Credential reads:** any command containing "auth" is blocked, including `gh auth status`.
- **`--no-verify` detection:** it fires on `-n` inside a commit message word, as in "shortened-name".
