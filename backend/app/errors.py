"""The single error shape of the API (C2 `ApiErrorBody`) and the handlers that produce it."""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, field: str | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.field = field


def not_found(what: str, item_id: int) -> ApiError:
    return ApiError(404, "not_found", f"{what} {item_id} does not exist.")


def error_response(status: int, code: str, message: str, field: str | None) -> JSONResponse:
    return JSONResponse(
        status_code=status, content={"error": {"code": code, "message": message, "field": field}}
    )


def _validation_field(loc: tuple[object, ...]) -> str | None:
    """The request field an error is about: the first name after `body`/`path`/`query`."""
    names = [part for part in loc[1:] if isinstance(part, str)]
    return names[0] if names else None


def _validation_message(error: dict[str, object], field: str | None) -> str:
    kind = error.get("type")
    if kind == "extra_forbidden":
        return f"Unknown field '{field}'."
    if kind == "missing":
        return f"'{field}' is required."
    if kind == "json_invalid":
        return "The request body is not valid JSON."
    detail = str(error.get("msg", "Invalid value"))
    return f"'{field}': {detail}." if field else f"{detail}."


async def _api_error_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ApiError)
    return error_response(exc.status, exc.code, exc.message, exc.field)


async def _validation_error_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    errors = exc.errors()
    first: dict[str, object] = dict(errors[0]) if errors else {}
    loc = first.get("loc", ())
    field = _validation_field(tuple(loc) if isinstance(loc, (list, tuple)) else ())
    return error_response(422, "invalid", _validation_message(first, field), field)


async def _http_error_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    code = "not_found" if exc.status_code == 404 else "http_error"
    return error_response(exc.status_code, code, str(exc.detail), None)


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _api_error_handler)
    app.add_exception_handler(RequestValidationError, _validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, _http_error_handler)
