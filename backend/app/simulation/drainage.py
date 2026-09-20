"""Drainage: each cell removes water at up to its drainage capacity.

    drained = min(capacity_mm_per_hour converted to m per step, current water)

so drained_water <= current_water always holds and water never goes negative.
Drained water leaves the model (it is the only sink).
"""
from __future__ import annotations

import numpy as np

from .models import MM_PER_HOUR_TO_M_PER_MIN


def compute_drainage(water: np.ndarray, capacity_mm_per_hour: np.ndarray, timestep: float) -> np.ndarray:
    """Return the depth (m) drained from each cell during one timestep."""
    capacity_m = capacity_mm_per_hour * MM_PER_HOUR_TO_M_PER_MIN * timestep
    return np.minimum(capacity_m, water)
