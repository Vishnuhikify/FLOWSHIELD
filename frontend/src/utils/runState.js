// Names the state of the results on screen: baseline, scenario, or either one with interventions.
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function describeRunState(data) {
  const sc = data.scenario;
  const count = data.interventions.count;
  const hasScenario = !sc.is_baseline;
  const kind = hasScenario ? (count > 0 ? "scenario_interventions" : "scenario") : count > 0 ? "baseline_interventions" : "baseline";
  const base = hasScenario ? `Scenario: ${sc.name}` : "Baseline";

  return {
    kind,
    tone: count > 0 ? "intervention" : hasScenario ? "scenario" : "baseline",
    title: count > 0 ? `${base} with ${plural(count, "intervention")}` : base,
    // The input pipeline, in the order the backend applies it.
    stages: [
      { key: "city", label: "City as configured", active: true },
      { key: "scenario", label: hasScenario ? sc.name : "No scenario", active: hasScenario },
      { key: "interventions", label: count > 0 ? plural(count, "intervention") : "No interventions", active: count > 0 },
    ],
    note:
      kind === "baseline"
        ? "The city as configured, with no scenario changes and no interventions. Modeled results, not a real-world forecast."
        : kind === "scenario"
        ? "Modeled results under the selected scenario assumptions, without interventions. Not a real-world forecast."
        : "Modeled intervention results under the simulation's assumptions. Interventions are in place from the start of the run. Not a real-world forecast.",
  };
}
