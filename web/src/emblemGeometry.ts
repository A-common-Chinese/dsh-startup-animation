export type EmblemGeometry = { name: string; parts: number[][][][] };

declare global {
  interface Window {
    DSHEmblem?: EmblemGeometry;
    DSHLateranoEmblem?: EmblemGeometry;
  }
}

export function emblemGeometry(style: "rhine" | "laterano") {
  return style === "laterano" ? window.DSHLateranoEmblem : window.DSHEmblem;
}

export function emblemPaths(geometry: EmblemGeometry | undefined) {
  return geometry?.parts.map((part) => part.map((contour) =>
    contour.map(([x, y], index) => `${index ? "L" : "M"}${x},${y}`).join(" ") + " Z",
  ).join(" ")) || [];
}
