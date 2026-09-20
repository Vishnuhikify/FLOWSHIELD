"""API routes: health check and simulation."""
from fastapi import APIRouter
from pydantic import BaseModel

from app.simulation import run_simulation

from .mapping import (InputError, build_catalog, build_city, build_compare_response, build_config,
                      build_intervention_catalog, build_interventions, build_response, build_scenario)
from .schemas import (CompareResponse, ErrorResponse, InterventionCatalog, PreviewResponse, ScenarioCatalog, SimulateRequest,
                      SimulateResponse)

router = APIRouter(prefix="/api")


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", service="flowshield", version="0.9.0")


@router.post(
    "/simulate",
    response_model=SimulateResponse,
    responses={422: {"model": ErrorResponse, "description": "Invalid city, rainfall or config"}},
    summary="Run one flood simulation",
)
def simulate(req: SimulateRequest) -> SimulateResponse:
    """Run the deterministic flood engine. Send `{}` to simulate the built-in synthetic city with defaults."""
    reference, source = build_city(req)                                   # the original city - never modified
    city, scenario = build_scenario(req, reference)                       # scenarios only change inputs...
    city, interventions = build_interventions(req, city, reference, scenario)   # ...and so do interventions
    config = build_config(req, city)
    result = run_simulation(city, config)                                 # the engine is the same for every run
    return build_response(city, config, result, source, scenario, interventions)


@router.post(
    "/compare",
    response_model=CompareResponse,
    response_model_by_alias=True,
    responses={422: {"model": ErrorResponse, "description": "Invalid input, or no interventions to compare"}},
    summary="Compare the same scenario without and with the intervention plan",
)
def compare(req: SimulateRequest) -> CompareResponse:
    """Same body as /api/simulate. The scenario and controls are applied once; the engine then runs twice,
    on the city without and with the interventions. Only the plan differs between the two runs."""
    if not req.interventions:
        raise InputError("interventions", "a comparison needs at least one intervention; without a plan both runs are identical")
    reference, source = build_city(req)
    scenario_city, scenario = build_scenario(req, reference)
    plan_city, interventions = build_interventions(req, scenario_city, reference, scenario)
    config = build_config(req, scenario_city)
    without = run_simulation(scenario_city, config)
    with_plan = run_simulation(plan_city, config)
    return build_compare_response(scenario_city, config, source, scenario, interventions, without, with_plan)


@router.post(
    "/interventions/preview",
    response_model=PreviewResponse,
    responses={422: {"model": ErrorResponse, "description": "Invalid city, scenario or interventions"}},
    summary="Preview the input changes of a plan",
)
def preview_interventions(req: SimulateRequest) -> PreviewResponse:
    """Runs the same input pipeline as /api/simulate but stops before the engine, so a plan's exact
    before/after values can be shown before it is run. No simulation results are produced."""
    reference, _ = build_city(req)
    scenario_city, scenario = build_scenario(req, reference)
    final_city, interventions = build_interventions(req, scenario_city, reference, scenario)
    return PreviewResponse(region_ids=reference.region_ids.tolist(), scenario=scenario, interventions=interventions,
                           drainage_design=reference.drainage_capacity.tolist(),
                           drainage_before=scenario_city.drainage_capacity.tolist(),
                           drainage_after=final_city.drainage_capacity.tolist())


@router.get("/interventions", response_model=InterventionCatalog, summary="Intervention catalogue")
def interventions() -> InterventionCatalog:
    """Every intervention with its description, assumptions, target mode and parameters."""
    return build_intervention_catalog()


@router.get("/scenarios", response_model=ScenarioCatalog, summary="Scenario Lab catalogue")
def scenarios() -> ScenarioCatalog:
    """Every scenario with its description, assumptions and configurable parameters."""
    return build_catalog()
