import NowVsForecast from "./NowVsForecast";
import Panel from "./Panel";
import RegionGroups from "./RegionGroups";
import WarningTable from "./WarningTable";
import { LEAD } from "../utils/earlyWarning";

export default function EarlyWarningPanel({ alerts, groups, numbers, time, duration, selectedId, onSelect, onJump }) {
  return (
    <Panel id="early-warning" title="Early warning" aside="Forecast for this run, if conditions stay unchanged">
      <div className="grid gap-x-8 gap-y-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
        <div>
          <h3 className="h-sub mb-2">People and regions, now and forecast</h3>
          <NowVsForecast numbers={numbers} time={time} duration={duration} />
        </div>
        <div>
          <h3 className="h-sub mb-2">Regions by state</h3>
          <RegionGroups groups={groups} time={time} selectedId={selectedId} onSelect={onSelect} />
        </div>
      </div>

      <div className="mt-6 border-t border-line pt-4">
        <h3 className="h-sub mb-2">Highest-risk regions</h3>
        <WarningTable alerts={alerts} selectedId={selectedId} onSelect={onSelect} onJump={onJump} />
        <p className="mt-3 text-sm text-ink-soft">
          Ranked by urgency, then time until critical, then time until warning, then people. Urgency bands are prototype assumptions: critical within {LEAD.imminent} min, critical within {LEAD.soon} min.
          All times come from this simulation run, not from a real-world flood forecast.
        </p>
      </div>
    </Panel>
  );
}
