import type { AreaMapCellKind, AreaMapMarkerKind, AreaMapSnapshot } from "../game/systems/areaMap";
import { node } from "./PausePanel";

const NS = "http://www.w3.org/2000/svg";
const SCALE = 10;
const TERRAIN: Record<AreaMapCellKind, string> = { ground: "#83905c", blocked: "#394d34", path: "#d2b47b", building: "#8a5c3d" };
const MARKERS: Record<AreaMapMarkerKind, { symbol: string; color: string; name: string }> = {
  player: { symbol: "●", color: "#fff9dd", name: "你" },
  resident: { symbol: "◆", color: "#ffe18b", name: "居民" },
  exit: { symbol: "□", color: "#e7f1bc", name: "回农场" },
  branch: { symbol: "╱", color: "#f5d19b", name: "枯枝" },
  stone: { symbol: "■", color: "#d3dce1", name: "溪石" },
  wild_mushroom: { symbol: "▲", color: "#ffc3a1", name: "野蘑菇" },
  building: { symbol: "", color: "#fff2c8", name: "建筑" },
};

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>): SVGElementTagNameMap[K] {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

/** Read-only SVG: no handlers, travel actions, or references to mutable scene objects. */
export function createAreaMapView(map: AreaMapSnapshot): HTMLElement {
  const section = node("section", "area-map");
  const name = map.area === "forest" ? "林缘森林" : "溪桥镇";
  const resources = map.markers.filter(m => ["branch", "stone", "wild_mushroom"].includes(m.kind));
  section.append(node("h3", "area-map-heading", `${name} · 方位图`));
  const picture = svg("svg", { viewBox: `0 0 ${map.width * SCALE} ${map.height * SCALE}`, role: "img", "aria-label": `${name}方位图，上北下南。${map.markers.map(m => `${m.label}：第${Math.floor(m.y) + 1}行、第${Math.floor(m.x) + 1}列`).join("；")}` });
  for (const cell of map.cells) picture.append(svg("rect", {
    x: cell.col * SCALE, y: cell.row * SCALE, width: SCALE, height: SCALE, fill: TERRAIN[cell.kind],
  }));
  const north = svg("text", { x: map.width * SCALE - 10, y: 16, "text-anchor": "end", fill: "#fff2c8", class: "area-map-label" });
  north.textContent = "北 ↑"; picture.append(north);
  for (const marker of map.markers) {
    const style = MARKERS[marker.kind], x = marker.x * SCALE, y = marker.y * SCALE;
    const group = svg("g", { "data-marker": marker.id, "data-kind": marker.kind });
    const title = svg("title", {}); title.textContent = marker.label; group.append(title);
    if (style.symbol) {
      const symbol = svg("text", { x, y, "text-anchor": "middle", "dominant-baseline": "central", fill: style.color, class: "area-map-symbol" });
      symbol.textContent = style.symbol; group.append(symbol);
    }
    if (["player", "resident", "exit", "building"].includes(marker.kind)) {
      const edge = marker.kind === "exit";
      const left = x < map.width * SCALE / 2;
      const label = svg("text", {
        x: edge ? left ? 12 : map.width * SCALE - 12 : Math.max(12, Math.min(map.width * SCALE - 12, x)),
        y: edge ? Math.min(map.height * SCALE - 8, y + 20) : Math.max(12, y - (marker.kind === "building" ? -4 : 10)),
        "text-anchor": edge ? left ? "start" : "end" : "middle", fill: style.color, class: "area-map-label",
      });
      label.textContent = marker.label; group.append(label);
    }
    picture.append(group);
  }
  section.append(picture);
  const legend = node("div", "area-map-legend");
  const kinds: AreaMapMarkerKind[] = ["player", "resident", "exit", ...(map.area === "forest" ? ["branch", "stone", "wild_mushroom"] as const : [])];
  for (const kind of kinds) {
    const entry = node("span"), icon = node("b", "", MARKERS[kind].symbol);
    icon.style.color = MARKERS[kind].color; icon.setAttribute("aria-hidden", "true");
    entry.append(icon, document.createTextNode(` ${MARKERS[kind].name}`)); legend.append(entry);
  }
  section.append(legend, node("p", "area-map-caption", `上北 · 下南 · 左西 · 右东${map.area === "forest" ? ` · 今日还可采 ${resources.length}/9 处` : ""}`),
    node("p", "area-map-caption", "仅供查看 · 浅色为道路，深绿为障碍 · 回农场请沿路步行"));
  return section;
}
