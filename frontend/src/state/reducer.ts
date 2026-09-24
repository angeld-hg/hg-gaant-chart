// Pure app state (plan contract C6). The client never schedules: every mutation result replaces
// the open project wholesale with what the server returned (AC16, AC31, AC36).
import type { MutationResult, Palette, ProjectDetail, ProjectSummary } from "../api/types.ts";
import type { Zoom } from "../timeline/scale.ts";

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
}

export interface AppState {
  projects: ProjectSummary[];
  current: ProjectDetail | null;
  palette: Palette | null;
  zoom: Zoom;
  error: string | null;
  editor: { taskId: number | "new" } | null;
  rosterOpen: boolean;
  confirm: ConfirmRequest | null;
  lastChangedTaskIds: number[];
  /** False until the first project list arrives, so the empty state never flashes. */
  projectsLoaded: boolean;
}

export type AppAction =
  | { type: "projects-loaded"; projects: ProjectSummary[] }
  | { type: "project-created"; project: ProjectSummary }
  | { type: "project-renamed"; project: ProjectSummary }
  | { type: "project-deleted"; id: number }
  | { type: "project-opened"; project: ProjectDetail | null }
  | { type: "mutation-applied"; result: MutationResult; opensCreatedTask?: boolean }
  | { type: "palette-loaded"; palette: Palette }
  | { type: "zoom-set"; zoom: Zoom }
  | { type: "error-set"; message: string }
  | { type: "error-cleared" }
  | { type: "editor-set"; editor: { taskId: number | "new" } | null }
  | { type: "roster-set"; open: boolean }
  | { type: "confirm-set"; confirm: ConfirmRequest | null };

export const initialState: AppState = {
  projects: [],
  current: null,
  palette: null,
  zoom: "day",
  error: null,
  editor: null,
  rosterOpen: false,
  confirm: null,
  lastChangedTaskIds: [],
  projectsLoaded: false,
};

function withSummaryOf(projects: ProjectSummary[], detail: ProjectDetail): ProjectSummary[] {
  return projects.map((p) =>
    p.id === detail.id ? { id: p.id, name: detail.name, task_count: detail.tasks.length } : p,
  );
}

/** A new-task draft that is still open moves on to the task its create made. */
function editorAfterCreate(
  editor: AppState["editor"],
  createdId: number | null,
  project: ProjectDetail,
): AppState["editor"] {
  if (editor?.taskId !== "new" || createdId === null) {
    return editor;
  }
  return project.tasks.some((t) => t.id === createdId) ? { taskId: createdId } : editor;
}

/** An editor on a task that no longer exists (deleted, or another project) closes. */
function editorFor(editor: AppState["editor"], project: ProjectDetail): AppState["editor"] {
  if (editor === null || editor.taskId === "new") {
    return editor;
  }
  const { taskId } = editor;
  return project.tasks.some((t) => t.id === taskId) ? editor : null;
}

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "projects-loaded":
      return { ...state, projects: action.projects, projectsLoaded: true };

    case "project-created":
      return { ...state, projects: [...state.projects, action.project] };

    case "project-renamed": {
      const renamed = action.project;
      const current =
        state.current?.id === renamed.id ? { ...state.current, name: renamed.name } : state.current;
      return {
        ...state,
        projects: state.projects.map((p) => (p.id === renamed.id ? renamed : p)),
        current,
      };
    }

    case "project-deleted": {
      const projects = state.projects.filter((p) => p.id !== action.id);
      if (state.current?.id !== action.id) {
        return { ...state, projects };
      }
      return {
        ...state,
        projects,
        current: null,
        editor: null,
        rosterOpen: false,
        lastChangedTaskIds: [],
      };
    }

    case "project-opened": {
      const project = action.project;
      if (project === null) {
        return { ...state, current: null, editor: null, rosterOpen: false, lastChangedTaskIds: [] };
      }
      const same = state.current?.id === project.id;
      return {
        ...state,
        projects: withSummaryOf(state.projects, project),
        current: project,
        editor: same ? editorFor(state.editor, project) : null,
        rosterOpen: same ? state.rosterOpen : false,
        lastChangedTaskIds: [],
      };
    }

    case "mutation-applied": {
      const { project, changed_task_ids, created_id } = action.result;
      const projects = withSummaryOf(state.projects, project);
      if (state.current?.id !== project.id) {
        // A late response for a project the user has since left: keep what is on screen.
        return { ...state, projects };
      }
      return {
        ...state,
        projects,
        current: project,
        editor: action.opensCreatedTask
          ? editorAfterCreate(state.editor, created_id, project)
          : editorFor(state.editor, project),
        lastChangedTaskIds: changed_task_ids,
      };
    }

    case "palette-loaded":
      return { ...state, palette: action.palette };

    case "zoom-set":
      return { ...state, zoom: action.zoom };

    case "error-set":
      return { ...state, error: action.message };

    case "error-cleared":
      return { ...state, error: null };

    // The editor and roster drawers share the right edge, so opening one closes the other.
    case "editor-set":
      return {
        ...state,
        editor: action.editor,
        rosterOpen: action.editor === null ? state.rosterOpen : false,
      };

    case "roster-set":
      return { ...state, rosterOpen: action.open, editor: action.open ? null : state.editor };

    case "confirm-set":
      return { ...state, confirm: action.confirm };
  }
}
