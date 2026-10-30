import { useMemo } from "react";
import { component, kindLabel, relLabel, shortId, type LedgerObject } from "../lib/ledger";
import { KindIcon } from "./Icons";

interface N {
  key: string;
  obj?: LedgerObject;
  kind: string;
  name: string;
  layer: number;
  row: number;
}

const W = 220;
const H = 54;
const GX = 78;
const GY = 16;
const PAD = 14;

const KIND_ORDER = ["catalog-item", "subscription", "resource-action", "policy", "template", "custom-resource", "abx-action", "property-group", "image-profile", "flavor-profile", "vro-workflow"];
const BAR: Record<string, string> = {
  template: "var(--k-template)",
  "catalog-item": "var(--k-catalog)",
  "content-source": "var(--k-source)",
  policy: "var(--k-policy)",
  subscription: "var(--k-subscription)",
  "abx-action": "var(--k-abx)",
  "property-group": "var(--k-pg)",
  "custom-resource": "var(--k-custom)",
  "resource-action": "var(--k-raction)",
  "vro-workflow": "var(--k-vro)",
  "image-profile": "var(--k-infra)",
  "flavor-profile": "var(--k-infra)",
};

/** Left-to-right diagram of everything linked to `start`. */
export function ChainDiagram({ start, onNav }: { start: LedgerObject; onNav: (key: string) => void }) {
  const { nodes, edges, width, height } = useMemo(() => layout(start), [start]);
  if (nodes.length < 2) return null;
  const pos = new Map(nodes.map((n) => [n.key, { x: PAD + n.layer * (W + GX), y: PAD + n.row * (H + GY) }]));

  return (
    <div className="chain-wrap">
      <svg className="chain" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Linked objects">
        <defs>
          <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path className="ah" d="M0 0L10 5L0 10z" />
          </marker>
        </defs>
        {edges.map((e, i) => {
          const a = pos.get(e.from)!;
          const b = pos.get(e.to)!;
          const x1 = a.x + W;
          const y1 = a.y + H / 2;
          const x2 = b.x - 2;
          const y2 = b.y + H / 2;
          const back = x2 <= x1;
          const d = back
            ? `M${a.x + W / 2} ${a.y + H} C ${a.x + W / 2} ${a.y + H + 30}, ${b.x + W / 2} ${b.y + H + 30}, ${b.x + W / 2} ${b.y + H + 2}`
            : `M${x1} ${y1} C ${x1 + GX / 2} ${y1}, ${x2 - GX / 2} ${y2}, ${x2} ${y2}`;
          return (
            <g key={i}>
              <path className="ce" d={d} markerEnd="url(#ah)">
                <title>{relLabel(e.rel, "out")}</title>
              </path>
            </g>
          );
        })}
        {nodes.map((n) => {
          const p = pos.get(n.key)!;
          const ext = !n.obj;
          return (
            <g
              key={n.key}
              className={`cn${n.key === start.key ? " sel" : ""}${ext ? " ext" : ""}`}
              transform={`translate(${p.x} ${p.y})`}
              onClick={() => n.obj && onNav(n.key)}
              role={ext ? undefined : "button"}
              tabIndex={ext ? undefined : 0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && n.obj && onNav(n.key)}
            >
              <title>{ext ? `vRO workflow ${n.name} (in the vRO package)` : `${kindLabel(n.kind)}: ${n.name}`}</title>
              <rect width={W} height={H} rx="8" />
              <rect className="cn-bar" width="5" height={H} rx="2" fill={BAR[n.kind] ?? "var(--muted)"} />
              <foreignObject x="14" y="7" width="16" height="16">
                <KindIcon kind={n.kind as never} size={14} />
              </foreignObject>
              <text className="cn-k" x="34" y="19">
                {ext ? "vRO workflow" : kindLabel(n.kind)}
              </text>
              <text className="cn-n" x="14" y="40">
                {clip(n.name, 28)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function clip(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function layout(start: LedgerObject) {
  const objs = component(start);
  const nodes = new Map<string, N>();
  for (const o of objs) nodes.set(o.key, { key: o.key, obj: o, kind: o.type, name: o.name, layer: 0, row: 0 });
  const edges: { from: string; to: string; rel: string }[] = [];
  for (const o of objs) {
    for (const r of o.out) {
      if (r.rel === "from-source" || r.rel === "applies-to" || r.rel === "has-tag" || r.rel === "needs-tag" || r.rel === "in-account") continue;
      if (!r.obj) {
        const id = r.key.split("|")[1] ?? r.key;
        if (!nodes.has(r.key)) nodes.set(r.key, { key: r.key, kind: "vro-workflow", name: shortId(id), layer: 0, row: 0 });
      } else if (!nodes.has(r.obj.key)) continue;
      edges.push({ from: o.key, to: r.key, rel: r.rel });
    }
  }
  // longest-path layering (bounded, so a cycle can't loop forever)
  for (let pass = 0; pass < nodes.size; pass++) {
    let changed = false;
    for (const e of edges) {
      const a = nodes.get(e.from)!;
      const b = nodes.get(e.to)!;
      if (b.layer < a.layer + 1 && a.layer + 1 < nodes.size) {
        b.layer = a.layer + 1;
        changed = true;
      }
    }
    if (!changed) break;
  }
  const layers = new Map<number, N[]>();
  for (const n of nodes.values()) layers.set(n.layer, [...(layers.get(n.layer) ?? []), n]);
  let maxRows = 0;
  for (const list of layers.values()) {
    list.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name));
    list.forEach((n, i) => (n.row = i));
    maxRows = Math.max(maxRows, list.length);
  }
  const nLayers = Math.max(...[...layers.keys()]) + 1;
  return {
    nodes: [...nodes.values()],
    edges,
    width: PAD * 2 + nLayers * W + (nLayers - 1) * GX,
    height: PAD * 2 + maxRows * H + (maxRows - 1) * GY + 30,
  };
}
