"""Time-stepping flood simulation engine.

Water balance applied to every cell at every timestep:

    W(t+1) = W(t) + Rainfall + Incoming - Drainage - Outgoing

Order inside one timestep (fixed, so results are reproducible):
    1. rainfall is added
    2. flow between neighbours is computed from that state (see flow.py)
    3. drainage removes water, capped by what the cell holds (see drainage.py)

This is a simplified model for a hackathon prototype. It is NOT a calibrated
operational flood forecasting system.
"""
from __future__ import annotations

import numpy as np

from .drainage import compute_drainage
from .flow import compute_flow
from .models import MM_PER_HOUR_TO_M_PER_MIN, CityGrid, RiskLevel, SimulationConfig, SimulationResult
from .risk import classify_risk, first_critical_steps, population_metrics, step_to_time


def step(water: np.ndarray, city: CityGrid, config: SimulationConfig) -> tuple[np.ndarray, dict[str, np.ndarray]]:
    """Advance one timestep. Returns (new_water, the individual water-balance terms)."""
    dt = config.timestep_minutes
    rain = city.rainfall * MM_PER_HOUR_TO_M_PER_MIN * dt

    w = water + rain
    incoming, outgoing = compute_flow(w, city.elevation, config.flow_rate, dt, city.barrier)
    w = np.maximum(w + incoming - outgoing, 0.0)   # clamp guards float round-off only
    drained = compute_drainage(w, city.drainage_capacity, dt)
    w = np.maximum(w - drained, 0.0)

    return w, {"rainfall": rain, "incoming": incoming, "outgoing": outgoing, "drained": drained}


def run_simulation(city: CityGrid, config: SimulationConfig | None = None) -> SimulationResult:
    if not isinstance(city, CityGrid):
        raise TypeError("city must be a CityGrid")
    config = config or SimulationConfig()
    if not isinstance(config, SimulationConfig):
        raise TypeError("config must be a SimulationConfig")

    n = config.num_steps
    timestamps = [round(i * config.timestep_minutes, 9) for i in range(n + 1)]
    water_levels = np.empty((n + 1, city.rows, city.cols), dtype=float)
    water_levels[0] = city.initial_water

    total_rain = total_drained = 0.0
    for i in range(n):
        water_levels[i + 1], terms = step(water_levels[i], city, config)
        total_rain += float(terms["rainfall"].sum())
        total_drained += float(terms["drained"].sum())

    if not np.all(np.isfinite(water_levels)) or np.any(water_levels < 0):
        raise FloatingPointError("simulation produced an invalid water level")  # never silent

    risk_levels = classify_risk(water_levels, config.warning_threshold, config.critical_threshold)
    peak_risk = risk_levels.max(axis=0)
    ids = city.region_ids

    first_steps = first_critical_steps(risk_levels)
    first_step, first_time, ttc = {}, {}, {}
    for (r, c), s in np.ndenumerate(first_steps):
        t = step_to_time(int(s), timestamps)
        first_step[str(ids[r, c])] = None if s < 0 else int(s)
        first_time[str(ids[r, c])] = t
        ttc[str(ids[r, c])] = None if t is None else t - timestamps[0]

    reached = [(t, rid) for rid, t in first_time.items() if t is not None]
    earliest_time, earliest_region = min(reached) if reached else (None, None)

    pop = population_metrics(peak_risk, city.population)
    timeline = {
        "warning": [int(city.population[g == int(RiskLevel.WARNING)].sum()) for g in risk_levels],
        "critical": [int(city.population[g == int(RiskLevel.CRITICAL)].sum()) for g in risk_levels],
    }

    max_water = water_levels.max(axis=0)
    peak_idx = np.unravel_index(int(np.argmax(max_water)), max_water.shape)

    return SimulationResult(
        region_ids=ids,
        timestamps=timestamps,
        water_levels=water_levels,
        risk_levels=risk_levels,
        peak_risk=peak_risk,
        critical_regions=[str(x) for x in ids[peak_risk == int(RiskLevel.CRITICAL)]],
        warning_regions=[str(x) for x in ids[peak_risk == int(RiskLevel.WARNING)]],
        first_critical_step=first_step,
        first_critical_time=first_time,
        time_to_critical=ttc,
        population_timeline=timeline,
        maximum_water_level=max_water,
        max_water_overall=float(max_water[peak_idx]),
        max_water_region=str(ids[peak_idx]),
        final_water_level=water_levels[-1].copy(),
        earliest_critical_region=earliest_region,
        earliest_critical_time=earliest_time,
        total_initial_water=float(city.initial_water.sum()),
        total_rainfall=total_rain,
        total_drained=total_drained,
        config=config,
        **pop,
    )
