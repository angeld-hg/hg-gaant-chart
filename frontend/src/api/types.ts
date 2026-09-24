// TypeScript mirror of the HTTP API shapes (plan contract C2). Dates are "YYYY-MM-DD" strings.

export type ISODate = string;

export interface PaletteColour {
  name: string;
  /** "#rrggbb", lowercase. */
  fill: string;
  label: string;
}

export interface Palette {
  /** Exactly 12, in a fixed order. */
  colours: PaletteColour[];
  neutral: { fill: string; label: string };
}

export interface ProjectSummary {
  id: number;
  name: string;
  task_count: number;
}

export interface Person {
  id: number;
  name: string;
  /** A palette fill. */
  colour: string;
}

export interface Task {
  id: number;
  name: string;
  start: ISODate;
  end: ISODate;
  /** 0 for milestones. */
  duration: number;
  is_milestone: boolean;
  percent_complete: number;
  assignee_id: number | null;
}

export interface Dependency {
  id: number;
  predecessor_id: number;
  successor_id: number;
}

export interface ScheduleSummary {
  project_end: ISODate | null;
  critical_task_ids: number[];
  critical_dependency_ids: number[];
}

export interface ProjectDetail {
  id: number;
  name: string;
  /** id ascending. */
  people: Person[];
  /** id ascending (creation order). */
  tasks: Task[];
  /** id ascending. */
  dependencies: Dependency[];
  schedule: ScheduleSummary;
}

export interface MutationResult {
  project: ProjectDetail;
  changed_task_ids: number[];
  created_id: number | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string; field: string | null };
}

/**
 * Durations and percents may be passed as the text the user typed, so the server can reject a
 * non-integer with its own message (AC5) instead of the client silently rounding it.
 */
export type NumberInput = number | string;

export interface TaskCreate {
  name: string;
  start: ISODate;
  duration?: NumberInput;
  end?: ISODate;
  is_milestone?: boolean;
  percent_complete?: NumberInput;
  assignee_id?: number | null;
}

export interface TaskPatch {
  name?: string;
  start?: ISODate;
  end?: ISODate;
  duration?: NumberInput;
  is_milestone?: boolean;
  percent_complete?: NumberInput;
  assignee_id?: number | null;
}

export interface PersonCreate {
  name: string;
  colour?: string;
}

export interface PersonPatch {
  name?: string;
  colour?: string;
}

/** An export file as downloaded: the untouched response bytes plus the server's file name. */
export interface ExportFile {
  blob: Blob;
  filename: string;
}
