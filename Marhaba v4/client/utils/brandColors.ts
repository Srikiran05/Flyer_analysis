// Shared brand → color assignment so a brand keeps the same color on
// every chart (overall view, competitor pricing, price trend, ...).
//
// The color is derived from the brand's position in the APPLIED filter
// selection (my brand first, then competitors in selection order), which
// is the same input on every page — so the mapping always agrees.
// Pair order matches the promo overall view's original gradients
// (purple for my brand, then orange, cyan, green, yellow, pink).

export interface BrandColorPair {
  /** Light stop / solid usage (labels, dots, lines) */
  main: string;
  /** Dark gradient stop */
  dark: string;
}

export const MY_BRAND_COLOR: BrandColorPair = { main: "#a78bfa", dark: "#7c3aed" };

export const COMPETITOR_COLOR_PAIRS: BrandColorPair[] = [
  { main: "#fb923c", dark: "#ea580c" }, // orange
  { main: "#22d3ee", dark: "#06b6d4" }, // cyan
  { main: "#4ade80", dark: "#22c55e" }, // green
  { main: "#facc15", dark: "#eab308" }, // yellow
  { main: "#f472b6", dark: "#ec4899" }, // pink
  { main: "#38bdf8", dark: "#0ea5e9" }, // sky
  { main: "#818cf8", dark: "#6366f1" }, // indigo
  { main: "#2dd4bf", dark: "#14b8a6" }, // teal
  { main: "#f87171", dark: "#dc2626" }, // red
  { main: "#a3e635", dark: "#84cc16" }, // lime
];

const norm = (brand?: string | null) => (brand ?? "").trim().toLowerCase();

export type BrandColorMap = Map<string, BrandColorPair>;

/** Build the shared map from the applied filter selection. */
export function buildBrandColorMap(
  myBrand: string | null | undefined,
  competitors: (string | null | undefined)[] = [],
): BrandColorMap {
  const map: BrandColorMap = new Map();
  if (norm(myBrand)) map.set(norm(myBrand), MY_BRAND_COLOR);
  let i = 0;
  for (const b of competitors) {
    const key = norm(b);
    if (!key || map.has(key)) continue;
    map.set(key, COMPETITOR_COLOR_PAIRS[i % COMPETITOR_COLOR_PAIRS.length]);
    i++;
  }
  return map;
}

/** Look up a brand's color; unknown brands fall back by index. */
export function getBrandColor(
  map: BrandColorMap,
  brand: string | null | undefined,
  fallbackIdx = 0,
): BrandColorPair {
  return (
    map.get(norm(brand)) ??
    COMPETITOR_COLOR_PAIRS[fallbackIdx % COMPETITOR_COLOR_PAIRS.length]
  );
}
