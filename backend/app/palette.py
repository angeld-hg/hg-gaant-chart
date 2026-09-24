"""The fixed person palette (D7) with readable label colours (AC38)."""

from collections.abc import Iterable
from dataclasses import dataclass

DARK_LABEL = "#111827"
LIGHT_LABEL = "#ffffff"


@dataclass(frozen=True)
class PaletteColour:
    name: str
    fill: str
    label: str


@dataclass(frozen=True)
class NeutralColour:
    fill: str
    label: str


# Ordered so that people added one after another get clearly different colours.
PALETTE: tuple[PaletteColour, ...] = (
    PaletteColour("blue", "#2563eb", LIGHT_LABEL),
    PaletteColour("orange", "#ea580c", DARK_LABEL),
    PaletteColour("green", "#16a34a", DARK_LABEL),
    PaletteColour("purple", "#7c3aed", LIGHT_LABEL),
    PaletteColour("amber", "#f59e0b", DARK_LABEL),
    PaletteColour("teal", "#14b8a6", DARK_LABEL),
    PaletteColour("red", "#dc2626", LIGHT_LABEL),
    PaletteColour("sky", "#38bdf8", DARK_LABEL),
    PaletteColour("pink", "#db2777", LIGHT_LABEL),
    PaletteColour("lime", "#84cc16", DARK_LABEL),
    PaletteColour("brown", "#92400e", LIGHT_LABEL),
    PaletteColour("fuchsia", "#c026d3", LIGHT_LABEL),
)

# Unassigned tasks: a mid grey that is not a palette fill.
NEUTRAL = NeutralColour("#9ca3af", DARK_LABEL)

_FILLS = frozenset(c.fill for c in PALETTE)


def _channel(value: int) -> float:
    c = value / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def relative_luminance(hex_colour: str) -> float:
    r, g, b = (int(hex_colour[i : i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * _channel(r) + 0.7152 * _channel(g) + 0.0722 * _channel(b)


def contrast_ratio(a: str, b: str) -> float:
    """WCAG 2.x contrast ratio between two "#rrggbb" colours (1.0 to 21.0)."""
    lighter, darker = sorted((relative_luminance(a), relative_luminance(b)), reverse=True)
    return (lighter + 0.05) / (darker + 0.05)


def is_palette_colour(value: object) -> bool:
    return isinstance(value, str) and value in _FILLS


def default_colour(used: Iterable[str]) -> str:
    """The first palette fill not in `used`, or the first fill when every one is taken."""
    taken = set(used)
    return next((c.fill for c in PALETTE if c.fill not in taken), PALETTE[0].fill)
