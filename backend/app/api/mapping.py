"""Translate between API schemas and the simulation engine. No simulation maths here."""
from __future__ import annotations

from dataclasses import asdict

import numpy as np

from app.comparison import compare_results
from app.interventions import (MAX_DRAIN_CAPACITY, MAX_INTERVENTIONS, InterventionError, apply_interventions,
                               list_interventions)
from app.scenarios import BASELINE_ID, SCENARIOS, ScenarioError, apply_scenario, list_scenarios
from app.simulation import (CityGrid, RiskLevel, SimulationConfig, SimulationResult,
                            create_synthetic_city, with_rainfall)

from . import schemas as s

WATER_DECIMALS = 5  # 0.01 mm - keeps the JSON payload small without visible loss

UNITS = {"elevation": "m", "water_level": "m", "thresholds": "m", "rainfall": "mm/h",
         "drainage_capacity": "mm/h", "time": "minutes", "population": "people"}
DISCLAIMER = ("Simplified flood simulation for a hackathon prototype. "
              "Not a calibrated operational flood forecasting system.")

_RISK_NAMES = np.array([lvl.name for lvl in RiskLevel])  # index == RiskLevel value


class InputError(ValueError):
    """A domain rule rejected the request. `field` tells the client where to look."""

    def __init__(self, field: str, message: str):
        super().__init__(message)
        self.field, self.message = field, message


def build_city(req: s.SimulateRequest) -> tuple[CityGrid, str]:
    if req.city is None:
        city, source = create_synthetic_city(), "synthetic"
    else:
        try:
            city = CityGrid(**req.city.model_dump())
        except ValueError as exc:
            raise InputError("city", str(exc)) from exc
        source = "custom"
    if req.rainfall is not None:
        try:
            city = with_rainfall(city, req.rainfall)
        except ValueError as exc:
            raise InputError("rainfall", str(exc)) from exc
    return city, source


def build_scenario(req: s.SimulateRequest, city: CityGrid) -> tuple[CityGrid, s.ScenarioOut]:
    """Apply the requested scenario to the inputs. `city` in the response is the city AFTER the scenario."""
    chosen = req.scenario or s.ScenarioInput()
    try:
        new_city, params, changes = apply_scenario(city, chosen.id, chosen.params)
    except ScenarioError as exc:
        raise InputError(exc.field, exc.message) from exc
    except ValueError as exc:  # CityGrid re-validation of the modified inputs
        raise InputError("scenario", str(exc)) from exc
    sc = SCENARIOS[chosen.id]
    baseline = sc.id == BASELINE_ID
    label = ("Baseline: the city as configured, with no scenario changes." if baseline else
             f"Modeled result for the {sc.name} scenario under the assumptions listed. Not a real-world forecast.")
    return new_city, s.ScenarioOut(id=sc.id, name=sc.name, is_baseline=baseline, description=sc.description,
                                   assumptions=list(sc.assumptions), params=params,
                                   changes=s.ScenarioChanges(**changes), label=label)


def build_interventions(req: s.SimulateRequest, city: CityGrid, reference: CityGrid,
                        scenario: s.ScenarioOut) -> tuple[CityGrid, s.InterventionsOut]:
    """Apply interventions to the post-scenario city. `reference` is the pre-scenario city (design capacities)."""
    try:
        new_city, details = apply_interventions(city, reference, [i.model_dump() for i in req.interventions],
                                                channel_cells=scenario.params.get("channel_cells"))
    except InterventionError as exc:
        raise InputError(exc.field, exc.message) from exc
    except ValueError as exc:
        raise InputError("interventions", str(exc)) from exc
    label = ("No interventions applied." if not details else
             "Modeled intervention result under the simulation's assumptions. Interventions are in place from the "
             "start of the run. Not a real-world forecast.")
    return new_city, s.InterventionsOut(count=len(details), items=[s.InterventionApplied(**d) for d in details],
                                        changed_region_count=len({c["region"] for d in details for c in d["changes"]}),
                                        label=label)


def _params_out(params) -> list:
    return [s.ScenarioParamOut(name=p.name, label=p.label, description=p.description, kind=p.kind, default=p.default,
                               minimum=p.minimum, maximum=p.maximum, step=p.step, unit=p.unit) for p in params]


def build_intervention_catalog() -> s.InterventionCatalog:
    return s.InterventionCatalog(max_interventions=MAX_INTERVENTIONS, max_drain_capacity=MAX_DRAIN_CAPACITY, interventions=[
        s.InterventionInfo(id=i.id, name=i.name, summary=i.summary, description=i.description,
                           assumptions=list(i.assumptions), target_mode=i.target_mode, max_targets=i.max_targets,
                           params=_params_out(i.params)) for i in list_interventions()])


def build_catalog() -> s.ScenarioCatalog:
    return s.ScenarioCatalog(baseline_id=BASELINE_ID, scenarios=[
        s.ScenarioInfo(id=sc.id, name=sc.name, summary=sc.summary, description=sc.description,
                       assumptions=list(sc.assumptions),
                       params=[s.ScenarioParamOut(name=p.name, label=p.label, description=p.description, kind=p.kind,
                                                  default=p.default, minimum=p.minimum, maximum=p.maximum,
                                                  step=p.step, unit=p.unit) for p in sc.params])
        for sc in list_scenarios()])


def build_config(req: s.SimulateRequest, city: CityGrid) -> SimulationConfig:
    try:
        config = SimulationConfig(**req.config.model_dump())
    except ValueError as exc:
        raise InputError("config", str(exc)) from exc
    if config.num_steps > s.MAX_STEPS:
        raise InputError("config", f"{config.num_steps} timesteps requested; the API allows at most {s.MAX_STEPS}")
    cell_steps = city.rows * city.cols * (config.num_steps + 1)
    if cell_steps > s.MAX_CELL_STEPS:
        raise InputError("config", f"rows * cols * timesteps = {cell_steps} exceeds the API limit of "
                                   f"{s.MAX_CELL_STEPS}; use a smaller grid, shorter duration or larger timestep")
    return config


def _w(arr: np.ndarray) -> list:
    return np.round(arr, WATER_DECIMALS).tolist()


def build_summary(res: SimulationResult) -> s.Summary:
    return s.Summary(
        duration_minutes=res.timestamps[-1],
        max_water_level=round(res.max_water_overall, WATER_DECIMALS), max_water_region=res.max_water_region,
        critical_regions=res.critical_regions, warning_regions=res.warning_regions,
        critical_region_count=len(res.critical_regions), warning_region_count=len(res.warning_regions),
        total_population=res.total_population, critical_population=res.critical_population,
        warning_population=res.warning_population, affected_population=res.affected_population,
        earliest_critical_region=res.earliest_critical_region, earliest_critical_time=res.earliest_critical_time,
        total_initial_water=round(res.total_initial_water, WATER_DECIMALS),
        total_rainfall=round(res.total_rainfall, WATER_DECIMALS), total_drained=round(res.total_drained, WATER_DECIMALS),
        total_final_water=round(float(res.final_water_level.sum()), WATER_DECIMALS))


def build_compare_response(city: CityGrid, config: SimulationConfig, source: str, scenario: s.ScenarioOut,
                           interventions: s.InterventionsOut, without: SimulationResult,
                           with_: SimulationResult) -> s.CompareResponse:
    comparison = compare_results(city, without, with_)       # pure read of the two results
    return s.CompareResponse(
        meta=s.Meta(rows=city.rows, cols=city.cols, num_steps=config.num_steps, city_source=source, units=UNITS,
                    disclaimer=DISCLAIMER),
        config=s.ConfigInput(**asdict(config)), scenario=scenario, interventions=interventions,
        runs=s.RunSummaries(without=build_summary(without), with_=build_summary(with_)),
        **comparison)


def build_response(city: CityGrid, config: SimulationConfig, res: SimulationResult, source: str,
                   scenario: s.ScenarioOut, interventions: s.InterventionsOut) -> s.SimulateResponse:
    risk, water = res.risk_levels, res.water_levels
    tl = res.population_timeline
    final_risk = risk[-1]

    regions = [
        s.RegionOut(
            id=(rid := str(city.region_ids[r, c])), row=r, col=c,
            elevation=float(city.elevation[r, c]), population=int(city.population[r, c]),
            peak_risk=RiskLevel(int(res.peak_risk[r, c])).name,
            final_risk=RiskLevel(int(final_risk[r, c])).name,
            max_water_level=round(float(res.maximum_water_level[r, c]), WATER_DECIMALS),
            final_water_level=round(float(res.final_water_level[r, c]), WATER_DECIMALS),
            first_critical_time=res.first_critical_time[rid],
            time_to_critical=res.time_to_critical[rid],
        )
        for r in range(city.rows) for c in range(city.cols)
    ]

    count = lambda level: (risk == int(level)).sum(axis=(1, 2)).tolist()
    return s.SimulateResponse(
        meta=s.Meta(rows=city.rows, cols=city.cols, num_steps=config.num_steps,
                    city_source=source, units=UNITS, disclaimer=DISCLAIMER),
        scenario=scenario,
        interventions=interventions,
        config=s.ConfigInput(**asdict(config)),
        city=s.CityOut(
            region_ids=city.region_ids.tolist(), elevation=city.elevation.tolist(),
            rainfall=city.rainfall.tolist(), drainage_capacity=city.drainage_capacity.tolist(),
            initial_water=city.initial_water.tolist(), population=city.population.tolist(),
            barrier=city.barrier.tolist()),
        summary=build_summary(res),
        regions=regions,
        grids=s.GridsOut(maximum_water_level=_w(res.maximum_water_level),
                         final_water_level=_w(res.final_water_level),
                         peak_risk=_RISK_NAMES[res.peak_risk].tolist()),
        timeline=s.Timeline(
            timestamps=res.timestamps,
            water_levels=_w(water),
            risk_levels=_RISK_NAMES[risk].tolist(),
            total_water=_w(water.sum(axis=(1, 2))),
            max_water=_w(water.max(axis=(1, 2))),
            safe_region_count=count(RiskLevel.SAFE),
            warning_region_count=count(RiskLevel.WARNING),
            critical_region_count=count(RiskLevel.CRITICAL),
            warning_population=tl["warning"], critical_population=tl["critical"],
            affected_population=[a + b for a, b in zip(tl["warning"], tl["critical"])]),
    )
