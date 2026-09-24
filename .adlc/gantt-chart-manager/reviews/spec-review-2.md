## Spec review: gantt-chart-manager (round 2)

Reviewer: angel:spec-reviewer. All round 1 items resolved; D1-D9 and gap triage honoured.

### Blocking
None.

### Should fix
- [AC32 vs AC23/AC9] API error contract is inconsistent: (1) AC32 says clamp/cascade applies to "every write" but import (AC23) rejects rather than adjusts; (2) AC32's 4xx list omits AC23 rejections and, read literally, forbids 404 for unknown IDs; (3) no AC covers cross-project dependencies. -> Rewrite AC32's last sentence: "These rules apply to every write except import, which follows AC23. A 4xx is returned only for input that breaks AC5, AC8, AC9, AC11, AC23, AC30, AC33, AC34, or AC40, for a reference to an ID that does not exist, or for a dependency between tasks of different projects. In each case nothing is written." Add to AC11: "...or a dependency between tasks in different projects."
- [AC43] "near its left edge" is untestable. -> "...scrolled so that the earliest task start is visible and no more than 7 days (in the current zoom) from the left edge of the timeline."

### Nits
- [AC43] Say which timezone defines "today" (browser local date); tests need a fixed clock.
- [AC6] Deleting a task leaves former successors' dates unchanged (push-only).
- [AC39] State M's starting date (10-09).
- [AC24] Re-trim after shortening to 100 chars; check "first free" against the shortened, suffixed name.
- [AC23] Reject duplicate task/person keys within the file.
- [AC42] Project list order unstated (creation order, or planner's choice).
- [AC3/AC8] New task defaults (% complete 0, assignee none) unstated; planner may decide.
- [AC14] "Recognisable" is soft; testable part is "cannot rely on bar fill colour alone".
- [AC25] 200 ms can be met by a localhost round trip or by client-side prediction; the latter means two engines (contrary to D9's rationale). Planning choice.

## Decisions needed
None.

VERDICT: READY
