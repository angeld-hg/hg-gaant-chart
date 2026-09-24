import re
from datetime import date
from pathlib import Path

import pytest

from app.scheduling.dates import (
    MAX_DATE,
    MAX_DURATION,
    MIN_DATE,
    DateFormatError,
    end_from,
    format_iso,
    inclusive_days,
    parse_iso_date,
)

SCHEDULING_DIR = Path(__file__).resolve().parents[2] / "app" / "scheduling"


def test_limits_match_ac40() -> None:
    assert date(2000, 1, 1) == MIN_DATE
    assert date(2099, 12, 31) == MAX_DATE
    assert MAX_DURATION == 3650


@pytest.mark.parametrize(
    ("start", "duration", "expected"),
    [
        (date(2026, 10, 5), 3, date(2026, 10, 7)),  # AC3
        (date(2026, 10, 9), 3, date(2026, 10, 11)),  # AC27: Fri + 3 calendar days = Sun
        (date(2026, 10, 5), 1, date(2026, 10, 5)),
        (date(2026, 12, 30), 3, date(2027, 1, 1)),
        (date(2028, 2, 28), 2, date(2028, 2, 29)),
    ],
)
def test_end_from_counts_calendar_days_inclusively(
    start: date, duration: int, expected: date
) -> None:
    assert end_from(start, duration) == expected


@pytest.mark.parametrize("duration", [0, -1])
def test_end_from_rejects_duration_below_one(duration: int) -> None:
    with pytest.raises(ValueError):
        end_from(date(2026, 10, 5), duration)


@pytest.mark.parametrize(
    ("start", "end", "expected"),
    [
        (date(2026, 10, 5), date(2026, 10, 7), 3),
        (date(2026, 10, 9), date(2026, 10, 11), 3),
        (date(2026, 10, 5), date(2026, 10, 5), 1),
    ],
)
def test_inclusive_days(start: date, end: date, expected: int) -> None:
    assert inclusive_days(start, end) == expected


def test_parse_and_format_round_trip() -> None:
    parsed = parse_iso_date("2026-10-05")

    assert parsed == date(2026, 10, 5)
    assert format_iso(parsed) == "2026-10-05"
    assert format_iso(date(2000, 1, 1)) == "2000-01-01"


@pytest.mark.parametrize(
    "value",
    [
        "2026-2-5",
        "2026-02-30",
        "2026-10-05T00:00",
        "2026-13-01",
        "2026-00-10",
        "0000-01-01",
        "",
        " 2026-10-05",
        "2026-10-05 ",
        "2026-10-05\n",
        "20261005",
        "2026/10/05",
        "٢٠٢٦-10-05",  # non-ASCII digits
    ],
)
def test_parse_iso_date_rejects_bad_strings(value: str) -> None:
    with pytest.raises(DateFormatError):
        parse_iso_date(value)


@pytest.mark.parametrize("value", [None, 20261005, 3.5, True, date(2026, 10, 5), ["2026-10-05"]])
def test_parse_iso_date_rejects_non_strings(value: object) -> None:
    with pytest.raises(DateFormatError):
        parse_iso_date(value)


def test_date_format_error_is_a_value_error() -> None:
    assert issubclass(DateFormatError, ValueError)


def test_scheduling_package_has_no_db_or_http_imports() -> None:
    forbidden = re.compile(
        r"^\s*(import|from)\s+(sqlite3|fastapi|app\.db|starlette|pydantic)\b", re.MULTILINE
    )
    sources = sorted(SCHEDULING_DIR.glob("*.py"))

    assert sources, "expected scheduling modules to exist"
    for source in sources:
        text = source.read_text(encoding="utf-8")
        assert not forbidden.search(text), f"{source.name} imports a DB or HTTP module"
        assert "app.db" not in text, f"{source.name} references app.db"
