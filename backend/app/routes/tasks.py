"""Task endpoints (C2). Scheduling happens in `app.services.tasks`."""

from fastapi import APIRouter

from app import db
from app.detail import MutationResult
from app.services import tasks
from app.services.tasks import TaskIn, TaskPatch

router = APIRouter(prefix="/api")


@router.post("/projects/{project_id}/tasks", status_code=201)
def create_task(project_id: int, body: TaskIn, conn: db.Conn) -> MutationResult:
    return tasks.create_task(conn, project_id, body)


@router.patch("/tasks/{task_id}")
def update_task(task_id: int, body: TaskPatch, conn: db.Conn) -> MutationResult:
    return tasks.patch_task(conn, task_id, body, body.model_fields_set)


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, conn: db.Conn) -> MutationResult:
    return tasks.delete_task(conn, task_id)
