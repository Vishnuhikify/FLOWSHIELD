import { useActiveSection } from "../utils/useActiveSection";

// The product workflow is a real sequence, so the navigation is numbered in that order.
export const SECTIONS = [
  { id: "simulate", name: "Simulate" },
  { id: "progression", name: "Flood progression" },
  { id: "early-warning", name: "Early warning" },
  { id: "scenario", name: "Scenario" },
  { id: "intervention", name: "Intervention" },
  { id: "modeled-impact", name: "Comparison" },
];

function Logo() {
  return (
    <svg viewBox="0 0 40 44" className="h-9 w-8 shrink-0" aria-hidden="true">
      <path d="M20 2 36 8v13c0 10-6.5 17-16 21C10.5 38 4 31 4 21V8z" fill="none" stroke="#f8fafb" strokeWidth="2.5" />
      <path d="M10 19c3.3-3 6.7-3 10 0s6.7 3 10 0M10 27c3.3-3 6.7-3 10 0s6.7 3 10 0" fill="none" stroke="#6aa6d4" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export default function Header({ backendStatus, showing, busy, demo }) {
  const active = useActiveSection(SECTIONS.map((s) => s.id));
  const online = backendStatus === "online";
  return (
    <header className="on-dark sticky top-0 z-30 bg-ink text-panel shadow-[0_1px_0_rgba(255,255,255,0.08)]">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 lg:px-5">
        <a href="#simulate" className="flex items-center gap-2.5">
          <Logo />
          <span>
            <span className="block font-display text-2xl font-bold leading-none tracking-[0.08em]">FLOWSHIELD</span>
            <span className="mt-0.5 hidden text-xs text-[#a9bccd] sm:block xl:hidden 2xl:block">Flood simulation and early warning for city operations</span>
          </span>
        </a>

        <nav aria-label="Workflow" className="order-3 -mx-1 w-full overflow-x-auto xl:order-none xl:mx-0 xl:w-auto xl:flex-1">
          <ol className="flex min-w-max items-center gap-1 text-sm xl:justify-center">
            {SECTIONS.map((s, i) => {
              const current = s.id === active;
              return (
                <li key={s.id}>
                  <a href={`#${s.id}`} aria-current={current ? "location" : undefined}
                    className={`flex items-baseline gap-1.5 rounded-sm px-2.5 py-1.5 transition-colors ${current ? "bg-white/15 text-white" : "text-[#a9bccd] hover:text-white"}`}>
                    <span className="font-display text-base font-semibold">{i + 1}</span>
                    {s.name}
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="ml-auto flex items-center gap-4 text-sm">
          {showing && (
            <p className="hidden max-w-[15rem] truncate 2xl:block" title={showing}>
              <span className="text-[#a9bccd]">Showing </span>
              <span className="font-medium">{showing}</span>
            </p>
          )}
          {demo && (
            <button type="button" onClick={demo.onStart} disabled={!demo.ready || demo.active} title={demo.ready ? undefined : "Needs the simulation server and both catalogues"}
              className="btn !border-[#6aa6d4] !py-1 text-sm font-semibold text-[#cfe3f1] hover:bg-white/10 disabled:opacity-50">
              {demo.active ? "Demo running" : "Run demo"}
            </button>
          )}
          <p className="flex items-center gap-2" role="status">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${online ? "bg-[#5fc9a8]" : backendStatus === "checking" ? "bg-[#a9bccd]" : "bg-[#f08a7e]"}`} />
            {online ? "Simulation server online" : backendStatus === "checking" ? "Checking server" : "Simulation server offline"}
          </p>
        </div>
      </div>
      <div className="h-[3px] overflow-hidden bg-white/5" aria-hidden="true">
        {busy && <div className="fs-activity h-full w-1/3 bg-[#6aa6d4]" />}
      </div>
    </header>
  );
}
