import { emblemGeometry, emblemPaths } from "./emblemGeometry";
import { useVisualStyle } from "./visualStyle";
import type { VisualStyle } from "./types";
export function Emblem({
  size = 42,
  className = "",
  visualStyle,
}: {
  size?: number;
  className?: string;
  visualStyle?: VisualStyle;
}) {
  const activeStyle = useVisualStyle();
  const style = visualStyle || activeStyle;
  const geometry = emblemGeometry(style);
  return (
    <svg
      className={`dsh-emblem ${className}`}
      style={{ width: size, height: size }}
      viewBox={style === "laterano" ? "-118 -118 236 236" : "-106 -106 212 212"}
      fill="currentColor"
      fillRule="evenodd"
      aria-label={`DSH ${geometry?.name || (style === "laterano" ? "CONCORD" : "DELTA CIRCUIT")} 部门徽章`}
      role="img"
    >
      {emblemPaths(geometry).map((path, index) => <path key={index} d={path} />)}
    </svg>
  );
}
