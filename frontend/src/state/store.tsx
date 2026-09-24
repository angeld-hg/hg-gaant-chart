// The app store (plan contract C6): a reducer in context plus async actions that talk to the API.
// Every project-scoped write replaces `state.current` with the server's ProjectDetail, so the
// client never schedules anything itself (D9, D11). Those writes run one at a time (createMutator).
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import * as api from "../api/client.ts";
import type {
  MutationResult,
  PersonCreate,
  PersonPatch,
  ProjectSummary,
  TaskCreate,
  TaskPatch,
} from "../api/types.ts";
import type { Zoom } from "../timeline/scale.ts";
import {
  type AppAction,
  type AppState,
  type ConfirmRequest,
  initialState,
  reducer,
} from "./reducer.ts";

export type { AppState, ConfirmRequest } from "./reducer.ts";

export type ActionResult = { ok: true } | { ok: false; message: string };

export const IMPORT_LIMIT_BYTES = 5 * 1024 * 1024;

export interface Actions {
  loadProjects(): Promise<void>;
  /** Also syncs `location.hash` to "#/projects/<id>". */
  openProject(id: number | null): Promise<void>;
  createProject(name: string): Promise<ActionResult>;
  renameProject(id: number, name: string): Promise<ActionResult>;
  /** The caller confirms first. */
  deleteProject(id: number): Promise<ActionResult>;
  createTask(input: TaskCreate): Promise<ActionResult>;
  updateTask(id: number, patch: TaskPatch): Promise<ActionResult>;
  deleteTask(id: number): Promise<ActionResult>;
  addDependency(pred: number, succ: number): Promise<ActionResult>;
  removeDependency(id: number): Promise<ActionResult>;
  createPerson(input: PersonCreate): Promise<ActionResult>;
  updatePerson(id: number, patch: PersonPatch): Promise<ActionResult>;
  deletePerson(id: number): Promise<ActionResult>;
  /** Downloads the raw response bytes as <slug>.gantt.json (never re-serialised, C5). */
  exportProject(id: number): Promise<ActionResult>;
  /** Rejects files over 5 MB client-side, else POSTs to /api/import and opens the new project. */
  importFile(file: File): Promise<ActionResult>;
  setZoom(z: Zoom): void;
  openTaskEditor(taskId: number | "new" | null): void;
  setRosterOpen(open: boolean): void;
  /** Resolves true when the user confirms, false when they cancel. */
  confirm(opts: ConfirmRequest): Promise<boolean>;
  /** Answers the pending `confirm` (used by ConfirmDialog). */
  resolveConfirm(ok: boolean): void;
  clearError(): void;
}

const StateContext = createContext<AppState | null>(null);
const ActionsContext = createContext<Actions | null>(null);

const HASH_PATTERN = /^#\/projects\/(\d+)$/;

export function projectIdFromHash(hash: string): number | null {
  const match = HASH_PATTERN.exec(hash);
  return match?.[1] ? Number(match[1]) : null;
}

function syncHash(id: number | null, replace: boolean): void {
  const wanted = id === null ? "" : `#/projects/${id}`;
  if (window.location.hash === wanted) {
    return;
  }
  if (id === null || replace) {
    const url = `${window.location.pathname}${window.location.search}${wanted}`;
    window.history.replaceState(null, "", url);
  } else {
    window.location.hash = wanted;
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Something went wrong.";
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface MutateOptions {
  /** Set by createTask: an open new-task editor moves on to the task named by `created_id`. */
  opensCreatedTask?: boolean;
}

export type Mutate = (
  run: () => Promise<MutationResult>,
  options?: MutateOptions,
) => Promise<ActionResult>;

/**
 * Project writes go out one at a time, in the order they were issued. Each response is a whole
 * ProjectDetail, so two writes in flight at once could land out of order and leave the older
 * snapshot on screen; waiting for the previous write means the latest one always wins.
 */
export function createMutator(
  dispatch: (action: AppAction) => void,
  fail: (error: unknown) => ActionResult,
): Mutate {
  let previous: Promise<unknown> = Promise.resolve();
  return (run, options = {}) => {
    const next = previous.then(async (): Promise<ActionResult> => {
      try {
        const result = await run();
        dispatch({ type: "mutation-applied", result, ...options });
        return { ok: true };
      } catch (error) {
        return fail(error);
      }
    });
    previous = next;
    return next;
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  // The id the user most recently asked to open, and a token that discards stale responses.
  const requestedId = useRef<number | null>(null);
  const openToken = useRef(0);
  const confirmResolver = useRef<((ok: boolean) => void) | null>(null);
  const booted = useRef(false);

  useLayoutEffect(() => {
    stateRef.current = state;
  });

  const { actions, boot } = useMemo(() => {
    function fail(error: unknown): ActionResult {
      const message = messageOf(error);
      dispatch({ type: "error-set", message });
      return { ok: false, message };
    }

    async function refreshProjects(): Promise<ProjectSummary[] | null> {
      try {
        const projects = await api.listProjects();
        dispatch({ type: "projects-loaded", projects });
        return projects;
      } catch (error) {
        fail(error);
        return null;
      }
    }

    async function open(id: number | null, replaceHash = false): Promise<void> {
      const token = ++openToken.current;
      requestedId.current = id;
      syncHash(id, replaceHash);
      if (id === null) {
        dispatch({ type: "project-opened", project: null });
        return;
      }
      try {
        const project = await api.getProject(id);
        if (token === openToken.current) {
          dispatch({ type: "project-opened", project });
        }
      } catch (error) {
        if (token !== openToken.current) {
          return;
        }
        requestedId.current = null;
        syncHash(null, true);
        dispatch({ type: "project-opened", project: null });
        fail(error);
      }
    }

    const mutate = createMutator(dispatch, fail);

    function openProjectId(): number | null {
      return stateRef.current.current?.id ?? null;
    }

    function noProject(): ActionResult {
      return fail(new Error("Open a project first."));
    }

    // Start-up: palette, project list, then the project named in the hash (or the first one).
    async function boot(): Promise<void> {
      api
        .getPalette()
        .then((palette) => dispatch({ type: "palette-loaded", palette }))
        .catch(fail);
      const projects = await refreshProjects();
      if (projects === null) {
        return;
      }
      const fromHash = projectIdFromHash(window.location.hash);
      const target =
        fromHash !== null && projects.some((p) => p.id === fromHash)
          ? fromHash
          : (projects[0]?.id ?? null);
      // A project opened while the list was loading (e.g. by a click) wins over the default.
      if (openToken.current === 0 && target !== null) {
        await open(target, true);
      }
    }

    const actions: Actions = {
      async loadProjects() {
        await refreshProjects();
      },

      openProject: (id) => open(id),

      async createProject(name) {
        try {
          const project = await api.createProject(name);
          dispatch({ type: "project-created", project });
          await open(project.id);
          return { ok: true };
        } catch (error) {
          return fail(error);
        }
      },

      async renameProject(id, name) {
        try {
          const project = await api.renameProject(id, name);
          dispatch({ type: "project-renamed", project });
          return { ok: true };
        } catch (error) {
          return fail(error);
        }
      },

      async deleteProject(id) {
        try {
          await api.deleteProject(id);
        } catch (error) {
          return fail(error);
        }
        const remaining = stateRef.current.projects.filter((p) => p.id !== id);
        dispatch({ type: "project-deleted", id });
        if (requestedId.current === id) {
          await open(remaining[0]?.id ?? null, true);
        }
        return { ok: true };
      },

      createTask(input) {
        const projectId = openProjectId();
        return projectId === null
          ? Promise.resolve(noProject())
          : mutate(() => api.createTask(projectId, input), { opensCreatedTask: true });
      },

      updateTask: (id, patch) => mutate(() => api.updateTask(id, patch)),

      deleteTask: (id) => mutate(() => api.deleteTask(id)),

      addDependency(pred, succ) {
        const projectId = openProjectId();
        return projectId === null
          ? Promise.resolve(noProject())
          : mutate(() => api.addDependency(projectId, pred, succ));
      },

      removeDependency: (id) => mutate(() => api.removeDependency(id)),

      createPerson(input) {
        const projectId = openProjectId();
        return projectId === null
          ? Promise.resolve(noProject())
          : mutate(() => api.createPerson(projectId, input));
      },

      updatePerson: (id, patch) => mutate(() => api.updatePerson(id, patch)),

      deletePerson: (id) => mutate(() => api.deletePerson(id)),

      async exportProject(id) {
        try {
          const { blob, filename } = await api.exportProject(id);
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = filename;
          link.style.display = "none";
          document.body.append(link);
          link.click();
          link.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          return { ok: true };
        } catch (error) {
          return fail(error);
        }
      },

      async importFile(file) {
        if (file.size > IMPORT_LIMIT_BYTES) {
          return fail(
            new Error(
              `"${file.name}" is ${formatBytes(file.size)}. Import files must be 5 MB or smaller.`,
            ),
          );
        }
        try {
          const project = await api.importProject(file);
          openToken.current += 1;
          requestedId.current = project.id;
          syncHash(project.id, false);
          await refreshProjects();
          dispatch({ type: "project-opened", project });
          return { ok: true };
        } catch (error) {
          return fail(error);
        }
      },

      setZoom: (zoom) => dispatch({ type: "zoom-set", zoom }),

      openTaskEditor: (taskId) =>
        dispatch({ type: "editor-set", editor: taskId === null ? null : { taskId } }),

      setRosterOpen: (openRoster) => dispatch({ type: "roster-set", open: openRoster }),

      confirm(opts) {
        confirmResolver.current?.(false);
        dispatch({ type: "confirm-set", confirm: opts });
        return new Promise<boolean>((resolve) => {
          confirmResolver.current = resolve;
        });
      },

      resolveConfirm(ok) {
        const resolve = confirmResolver.current;
        confirmResolver.current = null;
        dispatch({ type: "confirm-set", confirm: null });
        resolve?.(ok);
      },

      clearError: () => dispatch({ type: "error-cleared" }),
    };
    return { actions, boot };
  }, []);

  useEffect(() => {
    if (!booted.current) {
      booted.current = true;
      void boot();
    }
  }, [boot]);

  // Back/forward and hand-edited URLs.
  useEffect(() => {
    function onHashChange() {
      const id = projectIdFromHash(window.location.hash);
      if (id !== null && id !== requestedId.current) {
        void actions.openProject(id);
      }
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [actions]);

  return (
    <ActionsContext.Provider value={actions}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </ActionsContext.Provider>
  );
}

export function useAppState(): AppState {
  const state = useContext(StateContext);
  if (state === null) {
    throw new Error("useAppState must be used inside <AppProvider>");
  }
  return state;
}

export function useActions(): Actions {
  const actions = useContext(ActionsContext);
  if (actions === null) {
    throw new Error("useActions must be used inside <AppProvider>");
  }
  return actions;
}
