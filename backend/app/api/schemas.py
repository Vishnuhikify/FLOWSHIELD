"""Pydantic request/response schemas for the HTTP API.

These only describe the JSON shape. All domain rules (shapes match the grid, no
negative rainfall, stable timestep, ...) stay in app.simulation.models so there is
a single source of truth; the API just translates their errors into HTTP 422.
"""
from __future__ import annotations

from typing import Annotated, Any, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field

# API guard rails (payload size / CPU), not model limits.
MAX_GRID_SIDE = 100
MAX_STEPS = 1440
MAX_CELL_STEPS = 1_000_000   # rows * cols * (steps + 1)

FiniteFloat = Annotated[float, Field(allow_inf_nan=False)]
Grid = list[list[FiniteFloat]]
ScalarOrGrid = Union[FiniteFloat, Grid]      # one number = same value in every cell
RiskName = Literal["SAFE", "WARNING", "CRITICAL"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")  # typos in field names are errors, not ignored


# ---------------------------------------------------------------- request
class CityInput(_Strict):
    rows: int = Field(ge=1, le=MAX_GRID_SIDE)
    cols: int = Field(ge=1, le=MAX_GRID_SIDE)
    elevation: ScalarOrGrid = Field(description="metres")
    drainage_capacity: ScalarOrGrid = Field(description="mm/h")
    population: ScalarOrGrid = Field(description="people per region (whole numbers)")
    rainfall: ScalarOrGrid = Field(0.0, description="mm/h")
    initial_water: ScalarOrGrid = Field(0.0, description="metres")
    region_ids: Optional[list[list[str]]] = None
    barrier: Optional[list[list[bool]]] = Field(None, description="true = cell exchanges no water with neighbours")


class ConfigInput(_Strict):
    duration_minutes: float = Field(60.0, gt=0, allow_inf_nan=False)
    timestep_minutes: float = Field(1.0, gt=0, allow_inf_nan=False)
    warning_threshold: float = Field(0.15, gt=0, allow_inf_nan=False, description="metres")
    critical_threshold: float = Field(0.30, gt=0, allow_inf_nan=False, description="metres")
    flow_rate: float = Field(0.10, ge=0, allow_inf_nan=False)


class ScenarioInput(_Strict):
    id: str = Field("baseline", description="scenario id from GET /api/scenarios")
    params: dict[str, Any] = Field(default_factory=dict, description="overrides for that scenario's parameters")


class InterventionInput(_Strict):
    id: str = Field(description="intervention id from GET /api/interventions")
    targets: Optional[list[str]] = Field(None, description="region ids; see the intervention's target_mode")
    params: dict[str, Any] = Field(default_factory=dict)


class SimulateRequest(_Strict):
    city: Optional[CityInput] = Field(None, description="omit to use the built-in synthetic 5x5 city")
    rainfall: Optional[ScalarOrGrid] = Field(
        None, description="mm/h; overrides the city's rainfall (number = uniform, grid = per cell)")
    scenario: Optional[ScenarioInput] = Field(None, description="omit for the baseline; applied after `city` and `rainfall`")
    interventions: list[InterventionInput] = Field(default_factory=list, description="applied in order, after the scenario")
    config: ConfigInput = Field(default_factory=ConfigInput)


# ---------------------------------------------------------------- response
class InterventionInfo(BaseModel):
    id: str
    name: str
    summary: str
    description: str
    assumptions: list[str]
    target_mode: Literal["required", "optional_all", "channel"]
    max_targets: Optional[int]
    params: list["ScenarioParamOut"]


class InterventionCatalog(BaseModel):
    max_interventions: int
    max_drain_capacity: float
    interventions: list[InterventionInfo]


class InputChange(BaseModel):
    region: str
    field: str
    unit: str
    before: float
    after: float


class InterventionApplied(BaseModel):
    id: str
    name: str
    params: dict[str, Any]
    targets: list[str]
    target_count: int
    changed_region_count: int
    changes: list[InputChange]
    capacity_added_mm_per_hour: float
    note: str


class InterventionsOut(BaseModel):
    """Interventions applied to this run, with exactly which inputs they changed."""
    count: int
    changed_region_count: int
    items: list[InterventionApplied]
    label: str

class ScenarioParamOut(BaseModel):
    name: str
    label: str
    description: str
    kind: Literal["number", "cells"]
    default: Any
    minimum: Optional[float]
    maximum: Optional[float]
    step: Optional[float]
    unit: str


class ScenarioInfo(BaseModel):
    id: str
    name: str
    summary: str
    description: str
    assumptions: list[str]
    params: list[ScenarioParamOut]


class ScenarioCatalog(BaseModel):
    baseline_id: str
    scenarios: list[ScenarioInfo]


class ScenarioChanges(BaseModel):
    mean_rainfall_before: float
    mean_rainfall_after: float
    mean_drainage_before: float
    mean_drainage_after: float
    affected_region_count: int
    affected_regions: list[str]


class ScenarioOut(BaseModel):
    """Which scenario produced this result. Results are modeled outcomes under these assumptions."""
    id: str
    name: str
    is_baseline: bool
    description: str
    assumptions: list[str]
    params: dict[str, Any]
    changes: ScenarioChanges
    label: str

class Meta(BaseModel):
    rows: int
    cols: int
    num_steps: int
    city_source: Literal["custom", "synthetic"]
    units: dict[str, str]
    disclaimer: str


class CityOut(BaseModel):
    region_ids: list[list[str]]
    elevation: Grid
    rainfall: Grid
    drainage_capacity: Grid
    initial_water: Grid
    population: list[list[int]]
    barrier: list[list[bool]]


class Summary(BaseModel):
    duration_minutes: float
    max_water_level: float
    max_water_region: str
    critical_regions: list[str]
    warning_regions: list[str]
    critical_region_count: int
    warning_region_count: int
    total_population: int
    critical_population: int
    warning_population: int
    affected_population: int
    earliest_critical_region: Optional[str]
    earliest_critical_time: Optional[float]
    total_initial_water: float
    total_rainfall: float
    total_drained: float
    total_final_water: float


class RegionOut(BaseModel):
    id: str
    row: int
    col: int
    elevation: float
    population: int
    peak_risk: RiskName
    final_risk: RiskName
    max_water_level: float
    final_water_level: float
    first_critical_time: Optional[float]
    time_to_critical: Optional[float]


class GridsOut(BaseModel):
    maximum_water_level: Grid
    final_water_level: Grid
    peak_risk: list[list[RiskName]]


class Timeline(BaseModel):
    """Every list has one entry per timestamp; index 0 is the initial state."""
    timestamps: list[float]
    water_levels: list[Grid]
    risk_levels: list[list[list[RiskName]]]
    total_water: list[float]
    max_water: list[float]
    safe_region_count: list[int]
    warning_region_count: list[int]
    critical_region_count: list[int]
    warning_population: list[int]
    critical_population: list[int]
    affected_population: list[int]


class PreviewResponse(BaseModel):
    """What a plan would change, without running the simulation. Same request body as /api/simulate."""
    region_ids: list[list[str]]
    scenario: ScenarioOut
    interventions: InterventionsOut
    drainage_design: Grid      # the original city, before the scenario
    drainage_before: Grid      # after the scenario, before interventions
    drainage_after: Grid       # what the engine would receive


class SimulateResponse(BaseModel):
    meta: Meta
    scenario: ScenarioOut
    interventions: InterventionsOut
    config: ConfigInput
    city: CityOut
    summary: Summary
    regions: list[RegionOut]
    grids: GridsOut
    timeline: Timeline


# ---------------------------------------------------------------- comparison
Direction = Literal["improved", "unchanged", "worsened"]


class MetricComparison(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    key: str
    label: str
    unit: str
    lower_is_better: bool
    without: Union[int, float]
    with_: Union[int, float] = Field(alias="with")
    absolute_change: Union[int, float]
    percent_change: Optional[float] = Field(description="null when the value without interventions is 0 and the other is not")
    percent_note: str
    direction: Direction
    note: str = Field(description="extra context, e.g. movement between warning and critical")


class TimeComparison(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    without: Optional[float]
    with_: Optional[float] = Field(alias="with")
    change_minutes: Optional[float]
    status: Literal["never", "prevented", "introduced", "delayed", "earlier", "same"]
    direction: Direction


class EarliestCritical(TimeComparison):
    region_without: Optional[str]
    region_with: Optional[str]


class RegionTimeComparison(TimeComparison):
    id: str
    population: int


class RegionSide(BaseModel):
    peak_risk: RiskName
    final_risk: RiskName
    max_water_level: float
    final_water_level: float
    time_to_critical: Optional[float]


class RegionComparison(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    row: int
    col: int
    population: int
    without: RegionSide
    with_: RegionSide = Field(alias="with")
    peak_risk_change: int
    max_water_change: float
    max_water_percent_change: Optional[float]
    final_water_change: float
    time_to_critical: TimeComparison
    status: Direction
    reason: str


class RegionSummary(BaseModel):
    total: int
    improved_count: int
    unchanged_count: int
    worsened_count: int
    improved: list[str]
    worsened: list[str]
    improved_population: int
    worsened_population: int
    no_longer_critical: list[str]
    newly_critical: list[str]
    no_longer_at_risk: list[str]
    newly_at_risk: list[str]


class ComparisonSeries(BaseModel):
    max_water: list[float]
    total_water: list[float]
    critical_region_count: list[int]
    warning_region_count: list[int]
    critical_population: list[int]
    warning_population: list[int]
    affected_population: list[int]


class ComparisonTimeline(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    timestamps: list[float]
    without: ComparisonSeries
    with_: ComparisonSeries = Field(alias="with")


class RunSummaries(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    without: "Summary"
    with_: "Summary" = Field(alias="with")


class CompareResponse(BaseModel):
    """Same scenario and controls, run without and with the intervention plan."""
    label: str
    water_tolerance_m: float
    meta: "Meta"
    config: ConfigInput
    scenario: ScenarioOut
    interventions: InterventionsOut
    runs: RunSummaries
    metrics: list[MetricComparison]
    earliest_critical: EarliestCritical
    time_to_critical: list[RegionTimeComparison]
    region_summary: RegionSummary
    regions: list[RegionComparison]
    timeline: ComparisonTimeline


class ErrorDetail(BaseModel):
    field: str
    message: str


class ErrorBody(BaseModel):
    type: str
    message: str
    details: list[ErrorDetail]


class ErrorResponse(BaseModel):
    error: ErrorBody


InterventionInfo.model_rebuild()
RunSummaries.model_rebuild()
CompareResponse.model_rebuild()
