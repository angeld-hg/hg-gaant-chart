"""Free project names for imports (AC24): "Launch" -> "Launch (2)" -> "Launch (3)"."""

from collections.abc import Set
from itertools import count

from app.names import MAX_NAME_LENGTH, name_key


def unique_import_name(name: str, existing_keys: Set[str]) -> str:
    """`name` if no project matches it, else the first free `name (n)` for n = 2, 3, ...

    `existing_keys` are the case-blind keys of the current project names. The suffix goes on
    the name as written; if it would not fit, the name is shortened from its end.
    """
    if name_key(name) not in existing_keys:
        return name
    for n in count(2):
        suffix = f" ({n})"
        candidate = name[: MAX_NAME_LENGTH - len(suffix)].rstrip() + suffix
        if name_key(candidate) not in existing_keys:
            return candidate
    raise AssertionError("unreachable: count() never ends")
