// Single source of truth for change-class colors (standard + urban lifecycle),
// used by every panel and by the MapLibre paint expressions.

export const CLASS_COLOR: Record<string, string> = {
  // construction lifecycle (urban classifier)
  excavation: "#8a6d3b",
  earthworks_fill: "#d8c98a",
  new_construction: "#d06b4f",
  building_demolition: "#7a4a44",
  paving: "#5b5f6b",
  soil_sealing: "#b08a5a",
  urban_growth: "#c46a5a",
  // vegetation / water / land
  vegetation_gain: "#6f9a3f",
  vegetation_loss: "#cb9a54",
  water_change: "#5a8fc4",
  bare_soil: "#b7bd90",
  unknown: "#a8ae79",
};

// Categories group the change classes into the buckets a city cares about.
// A run always classifies everything; the user picks which categories/classes to
// show and can recolor each one.
export const CATEGORIES: { key: string; classes: string[] }[] = [
  { key: "construction", classes: ["excavation", "earthworks_fill", "new_construction", "building_demolition", "paving", "soil_sealing", "urban_growth"] },
  { key: "vegetation", classes: ["vegetation_gain", "vegetation_loss"] },
  { key: "water", classes: ["water_change"] },
  { key: "soil", classes: ["bare_soil"] },
  { key: "other", classes: ["unknown"] },
];

export const ALL_CLASSES = CATEGORIES.flatMap((c) => c.classes);

// Construction classes are produced only by the urban classifier — selecting any
// of them switches a run into urban mode.
export const CONSTRUCTION_CLASSES = CATEGORIES[0].classes;
export function needsUrban(enabled: Set<string>): boolean {
  return CONSTRUCTION_CLASSES.some((c) => c !== "urban_growth" && enabled.has(c));
}

// MapLibre "match" expression on change_class. Pass a color override map to
// reflect user style edits; unlisted classes fall back to the shared palette.
export function classMatchExpr(colors: Record<string, string> = CLASS_COLOR): (string | string[])[] {
  const pairs: (string | string[])[] = [];
  for (const k of ALL_CLASSES) {
    if (k === "unknown") continue;
    pairs.push(k, colors[k] ?? CLASS_COLOR[k] ?? "#a8ae79");
  }
  return ["match", ["get", "change_class"], ...pairs, colors.unknown ?? CLASS_COLOR.unknown];
}
