import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AlertBanner from "../components/AlertBanner";
import ComparisonDashboard from "../components/ComparisonDashboard";
import ControlPanel from "../components/ControlPanel";
import DemoBar from "../components/DemoBar";
import EarlyWarningPanel from "../components/EarlyWarningPanel";
import HistoricalEvents from "../components/HistoricalEvents";
import HistoricalReplayBanner from "../components/HistoricalReplayBanner";
import InterventionLab from "../components/InterventionLab";
import RunStateBar from "../components/RunStateBar";
import FloodGrid, { VIEWS } from "../components/FloodGrid";
import NowStrip from "../components/NowStrip";
import Header from "../components/Header";
import Panel from "../components/Panel";
import ProgressionCharts from "../components/ProgressionCharts";
import NeighborhoodView from "../components/NeighborhoodView";
import RegionDetail from "../components/RegionDetail";
import RegionFocus from "../components/RegionFocus";
import ScenarioLab from "../components/ScenarioLab";
import StatusBanner from "../components/StatusBanner";
import SummaryCards from "../components/SummaryCards";
import TimelineControls from "../components/TimelineControls";
import { getHealth, getInterventions, getScenarios, simulate } from "../services/api";
import { HISTORICAL_EVENTS } from "../data/historicalEvents";
import { buildReplayForm } from "../utils/historicalReplay";
import { buildDemoPlan, DEMO_PLAYBACK_SPEED, DEMO_STEPS, demoBaselineSelection, demoFact, demoReady, demoScenarioSelection, demoWarningJump } from "../utils/demo";
import { alertsAt, buildWarningIndex, cityOutlook, nowVsForecast, regionGroups } from "../utils/earlyWarning";
import { changedRegionIds } from "../utils/interventionLab";
import { buildInterventionsPayload, planIsStale } from "../utils/interventions";
import { deepestRegionAt, frameAt } from "../utils/progression";
import { BASELINE_ID, buildScenarioPayload, isStale, selectScenario, validateScenarioParams } from "../utils/scenarios";
import { BASE_PATTERN_PROBE, buildRequest, controlsKey, DEFAULT_FORM, needsBasePattern, validateForm } from "../utils/simulationRequest";
import { useComparison } from "../utils/useComparison";
import { DEFAULT_LAYOUT, LAYOUTS } from "../utils/mapGeometry";
import { describeRunState } from "../utils/runState";
import { usePlayback } from "../utils/usePlayback";
import { useSimulation } from "../utils/useSimulation";

const sameShape = (a, b) => !a || (a.rows === b.rows && a.cols === b.cols);

function GridSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-[620px] animate-pulse grid-cols-5 gap-[5px]" aria-hidden="true">
      {Array.from({ length: 25 }, (_, i) => (
        <div key={i} className="aspect-square rounded-sm bg-line/50" />
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [view, setView] = useState("depth");
  const [layout, setLayout] = useState(DEFAULT_LAYOUT); // "grid" (default) or "map": two views of the same state
  const [mapZoom, setMapZoom] = useState("city"); // Map View only: "city" | "region" | "neighborhood"
  const [selectedId, setSelectedId] = useState(null);
  const [historicalEventId, setHistoricalEventId] = useState(null); // set only by a historical replay; cleared by any other run
  const [backendStatus, setBackendStatus] = useState("checking");
  const shape = useRef(null);
  const hasRun = useRef(false);
  // The city's own storm pattern, learned from an unmodified baseline response. State (not a ref) so that
  // request previews, the comparison key and the stale checks all update when it arrives.
  const [baseRainfall, setBaseRainfall] = useState(null);
  const [ranControlsKey, setRanControlsKey] = useState(null);
  const { data, status, error, run } = useSimulation();

  // Scenario Lab: the catalogue comes from the backend; `selection` is what the lab currently shows.
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState(null);
  const [selection, setSelection] = useState({ id: BASELINE_ID, params: {} });
  const loadCatalog = useCallback(() => {
    setCatalogError(null);
    getScenarios().then(setCatalog).catch(setCatalogError);
  }, []);

  // Interventions: `plan` is the ordered list the next run will apply after the scenario.
  const [interventionCatalog, setInterventionCatalog] = useState(null);
  const [interventionError, setInterventionError] = useState(null);
  const [plan, setPlan] = useState([]);
  const loadInterventions = useCallback(() => {
    setInterventionError(null);
    getInterventions().then(setInterventionCatalog).catch(setInterventionError);
  }, []);

  // Storm intensity scales the city's pattern, so the pattern must be known before building a request.
  // Normally the first baseline run provides it; if that run failed, fetch it with a one-step probe.
  const ensureBasePattern = useCallback(async () => {
    if (!needsBasePattern(form, baseRainfall)) return baseRainfall;
    const probe = await simulate(BASE_PATTERN_PROBE);
    setBaseRainfall(probe.city.rainfall);
    return probe.city.rainfall;
  }, [form, baseRainfall]);

  const runSimulation = useCallback(async (chosen, chosenPlan, chosenForm, historicalId = null) => {
    const active = chosen?.id ? chosen : selection; // click handlers pass an event, which is ignored
    const activePlan = Array.isArray(chosenPlan) ? chosenPlan : plan;
    const activeForm = chosenForm ?? form;
    let base;
    try {
      base = await ensureBasePattern();
    } catch {
      await run(BASE_PATTERN_PROBE); // same failure, surfaced through the normal error banner
      return;
    }
    const payload = buildRequest(activeForm, base, buildScenarioPayload(active), buildInterventionsPayload(activePlan));
    const result = await run(payload);
    // The labs sit below the results, so bring the fresh (or failed) run into view. Not on the first load.
    if (hasRun.current) document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
    hasRun.current = true;
    if (result) {
      setBackendStatus("online");
      setRanControlsKey(controlsKey(payload));
      // Only an unmodified baseline run reveals the city's own storm pattern.
      if (payload.rainfall === undefined && result.scenario.is_baseline && result.interventions.count === 0) setBaseRainfall(result.city.rainfall);
      // A selection only survives a re-run if that region still exists in the new city.
      setSelectedId((cur) => (cur && result.regions.some((r) => r.id === cur) && sameShape(shape.current, result.meta) ? cur : null));
      shape.current = result.meta;
      setHistoricalEventId(historicalId); // any run that is not itself a replay clears this (historicalId defaults to null)
    }
    return result;
  }, [form, run, selection, plan, ensureBasePattern]);

  // Baseline = default scenario and no interventions.
  const returnToBaseline = useCallback(() => {
    const baseline = { id: BASELINE_ID, params: {} };
    setSelection(baseline);
    setPlan([]);
    setMapZoom("city");
    runSimulation(baseline, []);
  }, [runSimulation]);

  // Same scenario and controls, no interventions. The plan is kept so it can be re-applied for comparison.
  const runWithoutInterventions = useCallback(() => runSimulation(undefined, []), [runSimulation]);
  const runWithInterventions = useCallback(() => runSimulation(undefined, plan), [runSimulation, plan]);

  // Historical Flood Replay: sets the EXISTING rainfall control from the documented event total, resets
  // scenario/plan to a clean baseline, and runs the same simulation pipeline as every other run.
  const replayHistoricalEvent = useCallback(
    (event) => {
      const replayForm = buildReplayForm(event);
      const baseline = { id: BASELINE_ID, params: {} };
      setForm(replayForm);
      setSelection(baseline);
      setPlan([]);
      setSelectedId(null);
      setLayout("map");
      setMapZoom("city");
      runSimulation(baseline, [], replayForm, event.id);
    },
    [runSimulation]
  );

  // Comparison: same controls + scenario, run without and with the plan by POST /api/compare.
  const comparison = useComparison();
  const comparePayload = useMemo(
    () => (plan.length > 0 && !needsBasePattern(form, baseRainfall) ? buildRequest(form, baseRainfall, buildScenarioPayload(selection), buildInterventionsPayload(plan)) : null),
    [form, selection, plan, baseRainfall]
  );
  const runComparison = useCallback(async () => {
    if (!comparePayload) return;
    const result = await comparison.run(comparePayload);
    if (result) document.getElementById("modeled-impact")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [comparePayload, comparison]);
  const comparisonStale = Boolean(comparison.data) && comparison.key !== (comparePayload ? JSON.stringify(comparePayload) : null);

  // Request body for the lab's preview: same controls + selected scenario, with the given interventions.
  const makePreviewRequest = useCallback(
    (interventions) => buildRequest(form, baseRainfall, buildScenarioPayload(selection), interventions.length > 0 ? interventions : undefined),
    [form, selection, baseRainfall]
  );

  // First load: check the server, then run the default simulation so the dashboard opens with real data.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    getHealth().then(() => setBackendStatus("online")).catch(() => setBackendStatus("offline"));
    loadCatalog();
    loadInterventions();
    runSimulation();
  }, [runSimulation, loadCatalog, loadInterventions]);

  useEffect(() => {
    if (error?.kind === "network") setBackendStatus("offline");
  }, [error]);

  const frames = data ? data.timeline.timestamps.length : 1;
  const playback = usePlayback(frames, data);
  const step = playback.step;

  const region = useMemo(() => data?.regions.find((r) => r.id === selectedId) ?? null, [data, selectedId]);
  const frame = useMemo(() => (data ? frameAt(data, step) : null), [data, step]);
  const deepest = useMemo(() => (data ? deepestRegionAt(data, step) : null), [data, step]);
  // Early warning: the index is fixed per run (forecast); everything else is that forecast seen from `step`.
  const warningIndex = useMemo(() => (data ? buildWarningIndex(data) : []), [data]);
  const alerts = useMemo(() => (data ? alertsAt(data, warningIndex, step) : []), [data, warningIndex, step]);
  const outlook = useMemo(() => (data ? cityOutlook(data, alerts, step) : null), [data, alerts, step]);
  const groups = useMemo(() => regionGroups(alerts), [alerts]);
  const numbers = useMemo(() => (data ? nowVsForecast(data, step) : null), [data, step]);
  const selectedAlert = useMemo(() => alerts.find((a) => a.id === selectedId), [alerts, selectedId]);
  const seek = playback.seek;
  const jumpTo = useCallback(
    (toStep, regionId) => {
      if (toStep == null) return;
      seek(toStep);
      if (regionId) setSelectedId(regionId);
    },
    [seek]
  );
  const markedIds = useMemo(() => changedRegionIds(data?.interventions), [data]);
  const toggleRegion = useCallback((id) => setSelectedId((cur) => (cur === id ? null : id)), []);

  // ---- Map View zoom (City -> Region -> Neighborhood). Visualization only: same data, same selection. ----
  const mapCtx = useMemo(() => {
    if (!data) return null;
    const e = data.city.elevation.flat();
    return { critical: data.config.critical_threshold, minElev: Math.min(...e), maxElev: Math.max(...e) };
  }, [data]);
  // Clicking a region on the city map both selects it (syncing Region Detail) and focuses the map on it.
  const focusRegion = useCallback((id) => { setSelectedId(id); setMapZoom("region"); }, []);
  const gridOnSelect = layout === "map" ? focusRegion : toggleRegion;
  const handleLayoutChange = useCallback((value) => { setLayout(value); setMapZoom("city"); }, []);
  const backToCityView = useCallback(() => setMapZoom("city"), []);
  const openNeighborhood = useCallback(() => setMapZoom("neighborhood"), []);
  // ---- Demo mode: a fixed script that calls the same actions as the manual controls ----------------
  const [demoIndex, setDemoIndex] = useState(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState(null);
  const afterLoad = useRef(null); // playback command to apply once the next result has loaded
  const { restart: restartPlayback, setSpeed } = playback;
  const clearComparison = comparison.clear;

  useEffect(() => {
    // Declared after usePlayback, so this runs after its own "new result" effect (which autoplays).
    if (!data || !afterLoad.current) return;
    const command = afterLoad.current;
    afterLoad.current = null;
    if (command === "end") seek(data.timeline.timestamps.length - 1);
  }, [data, seek]);

  const scrollToSection = (id) => setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);

  const runDemoStep = useCallback(async (index) => {
    const id = DEMO_STEPS[index].id;
    setDemoIndex(index);
    setDemoError(null);
    setDemoBusy(true);
    let ok = true;
    try {
      if (id === "baseline") {
        const baseline = demoBaselineSelection();
        setForm(DEFAULT_FORM); setSelection(baseline); setPlan([]); setSelectedId(null); setView("depth"); clearComparison();
        afterLoad.current = "end";
        ok = Boolean(await runSimulation(baseline, [], DEFAULT_FORM));
      } else if (id === "scenario") {
        const heavy = demoScenarioSelection(catalog);
        setSelection(heavy);
        afterLoad.current = "end";
        ok = Boolean(await runSimulation(heavy, [], DEFAULT_FORM));
      } else if (id === "progression") {
        setSpeed(DEMO_PLAYBACK_SPEED);
        restartPlayback();
      } else if (id === "warning") {
        const jump = demoWarningJump(data);
        setSpeed(1);
        jumpTo(jump.step, jump.regionId);
      } else if (id === "plan") {
        setPlan(buildDemoPlan(data, interventionCatalog));
      } else if (id === "intervene") {
        afterLoad.current = "end";
        ok = Boolean(await runSimulation(undefined, plan, DEFAULT_FORM));
      } else if (id === "impact") {
        ok = Boolean(await comparison.run(comparePayload));
      }
    } catch (err) {
      ok = false;
      setDemoError(err.message);
    }
    if (!ok) setDemoError((cur) => cur ?? "the simulation server did not return a result.");
    setDemoBusy(false);
    scrollToSection(DEMO_STEPS[index].section);
  }, [catalog, interventionCatalog, data, plan, comparePayload, comparison, runSimulation, jumpTo, restartPlayback, setSpeed, clearComparison]);

  const demoActive = demoIndex !== null;
  const demo = {
    ready: demoReady(catalog, interventionCatalog) && backendStatus !== "offline",
    active: demoActive,
    onStart: () => runDemoStep(0),
  };

  const problems = validateForm(form);
  // The controls on screen differ from the ones that produced the results on screen.
  const controlsChanged = Boolean(data) && ranControlsKey !== null && problems.length === 0 && !needsBasePattern(form, baseRainfall) &&
    controlsKey(buildRequest(form, baseRainfall)) !== ranControlsKey;
  const selectedScenario = catalog?.scenarios.find((s) => s.id === selection.id);
  const scenarioProblems = [...problems, ...(selectedScenario ? validateScenarioParams(selectedScenario, selection.params) : [])];
  const scenarioName = selectedScenario?.name ?? "Baseline";
  const loading = status === "loading";
  const steps = form.duration > 0 ? Math.round(form.duration / form.timestep) : 0;

  const busy = loading || comparison.status === "loading";
  const showing = data ? describeRunState(data).title : null;

  return (
    <div className="min-h-screen">
      <Header backendStatus={backendStatus} showing={showing} busy={busy} demo={demo} />

      <main className={`mx-auto grid max-w-[1600px] gap-5 p-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:p-5 ${demoActive ? "pb-52 lg:pb-40" : ""}`}>
        <aside id="simulate" data-section="" className="lg:sticky lg:top-[5.25rem] lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
          <ControlPanel form={form} onChange={setForm} onRun={runSimulation} loading={loading} problems={scenarioProblems} steps={steps} scenarioName={scenarioName} planCount={plan.length} />
        </aside>

        <div className="min-w-0 space-y-5">
          {/* ---- 1-3: results of the run on screen ------------------------------------------ */}
          <div id="results" data-section="" className="space-y-4">
            <StatusBanner error={error} onRetry={runSimulation} />

            {!data && !error && (
              <Panel title="Flood map" aside="Running the first simulation">
                <GridSkeleton />
              </Panel>
            )}

            {!data && error && (
              <Panel title="Flood map">
                <p className="text-ink-soft">No simulation to show yet. Fix the problem above, then run the simulation to see the flood develop.</p>
              </Panel>
            )}

            {data && (
              <div className={`space-y-4 transition-opacity ${loading ? "opacity-50" : ""}`} aria-busy={loading}>
                <RunStateBar data={data} controlsChanged={controlsChanged} scenarioCatalog={catalog} interventionCatalog={interventionCatalog} onBaseline={returnToBaseline} onWithout={runWithoutInterventions} loading={loading} />

                <HistoricalReplayBanner eventId={historicalEventId} />

                <AlertBanner outlook={outlook} onJump={jumpTo} />

                <div id="progression" data-section="" className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                  <Panel
                    title={
                      mapZoom === "city"
                        ? "Flood map, current state"
                        : mapZoom === "region"
                        ? `Region focus: ${selectedId}`
                        : `Simulated neighborhood: ${selectedId}`
                    }
                    aside={
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {mapZoom !== "city" && (
                          <button type="button" className="btn btn-ghost" onClick={backToCityView}>
                            Back to City View
                          </button>
                        )}
                        <div role="radiogroup" aria-label="Flood map layout" className="seg">
                          {LAYOUTS.map((l) => (
                            <button key={l.value} type="button" role="radio" aria-checked={layout === l.value} onClick={() => handleLayoutChange(l.value)}>
                              {l.label}
                            </button>
                          ))}
                        </div>
                        {mapZoom !== "neighborhood" && (
                          <div role="radiogroup" aria-label="Grid view" className="seg">
                            {VIEWS.map((v) => (
                              <button key={v.value} type="button" role="radio" aria-checked={view === v.value} onClick={() => setView(v.value)}>
                                {v.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    }
                  >
                    {mapZoom === "city" && (
                      <>
                        {/* wide screens: current state beside the map, so the whole grid fits on the first screen */}
                        <div className="grid gap-4 xl:grid-cols-[13.5rem_minmax(0,1fr)]">
                          <NowStrip frame={frame} deepestRegion={deepest} playing={playback.playing} />
                          <FloodGrid data={data} step={step} view={view} layout={layout} selectedId={selectedId} onSelect={gridOnSelect} markedIds={markedIds} />
                        </div>
                        <div className="mt-5 border-t border-line pt-4">
                          <TimelineControls playback={playback} timeline={data.timeline} />
                        </div>
                      </>
                    )}

                    {mapZoom === "region" && region && (
                      <>
                        <div className="mb-4">
                          <NowStrip frame={frame} deepestRegion={deepest} playing={playback.playing} />
                        </div>
                        <RegionFocus data={data} step={step} view={view} ctx={mapCtx} region={region} markedIds={markedIds} onSelect={focusRegion} onOpenNeighborhood={openNeighborhood} />
                        <div className="mt-5 border-t border-line pt-4">
                          <TimelineControls playback={playback} timeline={data.timeline} />
                        </div>
                      </>
                    )}

                    {mapZoom === "neighborhood" && region && (
                      <NeighborhoodView data={data} step={step} region={region} playback={playback} onOpenIntervention={() => scrollToSection("intervention")} />
                    )}
                  </Panel>

                  <Panel title="Region detail" className="self-start xl:sticky xl:top-[5.25rem]">
                    <RegionDetail data={data} region={region} step={step} alert={selectedAlert} onJump={jumpTo} />
                  </Panel>
                </div>

                <SummaryCards summary={data.summary} />

                <Panel title="Progression charts" aside={`${data.meta.num_steps} timesteps, dashed line marks the current time`}>
                  <ProgressionCharts data={data} step={step} region={region} />
                </Panel>

                <EarlyWarningPanel
                  alerts={alerts}
                  groups={groups}
                  numbers={numbers}
                  time={data.timeline.timestamps[step]}
                  duration={data.summary.duration_minutes}
                  selectedId={selectedId}
                  onSelect={toggleRegion}
                  onJump={jumpTo}
                />
              </div>
            )}
          </div>

          {/* ---- 4-6: what-if tools. Running them scrolls back up to the results. ------------- */}
          <HistoricalEvents events={HISTORICAL_EVENTS} activeEventId={historicalEventId} disabled={loading} onReplay={replayHistoricalEvent} />

          <ScenarioLab
            catalog={catalog}
            catalogError={catalogError}
            onRetryCatalog={loadCatalog}
            selection={selection}
            onSelect={(s) => setSelection(selectScenario(s))}
            onParam={(name, value) => setSelection((cur) => ({ ...cur, params: { ...cur.params, [name]: value } }))}
            onRun={runSimulation}
            onBaseline={returnToBaseline}
            loading={loading}
            problems={scenarioProblems}
            activeId={data?.scenario.id}
            stale={isStale(selection, data?.scenario)}
          />

          <InterventionLab
            catalog={interventionCatalog}
            catalogError={interventionError}
            onRetryCatalog={loadInterventions}
            data={data}
            alerts={alerts}
            selectedRegionId={selectedId}
            plan={plan}
            onPlanChange={setPlan}
            makeRequest={makePreviewRequest}
            scenarioName={scenarioName}
            onRunWith={runWithInterventions}
            onRunWithout={runWithoutInterventions}
            onCompare={runComparison}
            comparing={comparison.status === "loading"}
            loading={loading}
            stale={planIsStale(plan, data?.interventions)}
            blocked={scenarioProblems.length > 0}
          />

          <ComparisonDashboard
            comparison={comparison.data}
            status={comparison.status}
            error={comparison.error}
            stale={comparisonStale}
            canCompare={Boolean(comparePayload) && scenarioProblems.length === 0}
            onCompare={runComparison}
            interventionCatalog={interventionCatalog}
            selectedId={selectedId}
            onSelect={toggleRegion}
          />

          {data && <p className="border-t border-line pt-3 text-sm text-ink-soft">{data.meta.disclaimer}</p>}
        </div>
      </main>

      {demoActive && (
        <DemoBar
          index={demoIndex}
          busy={demoBusy || loading || comparison.status === "loading"}
          fact={demoFact(DEMO_STEPS[demoIndex].id, data, comparison.data)}
          error={demoError}
          onNext={() => runDemoStep(demoIndex + 1)}
          onRestart={() => runDemoStep(0)}
          onExit={() => { setDemoIndex(null); setDemoError(null); }}
        />
      )}
    </div>
  );
}
