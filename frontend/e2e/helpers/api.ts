// Seeding helpers for e2e specs (plan contract C6). They call the API through the Vite proxy using
// the Playwright `request` fixture, whose baseURL is the e2e web server, so they follow whatever
// ports the run was started with (GANTT_E2E_API_PORT / GANTT_E2E_WEB_PORT).
import { type APIRequestContext, type APIResponse, expect } from "@playwright/test";
import type { MutationResult, ProjectSummary } from "../../src/api/types.ts";

async function ok<T>(response: APIResponse, what: string): Promise<T> {
  expect(response.ok(), `${what}: HTTP ${response.status()} ${await response.text()}`).toBe(true);
  return (await response.json()) as T;
}

/** Deletes every project (and with it every task, dependency and person). */
export async function resetDb(req: APIRequestContext): Promise<void> {
  const projects = await ok<ProjectSummary[]>(await req.get("/api/projects"), "list projects");
  for (const project of projects) {
    const response = await req.delete(`/api/projects/${project.id}`);
    expect(response.status(), `delete project ${project.id}`).toBe(204);
  }
}

export async function createProject(req: APIRequestContext, name: string): Promise<ProjectSummary> {
  return ok<ProjectSummary>(
    await req.post("/api/projects", { data: { name } }),
    `create project "${name}"`,
  );
}

export async function createPerson(
  req: APIRequestContext,
  projectId: number,
  name: string,
  colour?: string,
): Promise<number> {
  const data = colour === undefined ? { name } : { name, colour };
  const result = await ok<MutationResult>(
    await req.post(`/api/projects/${projectId}/people`, { data }),
    `create person "${name}"`,
  );
  return result.created_id as number;
}

export interface TaskBody {
  name: string;
  start: string;
  duration?: number;
  end?: string;
  is_milestone?: boolean;
  percent_complete?: number;
  assignee_id?: number | null;
}

export async function createTask(
  req: APIRequestContext,
  projectId: number,
  body: TaskBody,
): Promise<number> {
  const result = await ok<MutationResult>(
    await req.post(`/api/projects/${projectId}/tasks`, { data: body }),
    `create task "${body.name}"`,
  );
  return result.created_id as number;
}

export async function addDependency(
  req: APIRequestContext,
  projectId: number,
  pred: number,
  succ: number,
): Promise<number> {
  const result = await ok<MutationResult>(
    await req.post(`/api/projects/${projectId}/dependencies`, {
      data: { predecessor_id: pred, successor_id: succ },
    }),
    `add dependency ${pred} -> ${succ}`,
  );
  return result.created_id as number;
}

export interface SeedFixture {
  name: string;
  people?: { name: string; colour?: string }[];
  tasks: {
    name: string;
    start: string;
    duration?: number;
    is_milestone?: boolean;
    percent_complete?: number;
    /** A person name from `people`. */
    assignee?: string;
  }[];
  /** [predecessor task name, successor task name]. */
  deps?: [string, string][];
}

export interface SeededProject {
  projectId: number;
  taskIds: Record<string, number>;
  personIds: Record<string, number>;
}

/** Creates a project with its people, tasks (in order) and dependencies. */
export async function seedProject(
  req: APIRequestContext,
  fixture: SeedFixture,
): Promise<SeededProject> {
  const { id: projectId } = await createProject(req, fixture.name);
  const personIds: Record<string, number> = {};
  for (const person of fixture.people ?? []) {
    personIds[person.name] = await createPerson(req, projectId, person.name, person.colour);
  }
  const taskIds: Record<string, number> = {};
  for (const { assignee, ...task } of fixture.tasks) {
    const body: TaskBody = { ...task };
    if (assignee !== undefined) {
      const assigneeId = personIds[assignee];
      if (assigneeId === undefined) {
        throw new Error(`seedProject: unknown assignee "${assignee}" for task "${task.name}"`);
      }
      body.assignee_id = assigneeId;
    }
    taskIds[task.name] = await createTask(req, projectId, body);
  }
  for (const [predName, succName] of fixture.deps ?? []) {
    const pred = taskIds[predName];
    const succ = taskIds[succName];
    if (pred === undefined || succ === undefined) {
      throw new Error(`seedProject: unknown task in dependency ${predName} -> ${succName}`);
    }
    await addDependency(req, projectId, pred, succ);
  }
  return { projectId, taskIds, personIds };
}
