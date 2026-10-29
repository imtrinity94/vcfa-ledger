import { useState } from "react";
import { isGroup, type PageId, type Section } from "../../lib/sections";

function Ico({ d }: { d: string }) {
  return (
    <svg className="vn-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** VCF Automation style left navigation for one top tab. */
export function VNav({ section, active, counts, onPage }: { section: Section; active?: PageId; counts: Partial<Record<PageId, number>>; onPage: (p: PageId) => void }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(false);
  return (
    <nav className={`sidebar vn${collapsed ? " vn-collapsed" : ""}`} aria-label={`${section.label} navigation`}>
      <div className="vn-collapse">
        <button onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} title={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? "»" : "«"}
        </button>
      </div>
      {!collapsed && (
        <div className="vn-list">
          {section.nav.map((g) => {
            if (!isGroup(g)) {
              const it = g.items[0];
              return (
                <button key={it.page} className={`vn-item vn-top${active === it.page ? " on" : ""}`} onClick={() => onPage(it.page)}>
                  <Ico d={g.icon} /> <span className="ellipsis">{it.label}</span>
                  {counts[it.page] !== undefined && <span className="vn-count">{counts[it.page]}</span>}
                </button>
              );
            }
            const open = !closed[g.label];
            return (
              <div key={g.label} className="vn-group">
                <button className="vn-item vn-top vn-head" onClick={() => setClosed({ ...closed, [g.label]: open })} aria-expanded={open}>
                  <Ico d={g.icon} /> <span className="ellipsis">{g.label}</span>
                  <svg className={`vn-chev${open ? " open" : ""}`} width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                    <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </button>
                {open &&
                  g.items.map((it) => (
                    <button key={it.page} className={`vn-item vn-sub${active === it.page ? " on" : ""}`} onClick={() => onPage(it.page)}>
                      <span className="ellipsis">{it.label}</span>
                      {counts[it.page] !== undefined && <span className="vn-count">{counts[it.page]}</span>}
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
      )}
    </nav>
  );
}
