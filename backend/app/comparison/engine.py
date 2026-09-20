"""Comparison of two finished simulation runs: the same scenario WITHOUT and WITH an intervention plan.

This module contains no flood physics. It only reads two SimulationResult objects produced by the
unchanged engine and reports differences. It never modifies either result.

Conventions
    change          = with - without        (negative = less flooding = better, for "lower is better" metrics)
    percent_change  = change / without * 100, or None when `without` is 0 and `with` is not
                      (a percentage of zero is undefined); 0.0 when both are 0.
    Everything is MODELED IMPACT under the simulation's assumptions, not a measured or real-world effect.
"""
from __future__ import annotations

from typing import Optional

import numpy as np

from app.simulation import CityGrid, RiskLevel, SimulationResult

WATER_TOLERANCE_M = 1e-4     # 0.1 mm: smaller differences in depth count as "unchanged"
DECIMALS = 5

LABEL = ("MODELED IMPACT under the simulation's assumptions: the same scenario and controls run twice, without and "
         "with the intervention plan. Not a measured or real-world effect.")


def safe_percent(without: float, with_: float) -> Optional[float]:
    """Percentage change that never divides by zero."""
    if without == 0:
        return 0.0 if with_ == 0 else None
    return round((with_ - without) / abs(without) * 100.0, 2)


def _direction(change: float, lower_is_better: bool, tolerance: float = 0.0) -> str:
    if abs(change) <= tolerance:
        return "unchanged"
    better = change < 0 if lower_is_better else change > 0
    return "improved" if better else "worsened"


def _metric(key: str, label: str, unit: str, without: float, with_: float, *, lower_is_better: bool = True,
            tolerance: float = 0.0, integer: bool = False, shift: float = 0.0, note: str = "") -> dict:
    """`shift` = part of the change that is only movement between WARNING and CRITICAL (see compare_results).
    It stays in the reported numbers but is excluded when judging the direction."""
    change = with_ - without
    cast = (lambda v: int(v)) if integer else (lambda v: round(float(v), DECIMALS))
    percent = safe_percent(without, with_)
    return {
        "key": key, "label": label, "unit": unit, "lower_is_better": lower_is_better,
        "without": cast(without), "with": cast(with_), "absolute_change": cast(change),
        "percent_change": percent,
        "percent_note": "" if percent is not None else "Not defined: the value without interventions is 0.",
        "direction": _direction(change - shift, lower_is_better, tolerance),
        "note": note,
    }


def compare_time(without: Optional[float], with_: Optional[float]) -> dict:
    """Compare two 'first critical' times where None means 'never critical in this run'."""
    if without is None and with_ is None:
        status, change, direction = "never", None, "unchanged"
    elif without is not None and with_ is None:
        status, change, direction = "prevented", None, "improved"
    elif without is None:
        status, change, direction = "introduced", None, "worsened"
    else:
        change = round(with_ - without, DECIMALS)
        status = "delayed" if change > 0 else "earlier" if change < 0 else "same"
        direction = "improved" if change > 0 else "worsened" if change < 0 else "unchanged"
    return {"without": without, "with": with_, "change_minutes": change, "status": status, "direction": direction}


def _region_status(risk_change: int, critical: dict, max_change: float, final_change: float) -> tuple[str, str]:
    """Most important difference first: worst risk level, then critical timing, then peak depth, then final depth."""
    if risk_change != 0:
        return ("improved", "lower peak risk level") if risk_change < 0 else ("worsened", "higher peak risk level")
    if critical["direction"] != "unchanged":
        return critical["direction"], f"critical {critical['status']}"
    if abs(max_change) > WATER_TOLERANCE_M:
        return ("improved", "lower peak water") if max_change < 0 else ("worsened", "higher peak water")
    if abs(final_change) > WATER_TOLERANCE_M:
        return ("improved", "lower final water") if final_change < 0 else ("worsened", "higher final water")
    return "unchanged", ""


def _side(res: SimulationResult, r: int, c: int, rid: str) -> dict:
    return {
        "peak_risk": RiskLevel(int(res.peak_risk[r, c])).name,
        "final_risk": RiskLevel(int(res.risk_levels[-1, r, c])).name,
        "max_water_level": round(float(res.maximum_water_level[r, c]), DECIMALS),
        "final_water_level": round(float(res.final_water_level[r, c]), DECIMALS),
        "time_to_critical": res.time_to_critical[rid],
    }


def _series(res: SimulationResult) -> dict:
    risk = res.risk_levels
    tl = res.population_timeline
    return {
        "max_water": np.round(res.water_levels.max(axis=(1, 2)), DECIMALS).tolist(),
        "total_water": np.round(res.water_levels.sum(axis=(1, 2)), DECIMALS).tolist(),
        "critical_region_count": (risk == int(RiskLevel.CRITICAL)).sum(axis=(1, 2)).tolist(),
        "warning_region_count": (risk == int(RiskLevel.WARNING)).sum(axis=(1, 2)).tolist(),
        "critical_population": tl["critical"], "warning_population": tl["warning"],
        "affected_population": [a + b for a, b in zip(tl["critical"], tl["warning"])],
    }


def compare_results(city: CityGrid, without: SimulationResult, with_: SimulationResult) -> dict:
    """`city` supplies region ids and population only (identical for both runs)."""
    if without.water_levels.shape != with_.water_levels.shape or without.timestamps != with_.timestamps:
        raise ValueError("the two runs must share the same grid, duration and timestep")

    n = city.rows * city.cols
    # A region that drops from CRITICAL to WARNING raises the warning counts although it got better (and the
    # reverse). That movement is reported in a note and left out of the warning metrics' direction.
    crit, warn = int(RiskLevel.CRITICAL), int(RiskLevel.WARNING)
    down = (without.peak_risk == crit) & (with_.peak_risk == warn)
    up = (without.peak_risk == warn) & (with_.peak_risk == crit)
    shift_regions = int(down.sum()) - int(up.sum())
    shift_people = int(city.population[down].sum()) - int(city.population[up].sum())
    parts = []
    if down.any():
        parts.append(f"{int(down.sum())} region(s) with {int(city.population[down].sum())} people moved down from critical to warning")
    if up.any():
        parts.append(f"{int(up.sum())} region(s) with {int(city.population[up].sum())} people moved up from warning to critical")
    shift_note = ("; ".join(parts) + ". Direction ignores this movement.") if parts else ""

    metrics = [
        _metric("critical_regions", "Critical regions", "regions", len(without.critical_regions), len(with_.critical_regions), integer=True),
        _metric("warning_regions", "Warning regions", "regions", len(without.warning_regions), len(with_.warning_regions), integer=True,
                shift=shift_regions, note=shift_note),
        _metric("affected_population", "People affected", "people", without.affected_population, with_.affected_population, integer=True),
        _metric("critical_population", "People in critical regions", "people", without.critical_population, with_.critical_population, integer=True),
        _metric("warning_population", "People in warning regions", "people", without.warning_population, with_.warning_population, integer=True,
                shift=shift_people, note=shift_note),
        _metric("max_water_level", "Maximum water level", "m", without.max_water_overall, with_.max_water_overall, tolerance=WATER_TOLERANCE_M),
        _metric("final_max_water_level", "Deepest water at the end", "m", float(without.final_water_level.max()), float(with_.final_water_level.max()), tolerance=WATER_TOLERANCE_M),
        _metric("final_mean_water_level", "Mean water level at the end", "m", float(without.final_water_level.mean()), float(with_.final_water_level.mean()), tolerance=WATER_TOLERANCE_M / n),
        _metric("total_drained", "Water removed by drains and pumps", "m (summed over regions)", without.total_drained, with_.total_drained, lower_is_better=False, tolerance=WATER_TOLERANCE_M),
    ]

    regions = []
    for r in range(city.rows):
        for c in range(city.cols):
            rid = str(city.region_ids[r, c])
            a, b = _side(without, r, c, rid), _side(with_, r, c, rid)
            critical = compare_time(a["time_to_critical"], b["time_to_critical"])
            risk_change = int(with_.peak_risk[r, c]) - int(without.peak_risk[r, c])
            max_change = round(b["max_water_level"] - a["max_water_level"], DECIMALS)
            final_change = round(b["final_water_level"] - a["final_water_level"], DECIMALS)
            status, reason = _region_status(risk_change, critical, max_change, final_change)
            regions.append({
                "id": rid, "row": r, "col": c, "population": int(city.population[r, c]),
                "without": a, "with": b,
                "peak_risk_change": risk_change,
                "max_water_change": max_change, "max_water_percent_change": safe_percent(a["max_water_level"], b["max_water_level"]),
                "final_water_change": final_change,
                "time_to_critical": critical,
                "status": status, "reason": reason,
            })

    ids = lambda status: [x["id"] for x in regions if x["status"] == status]
    pop = lambda status: sum(x["population"] for x in regions if x["status"] == status)
    set_a, set_b = set(without.critical_regions), set(with_.critical_regions)
    warn_a, warn_b = set(without.warning_regions), set(with_.warning_regions)
    order = [x["id"] for x in regions]
    keep = lambda chosen: [i for i in order if i in chosen]

    relevant = [x for x in regions if x["time_to_critical"]["status"] != "never"]
    return {
        "label": LABEL,
        "water_tolerance_m": WATER_TOLERANCE_M,
        "metrics": metrics,
        "earliest_critical": {
            **compare_time(without.earliest_critical_time, with_.earliest_critical_time),
            "region_without": without.earliest_critical_region, "region_with": with_.earliest_critical_region,
        },
        "time_to_critical": [{"id": x["id"], "population": x["population"], **x["time_to_critical"]} for x in relevant],
        "region_summary": {
            "total": n,
            "improved_count": len(ids("improved")), "unchanged_count": len(ids("unchanged")), "worsened_count": len(ids("worsened")),
            "improved": ids("improved"), "worsened": ids("worsened"),
            "improved_population": pop("improved"), "worsened_population": pop("worsened"),
            "no_longer_critical": keep(set_a - set_b), "newly_critical": keep(set_b - set_a),
            "no_longer_at_risk": keep((set_a | warn_a) - (set_b | warn_b)), "newly_at_risk": keep((set_b | warn_b) - (set_a | warn_a)),
        },
        "regions": regions,
        "timeline": {"timestamps": without.timestamps, "without": _series(without), "with": _series(with_)},
    }
