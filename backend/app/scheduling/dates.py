"""Calendar-day date maths. Every day counts, weekends included (AC27)."""

import re
from datetime import date, timedelta

MIN_DATE = date(2000, 1, 1)
MAX_DATE = date(2099, 12, 31)
MAX_DURATION = 3650

_ISO_DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")


class DateFormatError(ValueError):
    """The value is not a real calendar date written as YYYY-MM-DD."""


def parse_iso_date(value: object) -> date:
    if not isinstance(value, str) or not _ISO_DATE.fullmatch(value):
        raise DateFormatError(f"{value!r} is not a date in YYYY-MM-DD form")
    year, month, day = (int(part) for part in value.split("-"))
    try:
        return date(year, month, day)
    except ValueError as exc:
        raise DateFormatError(f"{value!r} is not a real calendar date") from exc


def format_iso(d: date) -> str:
    return d.isoformat()


def end_from(start: date, duration: int) -> date:
    """Last day of a task that starts on `start` and lasts `duration` days (inclusive)."""
    if duration < 1:
        raise ValueError(f"duration must be at least 1, got {duration}")
    return start + timedelta(days=duration - 1)


def inclusive_days(start: date, end: date) -> int:
    return (end - start).days + 1
