import { useMemo, useState } from "react";
import { KINDS, type Ledger, type LedgerObject } from "../lib/ledger";
import { KindIcon } from "./Icons";

function FolderNode({
  name,
  items,
  depth,
  selected,
  onSelect,
  forceOpen,
}: {
  name: string;
  items: LedgerObject[];
  depth: number;
  selected?: string;
  onSelect: (key: string) => void;
  forceOpen: boolean;
}) {
  const [open, setOpen] = useState(true);
  const isOpen = open || forceOpen;
  const pad = name ? depth + 1 : depth;
  return (
    <>
      {name && (
        <button className="tree-folder" style={{ paddingLeft: 10 + depth * 12 }} onClick={() => setOpen(!open)} aria-expanded={isOpen}>
          <span className="caret">{isOpen ? "▾" : "▸"}</span> <span className="ellipsis">{name}</span> <span className="muted small">{items.length}</span>
        </button>
      )}
      {isOpen &&
        items.map((o) => (
          <button
            key={o.key}
            className={`tree-item ${selected === o.key ? "on" : ""}`}
            style={{ paddingLeft: 10 + pad * 12 }}
            onClick={() => onSelect(o.key)}
            title={o.name}
          >
            <KindIcon kind={o.type} /> <span className="ellipsis">{o.name}</span>
            {o.selectedBy === "dependency" && <span className="tag" title="Added to the export as a dependency">dep</span>}
          </button>
        ))}
    </>
  );
}

export function Sidebar({ ledger, selected, onSelect }: { ledger: Ledger; selected?: string; onSelect: (key: string) => void }) {
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return ledger.objects;
    return ledger.objects.filter(
      (o) => o.name.toLowerCase().includes(s) || o.id.toLowerCase().includes(s) || o.folder.join("/").toLowerCase().includes(s),
    );
  }, [q, ledger]);

  return (
    <nav className="sidebar" aria-label="Package contents">
      <div className="side-search">
        <input className="input" placeholder="Filter by name, project or ID…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="tree">
        {KINDS.map((g) => {
          const els = filtered.filter((o) => o.type === g.kind).sort((a, b) => a.name.localeCompare(b.name));
          if (!els.length) return null;
          const isCollapsed = collapsed[g.kind] && !q;
          // group into folders (project, policy type or event topic); objects with no folder sit at the top
          const folders = new Map<string, LedgerObject[]>();
          const loose: LedgerObject[] = [];
          for (const o of els) {
            const f = o.folder[0];
            if (!f) loose.push(o);
            else folders.set(f, [...(folders.get(f) ?? []), o]);
          }
          const useFolders = folders.size > 1 || (folders.size === 1 && loose.length > 0);
          return (
            <div key={g.kind} className="tree-group">
              <button className="tree-group-head" onClick={() => setCollapsed({ ...collapsed, [g.kind]: !collapsed[g.kind] })} aria-expanded={!isCollapsed}>
                <KindIcon kind={g.kind} /> <span className="tree-group-label">{g.label}</span> <span className="count">{els.length}</span>
                <span className="caret right">{isCollapsed ? "▸" : "▾"}</span>
              </button>
              {!isCollapsed &&
                (useFolders ? (
                  <>
                    {[...folders.entries()]
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([name, items]) => (
                        <FolderNode key={name} name={name} items={items} depth={0} selected={selected} onSelect={onSelect} forceOpen={!!q} />
                      ))}
                    {loose.length > 0 && <FolderNode name="" items={loose} depth={0} selected={selected} onSelect={onSelect} forceOpen />}
                  </>
                ) : (
                  <FolderNode name="" items={els} depth={0} selected={selected} onSelect={onSelect} forceOpen />
                ))}
            </div>
          );
        })}
        {!filtered.length && <p className="muted small pad">No objects match “{q}”.</p>}
      </div>
    </nav>
  );
}
