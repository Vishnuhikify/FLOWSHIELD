"""Scenario definitions.

A scenario is a pure function  CityGrid -> CityGrid  that changes simulation INPUTS
(rainfall, drainage capacity). It never touches the simulation maths: the modified city
is handed to the unchanged engine in app.simulation.

    city2, params, changes = apply_scenario(city, "heavy_rainfall", {"rainfall_multiplier": 1.5})
    result = run_simulation(city2, config)

All default parameter values are prototype assumptions, not calibrated design storms.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Any, Callable, Optional

import numpy as np

from app.simulation import CityGrid

BASELINE_ID = "baseline"
MAX_LISTED_REGIONS = 200  # keep the "changes" block small on large grids


class ScenarioError(ValueError):
    """Invalid scenario id or parameter. `field` points at the offending input."""

    def __init__(self, field_: str, message: str):
        super().__init__(message)
        self.field, self.message = field_, message


@dataclass(frozen=True)
class ParamSpec:
    name: str
    label: str
    description: str
    default: Any
    kind: str = "number"            # "number" | "cells"
    minimum: Optional[float] = None
    maximum: Optional[float] = None
    step: Optional[float] = None
    unit: str = ""


@dataclass(frozen=True)
class Scenario:
    id: str
    name: str
    summary: str
    description: str
    assumptions: tuple[str, ...]
    params: tuple[ParamSpec, ...] = ()
    transform: Callable[[CityGrid, dict], tuple[CityGrid, np.ndarray]] = field(default=None, repr=False)


# ------------------------------------------------------------------ transforms
def _none(city: CityGrid, p: dict) -> tuple[CityGrid, np.ndarray]:
    return city, np.zeros(city.shape, dtype=bool)


def _scale_rainfall(city: CityGrid, p: dict) -> tuple[CityGrid, np.ndarray]:
    k = p["rainfall_multiplier"]
    return replace(city, rainfall=city.rainfall * k), np.full(city.shape, k != 1.0)


def _drainage_failure(city: CityGrid, p: dict) -> tuple[CityGrid, np.ndarray]:
    remaining = p["drainage_remaining"] / 100.0
    changed = replace(city, rainfall=city.rainfall * p["rainfall_multiplier"],
                      drainage_capacity=city.drainage_capacity * remaining)
    return changed, city.drainage_capacity * (1 - remaining) > 0


def default_channel_cells(city: CityGrid) -> list[tuple[int, int]]:
    """The main channel = the lowest cell of every row (first one on ties). Deterministic for any grid."""
    return [(r, int(np.argmin(city.elevation[r]))) for r in range(city.rows)]


def _blocked_channel(city: CityGrid, p: dict) -> tuple[CityGrid, np.ndarray]:
    cells = p["channel_cells"]
    mask = np.zeros(city.shape, dtype=bool)
    for r, c in cells:
        mask[r, c] = True
    drainage = np.array(city.drainage_capacity, dtype=float)
    drainage[mask] *= p["channel_remaining"] / 100.0
    changed = replace(city, rainfall=city.rainfall * p["rainfall_multiplier"], drainage_capacity=drainage)
    return changed, mask


# ------------------------------------------------------------------ catalogue
def _rain(default: float) -> ParamSpec:
    return ParamSpec("rainfall_multiplier", "Rainfall multiplier",
                     "Multiplies the rain rate of every region, keeping the storm's spatial pattern.",
                     default, minimum=0.0, maximum=5.0, step=0.05, unit="x")


SCENARIOS: dict[str, Scenario] = {s.id: s for s in (
    Scenario(
        BASELINE_ID, "Baseline", "The city's default conditions.",
        "Runs the city exactly as configured, with no scenario changes. Use it as the reference case.",
        ("No inputs are modified.",), (), _none),
    Scenario(
        "normal_rainfall", "Normal rainfall", "An ordinary rainy day.",
        "Scales the storm down to an ordinary rain event. Drains should cope almost everywhere.",
        ("Rainfall is the baseline pattern times the multiplier.", "Drainage and terrain are unchanged."),
        (_rain(0.3),), _scale_rainfall),
    Scenario(
        "heavy_rainfall", "Heavy rainfall", "A storm stronger than the baseline.",
        "Scales the storm up. Low-lying regions with weak drains fill sooner and deeper.",
        ("Rainfall is the baseline pattern times the multiplier.", "Drainage and terrain are unchanged."),
        (_rain(1.3),), _scale_rainfall),
    Scenario(
        "extreme_rainfall", "Extreme rainfall", "A cloudburst far beyond drain capacity.",
        "Doubles the storm by default. Rain exceeds drain capacity in every region, so water spreads well beyond the valley.",
        ("Rainfall is the baseline pattern times the multiplier.", "Drainage and terrain are unchanged."),
        (_rain(2.0),), _scale_rainfall),
    Scenario(
        "drainage_failure", "Drainage failure", "Drains across the city lose most of their capacity.",
        "Models a city-wide drainage failure, such as pump outage or silted drains: every region keeps only a fraction of its drain capacity.",
        ("Every region's drain capacity is multiplied by the remaining-capacity percentage.",
         "Rainfall stays at the baseline unless the multiplier is changed."),
        (ParamSpec("drainage_remaining", "Drain capacity remaining", "Share of each region's drain capacity that still works.",
                   20.0, minimum=0.0, maximum=100.0, step=5.0, unit="%"),
         _rain(1.0)), _drainage_failure),
    Scenario(
        "blocked_channel", "Blocked drainage channel", "The main channel through the valley is blocked.",
        "Models debris blocking the main drainage channel: only the channel regions lose drain capacity. "
        "By default the channel is the lowest region of every row.",
        ("Only the channel regions are modified; all other drains work normally.",
         "The default channel is the lowest-elevation region in each row.",
         "Surface flow between regions is unchanged.",
         "Rainfall stays at the baseline unless the multiplier is changed."),
        (ParamSpec("channel_remaining", "Channel capacity remaining", "Share of drain capacity left in the channel regions. 0 = fully blocked.",
                   0.0, minimum=0.0, maximum=100.0, step=5.0, unit="%"),
         ParamSpec("channel_cells", "Channel regions", "Optional list of [row, col] pairs (0-based). Leave empty to use the default channel.",
                   None, kind="cells"),
         _rain(1.0)), _blocked_channel),
)}


# ------------------------------------------------------------------ public API
def check_number(spec: ParamSpec, value: Any, where: str, error=None) -> float:
    """Validate one numeric parameter against its spec. Shared with app.interventions."""
    error = error or ScenarioError
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not np.isfinite(value):
        raise error(where, "must be a finite number")
    if spec.minimum is not None and value < spec.minimum or spec.maximum is not None and value > spec.maximum:
        raise error(where, f"must be between {spec.minimum:g} and {spec.maximum:g}, got {value:g}")
    return float(value)


def list_scenarios() -> list[Scenario]:
    return list(SCENARIOS.values())


def _resolve_params(scenario: Scenario, given: dict, city: CityGrid) -> dict:
    known = {p.name: p for p in scenario.params}
    for name in given:
        if name not in known:
            allowed = ", ".join(known) or "none"
            raise ScenarioError(f"scenario.params.{name}", f"'{name}' is not a parameter of {scenario.id} (allowed: {allowed})")

    resolved = {}
    for spec in scenario.params:
        value = given.get(spec.name, spec.default)
        where = f"scenario.params.{spec.name}"
        if spec.kind == "cells":
            if value in (None, []):
                value = default_channel_cells(city)
            else:
                cells = []
                if not isinstance(value, (list, tuple)):
                    raise ScenarioError(where, "must be a list of [row, col] pairs")
                for item in value:
                    ok = (isinstance(item, (list, tuple)) and len(item) == 2
                          and all(isinstance(v, int) and not isinstance(v, bool) for v in item))
                    if not ok:
                        raise ScenarioError(where, f"{item!r} is not a [row, col] pair of integers")
                    r, c = item
                    if not (0 <= r < city.rows and 0 <= c < city.cols):
                        raise ScenarioError(where, f"[{r}, {c}] is outside the {city.rows}x{city.cols} grid")
                    cells.append((r, c))
                value = sorted(set(cells))
        else:
            value = check_number(spec, value, where)
        resolved[spec.name] = value
    return resolved


def apply_scenario(city: CityGrid, scenario_id: str = BASELINE_ID, params: Optional[dict] = None):
    """Return (modified_city, resolved_params, changes). The input city is never mutated."""
    scenario = SCENARIOS.get(scenario_id)
    if scenario is None:
        raise ScenarioError("scenario.id", f"unknown scenario '{scenario_id}' (available: {', '.join(SCENARIOS)})")
    resolved = _resolve_params(scenario, dict(params or {}), city)
    new_city, affected = scenario.transform(city, resolved)

    ids = [str(x) for x in city.region_ids[affected]]
    changes = {
        "mean_rainfall_before": round(float(city.rainfall.mean()), 3),
        "mean_rainfall_after": round(float(new_city.rainfall.mean()), 3),
        "mean_drainage_before": round(float(city.drainage_capacity.mean()), 3),
        "mean_drainage_after": round(float(new_city.drainage_capacity.mean()), 3),
        "affected_region_count": len(ids),
        "affected_regions": ids if len(ids) <= MAX_LISTED_REGIONS else [],
    }
    if "channel_cells" in resolved:
        resolved["channel_cells"] = [list(rc) for rc in resolved["channel_cells"]]
    return new_city, resolved, changes
