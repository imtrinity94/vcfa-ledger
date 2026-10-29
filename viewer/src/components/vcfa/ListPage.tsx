import { useMemo, useState, type ReactNode } from "react";
import { policyTypeLabel, readJson, relLabel, type Ledger, type LedgerObject, type Kind } from "../../lib/ledger";
import { pageInfo, type PageId } from "../../lib/sections";
import { ItemIcon } from "./Catalog";

/**
 * VCF Automation style list pages (Clarity datagrid): one per left-nav entry.
 * Read-only; every row opens the full object page.
 */

type J = Record<string, unknown>;
const str = (v: unknown) => (v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
const fmt = (v: unknown) => {
  const s = str(v);
  if (!s) return "";
  const d = new Date(s);
  return /^\d{4}-\d\d-\d\dT/.test(s) && !isNaN(+d) ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : s;
};

interface Col {
  label: string;
  get: (o: LedgerObject, j: J) => string;
  render?: (o: LedgerObject, j: J) => ReactNode;
  width?: string;
}

const SOURCE_TYPES: Record<string, string> = {
  "com.vmw.blueprint": "VCF Automation Templates",
  "com.vmw.vro.workflow": "VCF Operations Orchestrator Workflow",
  "com.vmw.abx.actions": "Extensibility actions",
  "com.vmw.mp.content": "Marketplace VM Templates",
  "com.github.blueprint": "GitHub",
  "com.gitlab.blueprint": "GitLab",
};

const statusChip = (s: string) => (s ? <span className={`vl-status ${/released|on|enabled|active/i.test(s) ? "ok" : /draft/i.test(s) ? "info" : ""}`}>{s}</span> : null);
const updated = (j: J) => fmt(j.updatedAt ?? j.lastUpdatedAt ?? j.createdAt);
const updatedBy = (j: J) => str(j.updatedBy ?? j.lastUpdatedBy ?? j.createdBy);

const acctRegion = (o: LedgerObject) => [str(o.meta.cloudAccountName), str(o.meta.regionName)].filter(Boolean).join(" / ");
const tagList = (o: LedgerObject) => ((o.meta.tags as string[] | undefined) ?? []).join(", ");
const tagChips = (o: LedgerObject) => {
  const t = (o.meta.tags as string[] | undefined) ?? [];
  return t.length ? (
    <span className="vx-tags">
      {t.map((x) => (
        <span key={x} className="vx-tag">
          {x}
        </span>
      ))}
    </span>
  ) : null;
};
const ACCOUNT_TYPES: Record<string, string> = { vsphere: "vCenter", nsxt: "NSX", nsxv: "NSX-V", vmc: "VMware Cloud on AWS", aws: "AWS", azure: "Azure", gcp: "GCP", vcf: "VCF" };

const COLS: Partial<Record<Kind, Col[]>> = {
  "cloud-account": [
    { label: "Name", get: (o) => o.name },
    { label: "Type", get: (_o, j) => ACCOUNT_TYPES[str(j.cloudAccountType)] ?? str(j.cloudAccountType) },
    { label: "Address", get: (_o, j) => str((j.cloudAccountProperties as J)?.hostName ?? (j.cloudAccountProperties as J)?.hostname) },
    { label: "Regions", get: (o) => ((o.meta.regions as string[] | undefined) ?? []).join(", ") },
    { label: "Capability Tags", get: (o) => tagList(o), render: (o) => tagChips(o) },
    { label: "Description", get: (_o, j) => str(j.description) },
  ],
  "cloud-zone": [
    { label: "Name", get: (o) => o.name },
    { label: "Account / Region", get: (o) => acctRegion(o) },
    { label: "Placement Policy", get: (_o, j) => str(j.placementPolicy) },
    { label: "Capability Tags", get: (o) => tagList(o), render: (o) => tagChips(o) },
    { label: "Compute Filter", get: (_o, j) => ((j.tagsToMatch as J[] | undefined) ?? []).map((t) => (t.value ? `${str(t.key)}:${str(t.value)}` : str(t.key))).join(", ") },
    { label: "Description", get: (_o, j) => str(j.description) },
  ],
  "network-profile": [
    { label: "Name", get: (o) => o.name },
    { label: "Account / Region", get: (o) => acctRegion(o) },
    { label: "Networks", get: (o) => String(((o.meta.fabricNetworkIds as string[] | undefined) ?? []).length) },
    { label: "Isolation", get: (_o, j) => str(j.isolationType) },
    { label: "Capability Tags", get: (o) => tagList(o), render: (o) => tagChips(o) },
    { label: "Description", get: (_o, j) => str(j.description) },
  ],
  "storage-profile": [
    { label: "Name", get: (o) => o.name },
    { label: "Account / Region", get: (o) => acctRegion(o) },
    { label: "Default", get: (_o, j) => (j.defaultItem ? "Yes" : "No") },
    { label: "Disk Properties", get: (_o, j) => Object.entries((j.diskProperties as J) ?? {}).map(([k, v]) => `${k}: ${str(v)}`).join(", ") },
    { label: "Capability Tags", get: (o) => tagList(o), render: (o) => tagChips(o) },
  ],
  tag: [
    { label: "Tag", get: (o) => o.name },
    { label: "Key", get: (o) => str(o.meta.key) },
    { label: "Value", get: (o) => str(o.meta.value) },
    { label: "Tagged On", get: (o) => String(o.in.filter((r) => r.rel === "has-tag").length) },
    { label: "Required By", get: (o) => String(o.in.filter((r) => r.rel === "needs-tag").length) },
  ],
  template: [
    { label: "Name", get: (o) => o.name },
    { label: "Status", get: (_o, j) => (j.status === "RELEASED" ? "Released" : j.status === "VERSIONED" ? "Versioned" : j.status ? "Draft" : ""), render: (_o, j) => statusChip(j.status === "RELEASED" ? "Released" : j.status === "VERSIONED" ? "Versioned" : j.status ? "Draft" : "") },
    { label: "Project", get: (o, j) => o.project || str(j.projectName) },
    { label: "Versions", get: (_o, j) => (j.totalVersions !== undefined ? `${str(j.totalVersions)} (${str(j.totalReleasedVersions ?? 0)} released)` : "") },
    { label: "Last Updated", get: (_o, j) => updated(j) },
    { label: "Updated By", get: (_o, j) => updatedBy(j) },
  ],
  "custom-resource": [
    { label: "Name", get: (o) => o.name },
    { label: "Resource Type", get: (_o, j) => str(j.resourceType) },
    { label: "Status", get: (_o, j) => str(j.status), render: (_o, j) => statusChip(str(j.status)) },
    { label: "Project", get: (o) => o.project ?? "" },
    { label: "Last Updated", get: (_o, j) => updated(j) },
  ],
  "resource-action": [
    { label: "Name", get: (o) => o.name },
    { label: "Resource Type", get: (_o, j) => str(j.resourceType) },
    { label: "Runnable", get: (o, j) => o.out.find((r) => r.rel === "runs")?.obj?.name ?? str((j.runnableItem as J)?.name ?? (j.runnableItem as J)?.id) },
    { label: "Status", get: (_o, j) => str(j.status), render: (_o, j) => statusChip(str(j.status)) },
    { label: "Project", get: (o) => o.project ?? "" },
  ],
  "property-group": [
    { label: "Name", get: (o) => o.name },
    { label: "Type", get: (_o, j) => (j.type === "INPUT" ? "Input" : j.type === "CONSTANT" ? "Constant" : str(j.type)) },
    { label: "Properties", get: (_o, j) => String(Object.keys((j.properties as J) ?? {}).length) },
    { label: "Project", get: (o) => o.project ?? "" },
    { label: "Description", get: (_o, j) => str(j.description) },
  ],
  "content-source": [
    { label: "Name", get: (o) => o.name },
    { label: "Type", get: (_o, j) => SOURCE_TYPES[str(j.typeId)] ?? str(j.typeId) },
    { label: "Project", get: (o) => o.project ?? "" },
    { label: "Items", get: (_o, j) => (j.itemsFound !== undefined ? `${str(j.itemsImported ?? 0)} of ${str(j.itemsFound)} imported` : "") },
    { label: "Last Import", get: (_o, j) => fmt(j.lastImportCompletedAt) },
    { label: "Last Updated", get: (_o, j) => updated(j) },
  ],
  "catalog-item": [
    { label: "Name", get: (o) => o.name },
    { label: "Type", get: (o, j) => str((j.type as J)?.name) || str(o.meta.typeName ?? o.meta.type) },
    { label: "Source", get: (o) => o.out.find((r) => r.rel === "from-source")?.obj?.name ?? "" },
    { label: "Projects", get: (o) => ((o.meta.projects as string[] | undefined)?.join(", ") || o.project) ?? "" },
    { label: "Custom Form", get: (o) => (o.meta.hasCustomForm ? "Yes" : "No") },
    { label: "Last Updated", get: (_o, j) => updated(j) },
  ],
  policy: [
    { label: "Name", get: (o) => o.name },
    { label: "Type", get: (_o, j) => policyTypeLabel(j.typeId) },
    { label: "Enforcement", get: (_o, j) => (j.enforcementType === "HARD" ? "Hard" : j.enforcementType === "SOFT" ? "Soft" : str(j.enforcementType)) },
    { label: "Scope", get: (o, j) => (j.projectId ? o.project || str(j.projectId) : "Organization") },
    { label: "Last Updated", get: (_o, j) => updated(j) },
    { label: "Updated By", get: (_o, j) => updatedBy(j) },
  ],
  subscription: [
    { label: "Name", get: (o) => o.name },
    { label: "Event Topic", get: (o, j) => str(o.meta.eventTopicId ?? j.eventTopicId) },
    { label: "Runnable", get: (o, j) => o.out.find((r) => r.rel === "runs")?.obj?.name ?? `${/vro/i.test(str(j.runnableType)) ? "vRO workflow " : ""}${str(j.runnableId)}` },
    { label: "Blocking", get: (_o, j) => (j.blocking ? "Yes" : "No") },
    { label: "Priority", get: (_o, j) => str(j.priority) },
    { label: "Status", get: (_o, j) => (j.disabled ? "Disabled" : "Enabled"), render: (_o, j) => statusChip(j.disabled ? "Disabled" : "Enabled") },
  ],
  "abx-action": [
    { label: "Name", get: (o) => o.name },
    { label: "Type", get: (_o, j) => (j.actionType === "FLOW" ? "Flow" : "Script") },
    { label: "Runtime", get: (_o, j) => str(j.runtime ?? j.runtimeName) + (j.runtimeVersion ? ` ${str(j.runtimeVersion)}` : "") },
    { label: "Project", get: (o) => o.project ?? "" },
    { label: "Provider", get: (_o, j) => str(j.provider) },
    { label: "Last Updated", get: (_o, j) => updated(j) },
  ],
};

function Grid({ cols, rows, empty }: { cols: { label: string }[]; rows: { key: string; cells: ReactNode[]; onClick?: () => void }[]; empty: string }) {
  return (
    <div className="vl-grid">
      <div className="vl-row vl-head" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
        {cols.map((c) => (
          <span key={c.label}>{c.label}</span>
        ))}
      </div>
      {rows.map((r) => (
        <div
          key={r.key}
          className={`vl-row${r.onClick ? " vl-click" : ""}`}
          style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}
          role={r.onClick ? "button" : undefined}
          tabIndex={r.onClick ? 0 : undefined}
          onClick={r.onClick}
          onKeyDown={(e) => r.onClick && e.key === "Enter" && r.onClick()}
        >
          {r.cells.map((c, i) => (
            <span key={i}>{c}</span>
          ))}
        </div>
      ))}
      {!rows.length && <div className="vl-empty">{empty}</div>}
      <div className="vl-foot">{rows.length ? `1 - ${rows.length} of ${rows.length} items` : "0 items"}</div>
    </div>
  );
}

function Head({ title, count, q, setQ, extra }: { title: string; count: number; q: string; setQ: (s: string) => void; extra?: ReactNode }) {
  return (
    <div className="vl-headbar">
      <h2 className="vc-title">
        {title} <span className="vc-count">{count}</span>
      </h2>
      <span className="vc-ro">Read-only</span>
      {extra}
      <div className="spacer" />
      <label className="vc-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" strokeLinecap="round" />
        </svg>
        <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
    </div>
  );
}

function ObjectList({ kind, title, ledger, onNav }: { kind: Kind; title: string; ledger: Ledger; onNav: (k: string) => void }) {
  const cols = COLS[kind] ?? [{ label: "Name", get: (o: LedgerObject) => o.name }];
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ i: number; dir: 1 | -1 }>({ i: 0, dir: 1 });
  const [ptype, setPtype] = useState("");
  const all = useMemo(() => ledger.objects.filter((o) => o.type === kind).map((o) => ({ o, j: (readJson(ledger, o.path) ?? {}) as J })), [ledger, kind]);
  const ptypes = kind === "policy" ? [...new Set(all.map((x) => policyTypeLabel(x.j.typeId)))].sort() : [];
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all
      .filter((x) => (!ptype || policyTypeLabel(x.j.typeId) === ptype) && (!s || cols.some((c) => c.get(x.o, x.j).toLowerCase().includes(s))))
      .sort((a, b) => cols[sort.i].get(a.o, a.j).localeCompare(cols[sort.i].get(b.o, b.j), undefined, { numeric: true }) * sort.dir);
  }, [all, q, sort, ptype, cols]);

  return (
    <div className="vl">
      <Head
        title={title}
        count={all.length}
        q={q}
        setQ={setQ}
        extra={
          ptypes.length > 1 ? (
            <label className="vc-filter">
              <select value={ptype} onChange={(e) => setPtype(e.target.value)} aria-label="Filter by policy type">
                <option value="">FILTER: ALL TYPES</option>
                {ptypes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          ) : undefined
        }
      />
      <div className="vl-grid">
        <div className="vl-row vl-head" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
          {cols.map((c, i) => (
            <button key={c.label} className="vl-sort" onClick={() => setSort({ i, dir: sort.i === i ? (-sort.dir as 1 | -1) : 1 })}>
              {c.label}
              {sort.i === i && <span aria-hidden>{sort.dir === 1 ? " ▲" : " ▼"}</span>}
            </button>
          ))}
        </div>
        {rows.map(({ o, j }) => (
          <div
            key={o.key}
            className="vl-row vl-click"
            style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}
            role="button"
            tabIndex={0}
            onClick={() => onNav(o.key)}
            onKeyDown={(e) => e.key === "Enter" && onNav(o.key)}
          >
            {cols.map((c, i) => (
              <span key={c.label} className={i === 0 ? "vl-name" : undefined} title={c.get(o, j)}>
                {i === 0 && kind === "catalog-item" && <ItemIcon o={o} l={ledger} size={18} />}
                {c.render ? c.render(o, j) : c.get(o, j)}
                {i === 0 && o.selectedBy === "dependency" && <span className="tag" title="Added to the export as a dependency">dep</span>}
              </span>
            ))}
          </div>
        ))}
        {!rows.length && <div className="vl-empty">{all.length ? "No items match." : `This export has no ${title.toLowerCase()}.`}</div>}
        <div className="vl-foot">{rows.length ? `1 - ${rows.length} of ${rows.length} items` : "0 items"}</div>
      </div>
    </div>
  );
}

function EventTopics({ ledger, onNav }: { ledger: Ledger; onNav: (k: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const subs = ledger.objects.filter((o) => o.type === "subscription");
  const topics = [...ledger.topics.values()].filter((t) => {
    const s = q.trim().toLowerCase();
    return !s || str(t.name).toLowerCase().includes(s) || str(t.id).toLowerCase().includes(s);
  });
  return (
    <div className="vl">
      <Head title="Event Topics" count={ledger.topics.size} q={q} setQ={setQ} />
      <p className="vl-note">Only the topics used by subscriptions in this export are captured. Click a row for its payload schema.</p>
      <div className="vl-grid">
        <div className="vl-row vl-head" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          <span>Name</span>
          <span>Topic ID</span>
          <span>Blockable</span>
          <span>Subscriptions</span>
        </div>
        {topics.map((t) => {
          const id = str(t.id);
          const using = subs.filter((s) => str(s.meta.eventTopicId) === id);
          return (
            <div key={id}>
              <div className="vl-row vl-click" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }} onClick={() => setOpen(open === id ? null : id)} role="button" tabIndex={0} aria-expanded={open === id}>
                <span className="vl-name">
                  <span className="vl-caret">{open === id ? "▾" : "▸"}</span> {str(t.name) || id}
                </span>
                <span>
                  <code>{id}</code>
                </span>
                <span>{t.blockable ? "Yes" : "No"}</span>
                <span className="vl-chips">
                  {using.map((s) => (
                    <button
                      key={s.key}
                      className="vx-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNav(s.key);
                      }}
                    >
                      {s.name}
                    </button>
                  ))}
                </span>
              </div>
              {open === id && (
                <div className="vl-expand">
                  {str(t.description) && <p>{str(t.description)}</p>}
                  <pre>{JSON.stringify(t.schema ?? t, null, 2)}</pre>
                </div>
              )}
            </div>
          );
        })}
        {!topics.length && <div className="vl-empty">No event topics in this export.</div>}
        <div className="vl-foot">{topics.length} items</div>
      </div>
    </div>
  );
}

function VroWorkflows({ ledger, onNav, title }: { ledger: Ledger; onNav: (k: string) => void; title: string }) {
  const [q, setQ] = useState("");
  const map = new Map<string, { id: string; uses: { o: LedgerObject; rel: string }[] }>();
  for (const o of ledger.objects)
    for (const r of o.out)
      if (!r.obj && r.key.startsWith("vro-workflow|")) {
        const id = r.key.slice("vro-workflow|".length);
        if (!map.has(id)) map.set(id, { id, uses: [] });
        map.get(id)!.uses.push({ o, rel: r.rel });
      }
  const rows = [...map.values()].filter((w) => !q || w.id.includes(q) || w.uses.some((u) => u.o.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="vl">
      <Head title={title} count={map.size} q={q} setQ={setQ} />
      <p className="vl-note">vRO workflows that objects in this export run. Their code isn't in the VCFA export: open the matching vRO package in vRO Peekage to see them.</p>
      <Grid
        cols={[{ label: "Workflow ID" }, { label: "Used By" }, { label: "As" }]}
        rows={rows.map((w) => ({
          key: w.id,
          cells: [
            <code key="id">{w.id}</code>,
            <span key="u" className="vl-chips">
              {w.uses.map((u, i) => (
                <button key={i} className="vx-link" onClick={() => onNav(u.o.key)}>
                  {u.o.name}
                </button>
              ))}
            </span>,
            <span key="r">{[...new Set(w.uses.map((u) => relLabel(u.rel, "out")))].join(", ")}</span>,
          ],
        }))}
        empty="No vRO workflows are referenced in this export."
      />
    </div>
  );
}

/** Image / flavor mappings: one row per mapping name per region, like VCFA. */
function MappingList({ kind, title, ledger, onNav }: { kind: "image-profile" | "flavor-profile"; title: string; ledger: Ledger; onNav: (k: string) => void }) {
  const [q, setQ] = useState("");
  const prop = kind === "image-profile" ? "imageMappings" : "flavorMappings";
  const rows = useMemo(() => {
    const out: { key: string; o: LedgerObject; name: string; value: string; detail: string }[] = [];
    for (const o of ledger.objects.filter((x) => x.type === kind)) {
      const j = (readJson(ledger, o.path) ?? {}) as J;
      const mapping = (((j[prop] as J)?.mapping as Record<string, J>) ?? {}) as Record<string, J>;
      for (const [name, m] of Object.entries(mapping)) {
        const value =
          kind === "image-profile"
            ? str(m.name ?? m.externalId ?? m.id)
            : m.cpuCount !== undefined
              ? `${str(m.cpuCount)} vCPU, ${m.memoryInMB !== undefined ? `${Math.round(Number(m.memoryInMB) / 1024 * 10) / 10} GB` : "?"} memory`
              : str(m.name ?? m.id);
        const detail = kind === "image-profile" ? [str(m.osFamily), m.cloudConfig ? "cloud config" : "", (m.constraints as J[] | undefined)?.length ? "constraints" : ""].filter(Boolean).join(" · ") : str(m.name ?? "");
        out.push({ key: `${o.key}|${name}`, o, name, value, detail });
      }
    }
    const s = q.trim().toLowerCase();
    return out
      .filter((r) => !s || r.name.toLowerCase().includes(s) || r.value.toLowerCase().includes(s) || acctRegion(r.o).toLowerCase().includes(s))
      .sort((a, b) => a.name.localeCompare(b.name) || acctRegion(a.o).localeCompare(acctRegion(b.o)));
  }, [ledger, kind, prop, q]);
  const names = new Set(rows.map((r) => r.name));
  return (
    <div className="vl">
      <Head title={title} count={names.size} q={q} setQ={setQ} />
      <Grid
        cols={[{ label: kind === "image-profile" ? "Image Mapping" : "Flavor Mapping" }, { label: "Account / Region" }, { label: kind === "image-profile" ? "Image" : "Value" }, { label: kind === "image-profile" ? "Details" : "Instance Type" }, { label: "Profile" }]}
        rows={rows.map((r) => ({
          key: r.key,
          onClick: () => onNav(r.o.key),
          cells: [<span key="n" className="vl-name">{r.name}</span>, acctRegion(r.o), r.value, r.detail, r.o.name],
        }))}
        empty={`This export has no ${title.toLowerCase()}.`}
      />
    </div>
  );
}

export function ListPage({ page, ledger, onNav }: { page: PageId; ledger: Ledger; onNav: (k: string) => void }) {
  const { item } = pageInfo(page);
  if (page === "image-mappings") return <MappingList kind="image-profile" title="Image Mappings" ledger={ledger} onNav={onNav} />;
  if (page === "flavor-mappings") return <MappingList kind="flavor-profile" title="Flavor Mappings" ledger={ledger} onNav={onNav} />;
  if (page === "event-topics") return <EventTopics ledger={ledger} onNav={onNav} />;
  if (page === "workflows" || page === "orch-workflows") return <VroWorkflows ledger={ledger} onNav={onNav} title="Workflows" />;
  if (!item.kind) return null;
  return <ObjectList key={page} kind={item.kind} title={item.label === "Definitions" ? "Policy Definitions" : item.label} ledger={ledger} onNav={onNav} />;
}

/** Counts for the left nav badges. */
export function pageCount(page: PageId, ledger: Ledger): number | undefined {
  if (page === "event-topics") return ledger.topics.size;
  if (page === "workflows" || page === "orch-workflows") {
    const s = new Set<string>();
    for (const o of ledger.objects) for (const r of o.out) if (!r.obj && r.key.startsWith("vro-workflow|")) s.add(r.key);
    return s.size;
  }
  const k = pageInfo(page).item.kind;
  return k ? ledger.objects.filter((o) => o.type === k).length : undefined;
}
