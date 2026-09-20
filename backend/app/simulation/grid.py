"""City grid helpers: neighbour lookup, rainfall overrides and the synthetic demo city."""
from __future__ import annotations

from dataclasses import replace

from .models import CityGrid

_DIRECTIONS = {"up": (-1, 0), "down": (1, 0), "left": (0, -1), "right": (0, 1)}


def get_neighbors(city: CityGrid, row: int, col: int) -> dict[str, tuple[int, int]]:
    """4-connected neighbours that exist. Corner cells have 2, edge cells 3, inner cells 4."""
    if not (0 <= row < city.rows and 0 <= col < city.cols):
        raise IndexError(f"cell ({row}, {col}) is outside a {city.rows}x{city.cols} grid")
    return {
        name: (row + dr, col + dc)
        for name, (dr, dc) in _DIRECTIONS.items()
        if 0 <= row + dr < city.rows and 0 <= col + dc < city.cols
    }


def with_rainfall(city: CityGrid, rainfall) -> CityGrid:
    """Copy of the city with new rainfall: one number (uniform) or a per-cell grid (mm/h)."""
    return replace(city, rainfall=rainfall)


def create_synthetic_city() -> CityGrid:
    """Deterministic 5x5 demo city. No external data, no randomness.

    Story: high ground in the north (row 1), a valley running south down the middle
    column, ending in a low, densely populated basin with weak drains (R5C3).
    The storm is heaviest over the northern hills, so runoff travels through the
    valley and collects in the south.
    """
    elevation = [  # metres
        [10.90, 10.75, 10.60, 10.75, 10.95],
        [10.70, 10.50, 10.35, 10.55, 10.75],
        [10.50, 10.30, 10.10, 10.30, 10.55],
        [10.35, 10.10,  9.90, 10.15, 10.40],
        [10.25, 10.00,  9.80, 10.05, 10.30],
    ]
    rainfall = [  # mm/h
        [90, 90, 85, 85, 80],
        [85, 85, 80, 80, 75],
        [75, 75, 70, 70, 65],
        [65, 65, 60, 60, 55],
        [60, 60, 55, 55, 50],
    ]
    drainage_capacity = [  # mm/h - old town in the south-centre has the weakest drains
        [40, 40, 35, 40, 40],
        [35, 30, 30, 30, 35],
        [30, 25, 20, 25, 30],
        [30, 20, 15, 20, 30],
        [25, 15, 10, 15, 25],
    ]
    initial_water = [  # metres - ground already wet in the valley floor
        [0.00, 0.00, 0.00, 0.00, 0.00],
        [0.00, 0.00, 0.00, 0.00, 0.00],
        [0.00, 0.00, 0.02, 0.00, 0.00],
        [0.00, 0.00, 0.03, 0.00, 0.00],
        [0.00, 0.02, 0.05, 0.02, 0.00],
    ]
    population = [
        [ 400,  600,  800,  600,  400],
        [ 700, 1200, 1500, 1100,  600],
        [ 900, 1800, 2500, 1700,  800],
        [1000, 2200, 3200, 2000,  900],
        [ 800, 2000, 3000, 1800,  700],
    ]
    return CityGrid(rows=5, cols=5, elevation=elevation, rainfall=rainfall,
                    drainage_capacity=drainage_capacity, initial_water=initial_water,
                    population=population)
