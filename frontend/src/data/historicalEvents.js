/**
 * Historical flood events — OBSERVED HISTORICAL DATA, stored locally as structured data.
 * No external API is called for this information.
 *
 * Only documented, publicly reported facts are recorded here. FLOWSHIELD does not reconstruct these
 * events: it derives one modeled rainfall rate from the documented total (see utils/historicalReplay.js)
 * and runs it through the SAME simulation engine used everywhere else in the app.
 *
 * Do not add hourly or sub-daily rainfall figures here unless they are themselves a documented fact —
 * see utils/historicalReplay.js for why only a totals-derived rate is used.
 */
export const HISTORICAL_EVENTS = [
  {
    id: "bengaluru-2022-09-05",
    name: "Bengaluru Flood",
    dateLabel: "September 5, 2022",
    date: "2022-09-05",
    // OBSERVED HISTORICAL DATA
    observedRainfallMm: 131.6,
    observedRainfallWindowHours: 24,
    affectedAreas: ["Mahadevapura", "Bellandur", "Varthur", "K R Puram", "Sarjapur"],
    // Provenance / source metadata, kept with the event so the facts above can be traced and checked.
    sources: [
      {
        label: "India Meteorological Department — Bengaluru-City September extreme-weather record",
        detail: "The IMD record lists 131.6 mm as the 24-hour rainfall value for 5 September 2022.",
        url: "https://city.imd.gov.in/citywx/extreme_data_view.php?id=43295",
      },
      {
        label: "The Indian Express — Bengaluru flooding coverage, 5 September 2022",
        detail: "Contemporary coverage reports 131.6 mm of rain and flooding in Sarjapur, Varthur and K R Puram, among other areas.",
        url: "https://indianexpress.com/article/cities/bangalore/after-heavy-overnight-rain-in-bengaluru-several-areas-waterlogged-traffic-hit-8131782/",
      },
      {
        label: "The Indian Express — K R Puram / IT-corridor flooding coverage, 6 September 2022",
        detail: "Coverage identifies Mahadevapura, Bellandur, K R Puram, Varthur and Sarjapur-area locations among heavily affected areas.",
        url: "https://indianexpress.com/article/cities/bangalore/schools-shut-bengalurus-puram-heavy-rainfall-streets-flooded-8135098/",
      },
    ],
    provenanceNote:
      "Compiled from the linked IMD record and contemporary news reporting. FLOWSHIELD stores only these summary " +
      "facts locally; it does not call any external API and does not hold a full dataset of the event.",
  },
];
