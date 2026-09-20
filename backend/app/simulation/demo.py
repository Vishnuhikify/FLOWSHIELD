"""Run the synthetic city once and print a readable report:  python -m app.simulation.demo"""
import numpy as np

from . import SimulationConfig, create_synthetic_city, run_simulation


def main() -> None:
    np.set_printoptions(precision=3, suppress=True, linewidth=120)
    city, config = create_synthetic_city(), SimulationConfig()
    for name in ("elevation", "rainfall", "drainage_capacity", "initial_water", "population"):
        print(f"{name}:\n{getattr(city, name)}\n")
    print(config, "\n")

    res = run_simulation(city, config)
    print(res.summary())
    print(f"\nPeak water depth (m):\n{res.maximum_water_level}")
    print(f"\nPeak risk (0 safe, 1 warning, 2 critical):\n{res.peak_risk}")
    print("\nTime to critical (min):", {k: v for k, v in res.time_to_critical.items() if v is not None})
    print("Warning regions:", res.warning_regions)
    balance = res.total_initial_water + res.total_rainfall - res.total_drained
    print(f"\nMass balance: initial {res.total_initial_water:.4f} + rain {res.total_rainfall:.4f} "
          f"- drained {res.total_drained:.4f} = {balance:.6f} | final stored {res.final_water_level.sum():.6f}")


if __name__ == "__main__":
    main()
