// One typed function per C2 endpoint. Every non-2xx response throws an ApiError whose message is
// the server's human-readable text, so the UI can show it as is.
import type {
  ApiErrorBody,
  ExportFile,
  MutationResult,
  Palette,
  PersonCreate,
  PersonPatch,
  ProjectDetail,
  ProjectSummary,
  TaskCreate,
  TaskPatch,
} from "./types.ts";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field: string | null;

  constructor(status: number, code: string, message: string, field: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }
  const error = (value as { error: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

async function errorFrom(response: Response): Promise<ApiError> {
  const text = await response.text();
  try {
    const body: unknown = JSON.parse(text);
    if (isApiErrorBody(body)) {
      return new ApiError(
        response.status,
        body.error.code,
        body.error.message,
        body.error.field ?? null,
      );
    }
  } catch {
    // Not JSON (for example a proxy error page): fall through to the status text.
  }
  const status = response.statusText
    ? `${response.status} ${response.statusText}`
    : `${response.status}`;
  return new ApiError(response.status, "http_error", `Request failed: ${status}`);
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError(0, "network", "Cannot reach the server. Is the backend running?");
  }
  if (!response.ok) {
    throw await errorFrom(response);
  }
  return response;
}

async function sendJson<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const response = await send(path, init);
  return (await response.json()) as T;
}

async function sendNoContent(method: string, path: string): Promise<void> {
  await send(path, { method });
}

export function getPalette(): Promise<Palette> {
  return sendJson("GET", "/api/palette");
}

export function listProjects(): Promise<ProjectSummary[]> {
  return sendJson("GET", "/api/projects");
}

export function createProject(name: string): Promise<ProjectSummary> {
  return sendJson("POST", "/api/projects", { name });
}

export function getProject(id: number): Promise<ProjectDetail> {
  return sendJson("GET", `/api/projects/${id}`);
}

export function renameProject(id: number, name: string): Promise<ProjectSummary> {
  return sendJson("PATCH", `/api/projects/${id}`, { name });
}

export function deleteProject(id: number): Promise<void> {
  return sendNoContent("DELETE", `/api/projects/${id}`);
}

export function createPerson(projectId: number, input: PersonCreate): Promise<MutationResult> {
  return sendJson("POST", `/api/projects/${projectId}/people`, input);
}

export function updatePerson(id: number, patch: PersonPatch): Promise<MutationResult> {
  return sendJson("PATCH", `/api/people/${id}`, patch);
}

export function deletePerson(id: number): Promise<MutationResult> {
  return sendJson("DELETE", `/api/people/${id}`);
}

export function createTask(projectId: number, input: TaskCreate): Promise<MutationResult> {
  return sendJson("POST", `/api/projects/${projectId}/tasks`, input);
}

export function updateTask(id: number, patch: TaskPatch): Promise<MutationResult> {
  return sendJson("PATCH", `/api/tasks/${id}`, patch);
}

export function deleteTask(id: number): Promise<MutationResult> {
  return sendJson("DELETE", `/api/tasks/${id}`);
}

export function addDependency(
  projectId: number,
  predecessorId: number,
  successorId: number,
): Promise<MutationResult> {
  return sendJson("POST", `/api/projects/${projectId}/dependencies`, {
    predecessor_id: predecessorId,
    successor_id: successorId,
  });
}

export function removeDependency(id: number): Promise<MutationResult> {
  return sendJson("DELETE", `/api/dependencies/${id}`);
}

function filenameFrom(disposition: string | null): string | null {
  const match = disposition?.match(/filename="([^"]+)"/);
  return match?.[1] ?? null;
}

/** The export bytes exactly as the server sent them (C5: clients never re-serialise). */
export async function exportProject(id: number): Promise<ExportFile> {
  const response = await send(`/api/projects/${id}/export`);
  const filename =
    filenameFrom(response.headers.get("content-disposition")) ?? `project-${id}.gantt.json`;
  return { blob: await response.blob(), filename };
}

/** Posts the file's bytes unchanged; the server validates everything (AC23). */
export function importProject(file: Blob): Promise<ProjectDetail> {
  return send("/api/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: file,
  }).then((response) => response.json() as Promise<ProjectDetail>);
}
