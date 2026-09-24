"""Name rules shared by projects, people and tasks (AC40) and the case-blind match key."""

from app.errors import ApiError

MAX_NAME_LENGTH = 100


def clean_name(raw: object, what: str) -> str:
    """Trim and validate a name; `what` is the subject of the message, e.g. "Project name"."""
    if not isinstance(raw, str):
        raise ApiError(422, "invalid", f"{what} must be text.", "name")
    name = raw.strip()
    if not name:
        raise ApiError(422, "invalid", f"{what} must not be empty.", "name")
    if len(name) > MAX_NAME_LENGTH:
        raise ApiError(
            422, "invalid", f"{what} must be at most {MAX_NAME_LENGTH} characters.", "name"
        )
    return name


def name_key(name: str) -> str:
    return name.casefold()
