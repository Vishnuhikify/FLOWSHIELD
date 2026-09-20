"""FLOWSHIELD flood simulation engine.

    from app.simulation import create_synthetic_city, SimulationConfig, run_simulation
    result = run_simulation(create_synthetic_city(), SimulationConfig())
"""
from .engine import run_simulation, step
from .grid import create_synthetic_city, get_neighbors, with_rainfall
from .models import CityGrid, RiskLevel, SimulationConfig, SimulationResult

__all__ = ["CityGrid", "RiskLevel", "SimulationConfig", "SimulationResult",
           "run_simulation", "step", "create_synthetic_city", "get_neighbors", "with_rainfall"]
