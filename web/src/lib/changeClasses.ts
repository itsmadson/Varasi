// Single source of truth for change-class colors (standard + urban lifecycle),
// used by every panel and by the MapLibre paint expressions.

export const CLASS_COLOR: Record<string, string> = {
  // standard land-cover
  urban_growth: "#c46a5a",
  vegetation_loss: "#cb9a54",
  vegetation_gain: "#8c9258",
  water_change: "#5a8fc4",
  bare_soil: "#b7bd90",
  unknown: "#a8ae79",
  // urban construction lifecycle
  excavation: "#8a6d3b",
  earthworks_fill: "#d8c98a",
  new_construction: "#d06b4f",
  building_demolition: "#7a4a44",
  paving: "#5b5f6b",
  soil_sealing: "#b08a5a",
  greenspace_loss: "#cb9a54",
  greenspace_gain: "#8c9258",
};

// MapLibre "match" expression on the change_class property.
export function classMatchExpr(): (string | string[])[] {
  const pairs: (string | string[])[] = [];
  for (const [k, v] of Object.entries(CLASS_COLOR)) {
    if (k === "unknown") continue;
    pairs.push(k, v);
  }
  return ["match", ["get", "change_class"], ...pairs, CLASS_COLOR.unknown];
}
