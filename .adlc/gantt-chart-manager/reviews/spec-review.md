## Spec review: gantt-chart-manager (round 1)

Reviewer: angel:spec-reviewer. Reviewed spec.md, decisions.md, ../verification.md. Honours D1-D5 and gap triage. No code yet, so nothing checked against the repo.

### Blocking
- [AC12] The second example contradicts itself. Fixture A -> B -> C with C on 10-10. "If B had instead started on 10-12" makes B 10-12..10-13, so C on 10-10 already violates B -> C before anything moves, which breaks the spec's own invariant. -> Rewrite: "Successors move only as far as needed: if B were instead 10-12..10-13 and C 10-14..10-14, then moving A's end to 10-09 moves neither B nor C."
- [AC10/AC12/AC28/AC29 vs AC5] API behaviour for scheduling-constrained changes is unspecified. AC28 is UI snapping and AC5 is 4xx for invalid input. For a PUT setting B's start to 10-06, it's unclear whether the API clamps to 10-08 or returns 4xx, and whether a cascade comes back as one atomic response. -> Add: "The API applies the same rules as the UI (AC12 cascade, AC28 clamp, AC29 push-only) in one atomic write and returns every task whose dates changed; only AC5/AC8/AC11/AC30 violations return 4xx." (Escalated as D9.)

### Should fix
- [AC7/AC4] Toggling milestone on/off is undefined: which date it keeps, the duration when unmarked, what duration/end edits do to a milestone. Nothing rejects a milestone with non-zero duration. -> "Marking keeps start as its date; unmarking gives duration 1; milestone date edited via start; duration fixed at 0, not editable." Also say whether % complete applies to milestones.
- [AC22/AC21] "Identical apart from generated identifiers" isn't cleanly testable, since ID changes ripple through references, and order is undefined. -> File-local stable keys (or indices) + deterministic order, so two exports are byte-identical. Define UI task row order (creation order?) and whether reordering is a non-goal.
- [AC21/AC23] Export repeats start/end/duration; AC23 doesn't reject files where they disagree, milestones with start != end, duplicate/self dependencies (AC11), invalid colours, or empty project names. -> Extend AC23 to reject anything breaking AC5, AC7, AC8, AC11, AC30, or end != start + duration - 1 (start for milestones).
- [AC30/Constraints] Colour format/validation undefined; "text must stay readable" untestable. -> Define valid colours (D7) and require bar label contrast >= 4.5:1 against every allowed colour and the neutral colour.
- [AC15] "Two parallel chains with the same end date are both critical" only holds if that date is the project end. -> "...two parallel chains that both end on the project end are both critical."
- [AC25] "Becomes interactive" / "finish within 200 ms" have no measurable endpoint. -> e.g. "all 200 bars and 250 arrows in the DOM and a drag accepted within 2 s of navigation, measured in Playwright; after drag release the DOM shows cascaded dates and updated critical highlight within 200 ms (persistence may finish later)."
- [AC1/AC2] No project-name rules (empty, duplicates on create/rename). (Escalated as D8.)
- [Completeness] No empty-state AC: no projects, project with no tasks (project end/critical path undefined), empty roster. Add one AC that says what is shown and that nothing is marked critical.
- [Completeness] Concurrency/stale state: two tabs could compute a cascade from stale data. -> Declare multi-tab out of scope, or have the server re-check and stay authoritative.
- [Completeness] Limits missing: max name length, allowed date range, max duration, timeline scroll range / default range.
- [AC2/AC6/AC30] Deletes can't be undone and there's no confirmation. State whether deleting a project/task/person asks for confirmation.
- [Constraints] "Polished for a demo" / "consistent visual style" are untestable. Keep them in Problem, or make them checkable, e.g. "At 1280x800 the chart, toolbar and task list are visible without horizontal page scroll and no label is clipped."

### Nits
- [Non-goals] Name the repos (angeld-hg/angel-adlc, angeld-hg/hg-gaant-chart); "both" reads as two app repos.
- [Constraints] "Re-run /angel:discover afterwards" is a plan/process step, not a product constraint.
- [AC24] Define the rule when importing a name that already ends in a suffix, e.g. "Launch (2)".
- [AC5] Also reject non-integer durations and malformed dates.
- AC numbering is out of order. Fine, as long as numbers are never reused.

## Decisions needed
(Harvested to decisions.md as D6 milestone dependency semantics, D7 roster colour choice, D8 project name uniqueness. The elephant added D9 for the API clamp-vs-reject question from the second blocking item.)

VERDICT: REVISE
