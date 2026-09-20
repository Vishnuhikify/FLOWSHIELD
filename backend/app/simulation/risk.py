"""Risk classification, time-to-critical and population metrics.

Risk depends only on standing water depth in the cell:
    depth >= critical_threshold -> CRITICAL
    depth >= warning_threshold  -> WARNING
    otherwise                   -> SAFE
Thresholds come from SimulationConfig and are prototype assumptions.
"""
from __future__ import annotations

from typing import Optional

import numpy as np

from .models import RiskLevel


def classify_risk(water: np.ndarray, warning_threshold: float, critical_threshold: float) -> np.ndarray:
    """Works on a single grid or a whole (time, rows, cols) stack."""
    risk = np.full(water.shape, int(RiskLevel.SAFE), dtype=np.int8)
    risk[water >= warning_threshold] = int(RiskLevel.WARNING)
    risk[water >= critical_threshold] = int(RiskLevel.CRITICAL)
    return risk


def first_critical_steps(risk_levels: np.ndarray) -> np.ndarray:
    """First timestep index at which each cell is CRITICAL; -1 if it never is."""
    is_critical = risk_levels == int(RiskLevel.CRITICAL)
    first = np.argmax(is_critical, axis=0)          # argmax returns 0 when there is no True...
    first[~is_critical.any(axis=0)] = -1            # ...so mark never-critical cells explicitly
    return first


def step_to_time(step: int, timestamps: list[float]) -> Optional[float]:
    return None if step < 0 else timestamps[step]


def population_metrics(peak_risk: np.ndarray, population: np.ndarray) -> dict[str, int]:
    """Peak-based population counts. affected = warning + critical (each region counted once)."""
    critical = int(population[peak_risk == int(RiskLevel.CRITICAL)].sum())
    warning = int(population[peak_risk == int(RiskLevel.WARNING)].sum())
    return {
        "total_population": int(population.sum()),
        "critical_population": critical,
        "warning_population": warning,
        "affected_population": critical + warning,
    }
