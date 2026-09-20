import { URGENCY } from "../utils/earlyWarning";

/* Urgency is carried by wording + fill weight, never by colour alone:
   solid = happening now, outline = forecast. */
const STYLE = {
  critical: "bg-critical text-white border-critical",
  imminent: "bg-white text-critical border-critical border-2",
  soon: "bg-warning-fill text-[#3d2500] border-warning-fill",
  warning: "bg-warning-tint text-warning border-warning-fill",
  watch: "bg-white text-ink-soft border-line",
  eased: "bg-safe-tint text-safe border-safe-tint",
};

export default function UrgencyTag({ tier }) {
  return <span className={`inline-block whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-sm font-semibold ${STYLE[tier]}`}>{URGENCY[tier].label}</span>;
}
