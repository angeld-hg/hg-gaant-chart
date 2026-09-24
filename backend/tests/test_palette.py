import re

import pytest
from fastapi.testclient import TestClient

from app.palette import (
    NEUTRAL,
    PALETTE,
    PaletteColour,
    contrast_ratio,
    default_colour,
    is_palette_colour,
)

HEX = re.compile(r"#[0-9a-f]{6}")


def test_palette_has_twelve_distinct_lowercase_colours() -> None:
    fills = [c.fill for c in PALETTE]

    assert len(PALETTE) == 12
    assert len(set(fills)) == 12
    assert len({c.name for c in PALETTE}) == 12
    assert all(HEX.fullmatch(f) for f in fills)
    assert all(HEX.fullmatch(c.label) for c in PALETTE)


@pytest.mark.parametrize("colour", PALETTE, ids=lambda c: c.name)
def test_every_palette_label_has_at_least_4_5_contrast(colour: PaletteColour) -> None:
    assert contrast_ratio(colour.fill, colour.label) >= 4.5


def test_neutral_pair_passes_and_is_not_in_the_palette() -> None:
    assert contrast_ratio(NEUTRAL.fill, NEUTRAL.label) >= 4.5
    assert HEX.fullmatch(NEUTRAL.fill)
    assert not is_palette_colour(NEUTRAL.fill)


@pytest.mark.parametrize(
    ("a", "b", "expected"),
    [("#ffffff", "#000000", 21.0), ("#000000", "#ffffff", 21.0), ("#777777", "#777777", 1.0)],
)
def test_contrast_ratio_matches_wcag_reference_values(a: str, b: str, expected: float) -> None:
    assert contrast_ratio(a, b) == pytest.approx(expected, abs=0.01)


def test_contrast_ratio_of_grey_on_white_matches_known_value() -> None:
    # #767676 on white is the classic "just passes AA" grey: 4.54:1.
    assert contrast_ratio("#767676", "#ffffff") == pytest.approx(4.54, abs=0.01)


def test_is_palette_colour_accepts_only_exact_palette_fills() -> None:
    assert is_palette_colour(PALETTE[0].fill)
    assert not is_palette_colour(PALETTE[0].fill.upper())
    assert not is_palette_colour("#123456")
    assert not is_palette_colour("x")


def test_default_colour_is_first_unused_then_first() -> None:
    fills = [c.fill for c in PALETTE]

    assert default_colour([]) == fills[0]
    assert default_colour([fills[0]]) == fills[1]
    assert default_colour([fills[1], fills[0], fills[0]]) == fills[2]
    assert default_colour([fills[0], fills[2]]) == fills[1]
    assert default_colour(fills) == fills[0]


def test_palette_endpoint_returns_contract_shape(client: TestClient) -> None:
    response = client.get("/api/palette")

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "colours": [{"name": c.name, "fill": c.fill, "label": c.label} for c in PALETTE],
        "neutral": {"fill": NEUTRAL.fill, "label": NEUTRAL.label},
    }
