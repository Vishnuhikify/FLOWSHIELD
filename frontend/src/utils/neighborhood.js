// Illustrative neighborhood geometry for Level 3 of the map zoom. Purely cosmetic: roads, blocks, drainage
// points and a low-lying area, laid out deterministically from the region id so the same region always
// looks the same. This is NOT real building or road data and is not derived from any mapping API.
//
// The only real (non-illustrative) input is the region's water depth at the current timestep, which comes
// from the existing simulation result and is rendered as a simple rising water overlay.
import { depthScaleMax } from "./colors";

// Small deterministic PRNG (mulberry32) seeded from the region id, so layouts are stable and reproducible.
function seededRandom(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  let a = h >>> 0 || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VIEWBOX = 100;

/** Deterministic illustrative layout for one region: roads, building blocks and drainage points. */
export function buildNeighborhoodLayout(regionId) {
  const rand = seededRandom(regionId);
  const between = (min, max) => min + rand() * (max - min);

  const roads = [
    { x1: 0, y1: 35, x2: VIEWBOX, y2: 38 },
    { x1: 0, y1: 68, x2: VIEWBOX, y2: 66 },
    { x1: 22, y1: 0, x2: 20, y2: VIEWBOX },
    { x1: 62, y1: 0, x2: 65, y2: VIEWBOX },
  ];

  const buildings = Array.from({ length: 9 }, (_, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const w = between(8, 14);
    const h = between(8, 14);
    return {
      id: `b${i}`,
      x: 6 + col * 30 + between(-3, 3),
      y: 6 + row * 30 + between(-3, 3),
      w, h,
      rotate: between(-4, 4),
    };
  });

  const drains = Array.from({ length: 4 }, (_, i) => ({
    id: `d${i}`,
    x: between(12, 88),
    y: 68 + between(2, 10),
  }));

  // A single illustrative low-lying basin near the bottom of the tile, where modeled water collects first.
  const lowArea = { cx: between(35, 65), cy: 82, rx: between(28, 38), ry: between(10, 14) };

  return { roads, buildings, drains, lowArea, viewBox: `0 0 ${VIEWBOX} ${VIEWBOX}` };
}

/** 0..1 share of the illustrative tile's low area that the current modeled depth would cover. */
export const neighborhoodWaterFraction = (depth, criticalThreshold) => Math.min(1, Math.max(0, depth / depthScaleMax(criticalThreshold)));
