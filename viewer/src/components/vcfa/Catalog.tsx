import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { readJson, type Ledger, type LedgerObject } from "../../lib/ledger";

/**
 * Read-only replica of the VCF Automation Service Broker "Consume > Catalog" page.
 * Nothing is trimmed away: long descriptions expand in place, and each card also
 * shows the item type and content source, which the real page keeps out of sight.
 */

type J = Record<string, unknown>;
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/** VCFA's default icon for template-based catalog items (two linked diamonds). */
export function TemplateItemIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <path d="M15 6 25 16 15 26 5 16z" fill="none" stroke="#0079b8" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M26 13 35 22 26 31 17 22z" fill="none" stroke="#62a420" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M17.8 22 21.5 18.3" stroke="#62a420" strokeWidth="2.4" />
    </svg>
  );
}
function WorkflowItemIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="22" r="10" fill="none" stroke="#e8743b" strokeWidth="2.6" />
      <circle cx="20" cy="22" r="4" fill="none" stroke="#e8743b" strokeWidth="2.6" />
      <circle cx="31" cy="9" r="3.2" fill="none" stroke="#e8743b" strokeWidth="2.2" />
    </svg>
  );
}
function GenericItemIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <rect x="8" y="8" width="24" height="24" rx="3" fill="none" stroke="#0079b8" strokeWidth="2.4" />
      <path d="M13 16h14M13 21h14M13 26h9" stroke="#0079b8" strokeWidth="2.2" />
    </svg>
  );
}

export function ItemIcon({ o, l, size = 40 }: { o: LedgerObject; l: Ledger; size?: number }) {
  const icon = o.meta.icon ? l.images.get(String(o.meta.icon)) : undefined;
  if (icon) return <img src={icon} width={size} height={size} alt="" style={{ objectFit: "contain" }} />;
  const t = str(o.meta.type);
  if (/vro|workflow/i.test(t)) return <WorkflowItemIcon size={size} />;
  if (/blueprint/i.test(t)) return <TemplateItemIcon size={size} />;
  return <GenericItemIcon size={size} />;
}

function Desc({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setOver(el.scrollHeight > el.clientHeight + 1);
  }, [text, open]);
  if (!text) return <div className="vc-desc vc-desc-empty" />;
  return (
    <div>
      <div ref={ref} className={`vc-desc${open ? " open" : ""}`}>
        {text}
      </div>
      {(over || open) && (
        <button
          className="vc-more"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
        >
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

type Sort = "name-asc" | "name-desc" | "created-desc" | "created-asc";

export function Catalog({ ledger, onNav }: { ledger: Ledger; onNav: (key: string) => void }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("name-asc");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [project, setProject] = useState<string>("");

  const items = useMemo(
    () =>
      ledger.objects
        .filter((o) => o.type === "catalog-item")
        .map((o) => {
          const j = (readJson(ledger, o.path) ?? {}) as J;
          const projects = (o.meta.projects as string[] | undefined)?.length ? (o.meta.projects as string[]) : o.project ? [o.project] : [];
          const src = o.out.find((r) => r.rel === "from-source")?.obj;
          const tpl = o.out.find((r) => r.rel === "publishes")?.obj;
          const typeName = str((j.type as J)?.name) || str(o.meta.typeName) || str(o.meta.type);
          return { o, j, projects, src, tpl, typeName, desc: str(j.description), created: str(j.createdAt) };
        }),
    [ledger],
  );
  const allProjects = useMemo(() => [...new Set(items.flatMap((i) => i.projects))].sort(), [items]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = items.filter(
      (i) =>
        (!project || i.projects.includes(project)) &&
        (!s || i.o.name.toLowerCase().includes(s) || i.desc.toLowerCase().includes(s) || i.typeName.toLowerCase().includes(s)),
    );
    const by = {
      "name-asc": (a: (typeof list)[0], b: (typeof list)[0]) => a.o.name.localeCompare(b.o.name),
      "name-desc": (a: (typeof list)[0], b: (typeof list)[0]) => b.o.name.localeCompare(a.o.name),
      "created-desc": (a: (typeof list)[0], b: (typeof list)[0]) => b.created.localeCompare(a.created),
      "created-asc": (a: (typeof list)[0], b: (typeof list)[0]) => a.created.localeCompare(b.created),
    }[sort];
    return [...list].sort(by);
  }, [items, q, sort, project]);

  return (
    <div className="vc">
      <div className="vc-head">
        <h2 className="vc-title">Catalog</h2>
        <span className="vc-count">{items.length} items</span>
        <label className="vc-filter">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
            <path d="M3 4h18l-7 8.5V19l-4 2v-8.5z" />
          </svg>
          <select value={project} onChange={(e) => setProject(e.target.value)} aria-label="Filter by project">
            <option value="">FILTER: ALL PROJECTS</option>
            {allProjects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <div className="spacer" />
        <label className="vc-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" strokeLinecap="round" />
          </svg>
          <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="vc-sort">
          Sort:
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="name-asc">Name (ascending)</option>
            <option value="name-desc">Name (descending)</option>
            <option value="created-desc">Created (newest)</option>
            <option value="created-asc">Created (oldest)</option>
          </select>
        </label>
        <div className="vc-layout" role="group" aria-label="Layout">
          <button className={layout === "list" ? "on" : ""} onClick={() => setLayout("list")} aria-label="List" title="List">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1" />
            </svg>
          </button>
          <button className={layout === "grid" ? "on" : ""} onClick={() => setLayout("grid")} aria-label="Cards" title="Cards">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
          </button>
        </div>
      </div>
      <div className="vc-usage">
        <strong>Exported from</strong> {ledger.manifest.source.organization} · {ledger.manifest.source.fqdn}
        <span className="vc-ro">Read-only</span>
      </div>

      {layout === "grid" ? (
        <div className="vc-grid">
          {shown.map(({ o, projects, src, tpl, typeName, desc }) => (
            <div className="vc-card" key={o.key} role="button" tabIndex={0} onClick={() => onNav(o.key)} onKeyDown={(e) => e.key === "Enter" && onNav(o.key)}>
              <div className="vc-card-body">
                <div className="vc-icon">
                  <ItemIcon o={o} l={ledger} />
                </div>
                <div className="vc-name">{o.name}</div>
                <Desc text={desc} />
              </div>
              <dl className="vc-meta">
                <dt>Projects</dt>
                <dd>{projects.join(", ") || "—"}</dd>
                <dt>Type</dt>
                <dd>{typeName || "—"}</dd>
                <dt>Source</dt>
                <dd>{src ? src.name : "—"}</dd>
                {tpl && (
                  <>
                    <dt>Template</dt>
                    <dd>{tpl.name}</dd>
                  </>
                )}
                {o.meta.hasCustomForm === true && (
                  <>
                    <dt>Form</dt>
                    <dd>Custom form</dd>
                  </>
                )}
              </dl>
              <div className="vc-foot">
                <span>VIEW DETAILS</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="vx-grid vc-list">
          <div className="vc-list-row vx-grid-head">
            <span />
            <span>Name</span>
            <span>Description</span>
            <span>Projects</span>
            <span>Type</span>
            <span>Source</span>
            <span>Template</span>
          </div>
          {shown.map(({ o, projects, src, tpl, typeName, desc }) => (
            <div className="vc-list-row" key={o.key} role="button" tabIndex={0} onClick={() => onNav(o.key)} onKeyDown={(e) => e.key === "Enter" && onNav(o.key)}>
              <span className="vc-list-ico">
                <ItemIcon o={o} l={ledger} size={24} />
              </span>
              <span className="vx-link">{o.name}</span>
              <span className="vc-list-desc">{desc}</span>
              <span>{projects.join(", ")}</span>
              <span>{typeName}</span>
              <span>{src?.name ?? ""}</span>
              <span>{tpl?.name ?? ""}</span>
            </div>
          ))}
        </div>
      )}
      {!shown.length && <p className="muted">{items.length ? "No catalog items match." : "This export has no catalog items."}</p>}
    </div>
  );
}
