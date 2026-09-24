"""Static reference data for the client."""

from typing import TypedDict

from fastapi import APIRouter

from app.palette import NEUTRAL, PALETTE

router = APIRouter(prefix="/api")


class PaletteColourOut(TypedDict):
    name: str
    fill: str
    label: str


class NeutralOut(TypedDict):
    fill: str
    label: str


class PaletteOut(TypedDict):
    colours: list[PaletteColourOut]
    neutral: NeutralOut


@router.get("/palette")
def get_palette() -> PaletteOut:
    return {
        "colours": [{"name": c.name, "fill": c.fill, "label": c.label} for c in PALETTE],
        "neutral": {"fill": NEUTRAL.fill, "label": NEUTRAL.label},
    }
