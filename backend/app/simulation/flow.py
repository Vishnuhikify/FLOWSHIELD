"""Surface water movement between 4-connected neighbours (up, down, left, right).

MODEL (deliberately simple and explainable - NOT a hydraulic solver)

    head = elevation + water depth            (water surface height, m)

For every pair of adjacent cells, water moves from the higher head to the lower:

    edge_flow = flow_rate * timestep * (head_high - head_low)

then two safety rules are applied:

  1. AVAILABILITY  A cell cannot give away more water than it holds. If the sum
     of its outgoing edge flows exceeds its water, all of its outgoing flows are
     scaled down by the same factor (water is shared proportionally).
  2. STABILITY     flow_rate * timestep <= 0.25 (checked in SimulationConfig), so
     one edge never moves more than a quarter of the head difference and a cell
     with four neighbours cannot overshoot and oscillate.

All edge flows are computed from the SAME snapshot and applied together
(synchronous update), so the result does not depend on cell iteration order
-> deterministic. Whatever leaves one cell arrives in its neighbour -> water is
conserved. Grid edges are closed walls: nothing flows off the map.
"""
from __future__ import annotations

from typing import Optional

import numpy as np


def compute_flow(
    water: np.ndarray,
    elevation: np.ndarray,
    flow_rate: float,
    timestep: float,
    barrier: Optional[np.ndarray] = None,
) -> tuple[np.ndarray, np.ndarray]:
    """Return (incoming, outgoing) water depth per cell for one timestep. Pure function."""
    rows, cols = water.shape
    incoming = np.zeros_like(water, dtype=float)
    outgoing = np.zeros_like(water, dtype=float)
    if flow_rate == 0 or water.size == 1:
        return incoming, outgoing

    head = elevation + water
    k = flow_rate * timestep
    is_open = np.ones(water.shape, dtype=bool) if barrier is None else ~barrier

    # Signed flow across each edge. Boundary cells simply have fewer edges.
    #   horizontal h[r, c]: between (r, c) and (r, c+1); positive = moving right
    #   vertical   v[r, c]: between (r, c) and (r+1, c); positive = moving down
    h = k * (head[:, :-1] - head[:, 1:]) * (is_open[:, :-1] & is_open[:, 1:])
    v = k * (head[:-1, :] - head[1:, :]) * (is_open[:-1, :] & is_open[1:, :])
    right, left = np.maximum(h, 0.0), np.maximum(-h, 0.0)
    down, up = np.maximum(v, 0.0), np.maximum(-v, 0.0)

    # Total water each cell WANTS to send out.
    desired = np.zeros_like(incoming)
    desired[:, :-1] += right
    desired[:, 1:] += left
    desired[:-1, :] += down
    desired[1:, :] += up

    # Rule 1: never send more than the cell holds.
    scale = np.ones_like(desired)
    over = desired > water
    scale[over] = water[over] / desired[over]

    right = right * scale[:, :-1]
    left = left * scale[:, 1:]
    down = down * scale[:-1, :]
    up = up * scale[1:, :]

    outgoing[:, :-1] += right
    outgoing[:, 1:] += left
    outgoing[:-1, :] += down
    outgoing[1:, :] += up

    incoming[:, 1:] += right
    incoming[:, :-1] += left
    incoming[1:, :] += down
    incoming[:-1, :] += up
    return incoming, outgoing
