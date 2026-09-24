import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  createProject,
  deleteProject,
  exportProject,
  importProject,
  listProjects,
  updateTask,
} from "./client.ts";

type FetchArgs = [input: string, init?: RequestInit];

function stubFetch(response: Response | (() => Promise<Response>)) {
  const fn = vi.fn<(...args: FetchArgs) => Promise<Response>>(() =>
    typeof response === "function" ? response() : Promise.resolve(response),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

function json(body: unknown, status = 200, statusText = "OK"): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { "content-type": "application/json" },
  });
}

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected the call to throw an ApiError");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("successful calls", () => {
  it("GETs the project list as JSON", async () => {
    const fetchMock = stubFetch(json([{ id: 1, name: "Launch", task_count: 0 }]));

    await expect(listProjects()).resolves.toEqual([{ id: 1, name: "Launch", task_count: 0 }]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/projects");
  });

  it("POSTs a JSON body with a JSON content type", async () => {
    const fetchMock = stubFetch(json({ id: 3, name: "Launch", task_count: 0 }, 201));

    await createProject("Launch");

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/projects");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(init?.body).toBe('{"name":"Launch"}');
  });

  it("PATCHes only the fields it is given, passing typed text through unchanged", async () => {
    const fetchMock = stubFetch(json({ project: {}, changed_task_ids: [4], created_id: null }));

    await updateTask(4, { duration: "3.5" });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/tasks/4");
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe('{"duration":"3.5"}');
  });

  it("treats 204 No Content as success with no body", async () => {
    stubFetch(new Response(null, { status: 204 }));

    await expect(deleteProject(7)).resolves.toBeUndefined();
  });
});

describe("error parsing", () => {
  it("reads code, message and field from an ApiErrorBody", async () => {
    stubFetch(
      json(
        {
          error: {
            code: "name_taken",
            message: 'A project named "Launch" already exists.',
            field: "name",
          },
        },
        409,
        "Conflict",
      ),
    );

    const error = await caught(createProject("launch"));

    expect(error.status).toBe(409);
    expect(error.code).toBe("name_taken");
    expect(error.message).toBe('A project named "Launch" already exists.');
    expect(error.field).toBe("name");
  });

  it("falls back to the status text when the body is not an ApiErrorBody", async () => {
    stubFetch(new Response("<html>oops</html>", { status: 502, statusText: "Bad Gateway" }));

    const error = await caught(listProjects());

    expect(error.status).toBe(502);
    expect(error.code).toBe("http_error");
    expect(error.message).toBe("Request failed: 502 Bad Gateway");
    expect(error.field).toBeNull();
  });

  it("falls back to the status alone when there is no status text", async () => {
    stubFetch(json({ detail: "something else" }, 500, ""));

    const error = await caught(listProjects());

    expect(error.message).toBe("Request failed: 500");
  });

  it("turns a network failure into a readable ApiError", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    const error = await caught(listProjects());

    expect(error.status).toBe(0);
    expect(error.code).toBe("network");
    expect(error.message).toMatch(/cannot reach the server/i);
  });
});

describe("export and import", () => {
  it("returns the untouched response bytes and the server's file name", async () => {
    const bytes = '{\n  "format": "hg-gantt",\n  "version": 1\n}\n';
    stubFetch(
      new Response(bytes, {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-disposition": 'attachment; filename="launch.gantt.json"',
        },
      }),
    );

    const file = await exportProject(5);

    expect(file.filename).toBe("launch.gantt.json");
    expect(await file.blob.text()).toBe(bytes);
  });

  it("falls back to a generic file name when the header is missing", async () => {
    stubFetch(new Response("{}", { status: 200 }));

    const file = await exportProject(5);

    expect(file.filename).toBe("project-5.gantt.json");
  });

  it("POSTs the file bytes unchanged to /api/import", async () => {
    const fetchMock = stubFetch(json({ id: 9, name: "Launch (2)" }, 201));
    const file = new Blob(['{"format":"hg-gantt"}'], { type: "application/json" });

    await importProject(file);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/import");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(file);
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
  });

  it("surfaces an import rejection message", async () => {
    stubFetch(
      json(
        {
          error: {
            code: "import_invalid",
            message: "Dependency cycle: t1 -> t2 -> t1.",
            field: null,
          },
        },
        422,
      ),
    );

    const error = await caught(importProject(new Blob(["{}"])));

    expect(error.code).toBe("import_invalid");
    expect(error.message).toBe("Dependency cycle: t1 -> t2 -> t1.");
  });
});
