/**
 * Documentation model for "Export documentation".
 *
 * The package is turned into one list of plain blocks (headings, key/value lists, tables, code, diagrams).
 * The HTML report, the Markdown report and the Word document are all rendered from this same list,
 * so the three never disagree.
 */
import { GX, GY, H, PAD, W, clip, layout } from "../components/ChainDiagram";
import { SECTIONS } from "./sections";
import { component, kindLabel, langFor, policyTypeLabel, readJson, relLabel, solutions, vroStatus, type Kind, type Ledger, type LedgerObject } from "./ledger";

type J = Record<string, unknown>;

export type Block =
  | { t: "h"; level: 1 | 2 | 3 | 4; text: string; id?: string }
  | { t: "p"; text: string; muted?: boolean }
  | { t: "kv"; rows: [string, string][] }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "list"; items: string[] }
  /** detail: shown collapsed in the HTML report; the Word and Markdown reports point to the file in sources/ instead */
  | { t: "code"; lang: string; title?: string; code: string; detail?: boolean; file?: string }
  | { t: "diagram"; title: string; file: string; svg: string; width: number; height: number };

export interface ReportDoc {
  title: string;
  subtitle: string;
  blocks: Block[];
  /** contents table entries: [id, text, level] */
  toc: [string, string, number][];
}

const s = (v: unknown): string => (v === undefined || v === null || v === "" ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
const pretty = (v: unknown) => JSON.stringify(v, null, 2);
const yes = (v: unknown) => (v === true ? "Yes" : v === false ? "No" : s(v));

export function safeName(n: string) {
  return n.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "unnamed";
}

// ---------------------------------------------------------------- redaction

const USER_KEY = /^(createdBy|updatedBy|lastUpdatedBy|modifiedBy|lastModifiedBy|owner|ownedBy|ownerName|userName|username|user|email|requestedBy|requester|author|exportedBy|createdByUser|updatedByUser)$/i;
const HOST_KEY = /^(hostName|hostname|host|fqdn|address|endpoint|url|vcenterHostName|nsxHostName|managerHostName|serverName|server|dcId)$/i;
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Builds a function that replaces host names and user names with placeholders.
 * Hosts: the VCF Automation FQDN, every host-like field in the exported JSON (hostName, address, url…), and any name in the same DNS domain
 * (the domain itself, e.g. a DNS search domain in a template, becomes redacted.example).
 * Users: createdBy / updatedBy / owner and similar fields, user principals in policies, e-mail addresses, and the exporting user.
 * The same value always gets the same placeholder, so the documentation still reads correctly.
 */
export function makeRedactor(l: Ledger, on: boolean): (text: string) => string {
  if (!on) return (t) => t;
  const hosts = new Map<string, string>();
  const users = new Map<string, string>();
  const fqdn = s(l.manifest.source.fqdn).toLowerCase();
  if (fqdn) hosts.set(fqdn, "vcfa.redacted.example");
  const addHost = (v: string) => {
    const m = /^[a-z][a-z0-9+.-]*:\/\/([^/\s:?#]+)/i.exec(v);
    const h = (m ? m[1] : v).trim().toLowerCase();
    if (!h || /\s/.test(h) || h.length < 3 || !/[.]/.test(h) && !/^[a-z0-9-]+$/.test(h)) return;
    if (!hosts.has(h)) hosts.set(h, `host-${hosts.size + (fqdn ? 0 : 1)}.redacted.example`);
  };
  const addUser = (v: string) => {
    const u = v.trim();
    if (!u || u.length < 2 || /\s{2,}/.test(u) || users.has(u.toLowerCase())) return;
    users.set(u.toLowerCase(), u.includes("@") ? `user-${users.size + 1}@redacted.example` : `user-${users.size + 1}`);
  };
  if (l.manifest.exportedBy) addUser(String(l.manifest.exportedBy));
  const walk = (v: unknown, key = "") => {
    if (Array.isArray(v)) return v.forEach((x) => walk(x, key));
    if (v && typeof v === "object") {
      const o = v as J;
      if (/^user$/i.test(s(o.type)) && typeof o.referenceId === "string") addUser(o.referenceId);
      if (/^user$/i.test(s(o.type)) && typeof o.name === "string") addUser(o.name);
      for (const [k, x] of Object.entries(o)) walk(x, k);
      return;
    }
    if (typeof v !== "string" || !v) return;
    if (USER_KEY.test(key)) addUser(v);
    else if (HOST_KEY.test(key) && !/^\//.test(v)) addHost(v);
  };
  for (const [path, text] of l.files) {
    if (!/\.json$/i.test(path)) continue;
    try {
      walk(JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text));
    } catch {
      /* not JSON */
    }
  }
  // any other name in the VCF Automation DNS domain (vcenter.corp.local next to vcfa.corp.local)
  const labels = fqdn.split(".");
  const domain = labels.length >= 3 ? labels.slice(1).join(".") : "";
  const literals = [...hosts.keys()].sort((a, b) => b.length - a.length);
  const hostRe = literals.length ? new RegExp(`(?<![\\w-])(?:${literals.map(esc).join("|")})(?![\\w-])`, "gi") : null;
  const domainRe = domain ? new RegExp(`(?<![\\w.-])(?:[a-z0-9-]+\\.)*${esc(domain)}(?![\\w-])`, "gi") : null;
  const userLits = [...users.keys()].sort((a, b) => b.length - a.length);
  const userRe = userLits.length ? new RegExp(`(?<![\\w.@-])(?:${userLits.map(esc).join("|")})(?![\\w@-])`, "gi") : null;
  const emailRe = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
  return (text: string) => {
    if (!text) return text;
    let t = text;
    if (userRe) t = t.replace(userRe, (m) => users.get(m.toLowerCase()) ?? m);
    t = t.replace(emailRe, (m) => {
      if (m.endsWith("@redacted.example")) return m;
      addUser(m);
      return users.get(m.toLowerCase())!;
    });
    if (hostRe) t = t.replace(hostRe, (m) => hosts.get(m.toLowerCase()) ?? m);
    if (domainRe)
      t = t.replace(domainRe, (m) => {
        const k = m.toLowerCase();
        if (k.endsWith(".redacted.example")) return m;
        if (k === domain) return "redacted.example";
        if (!hosts.has(k)) hosts.set(k, `host-${hosts.size}.redacted.example`);
        return hosts.get(k)!;
      });
    return t;
  };
}

// ---------------------------------------------------------------- diagrams

const BAR: Record<string, string> = {
  template: "#2563eb",
  "catalog-item": "#0e7490",
  "content-source": "#667085",
  policy: "#b45309",
  subscription: "#db2777",
  "abx-action": "#7c3aed",
  "property-group": "#15803d",
  "custom-resource": "#4f46e5",
  "resource-action": "#0369a1",
  "vro-workflow": "#0079ad",
  "image-profile": "#0e7490",
  "flavor-profile": "#0e7490",
};
const xml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Stand-alone SVG (fixed colours, no CSS) of everything linked to `start`, as drawn on the object pages. */
export function diagramSvg(start: LedgerObject, l: Ledger, red: (t: string) => string) {
  const { nodes, edges, width, height } = layout(start);
  const pos = new Map(nodes.map((n) => [n.key, { x: PAD + n.layer * (W + GX), y: PAD + n.row * (H + GY) }]));
  const name = (n: (typeof nodes)[number]) => {
    if (n.obj) return n.obj.name;
    const id = n.key.split("|")[1] ?? n.key;
    const wf = l.byKey.get(`vro-workflow|${id}`);
    return wf?.name ?? n.name;
  };
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Clarity City, Segoe UI, Helvetica, Arial, sans-serif">`,
    `<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#8a94a6"/></marker></defs>`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
  );
  for (const e of edges) {
    const a = pos.get(e.from)!;
    const b = pos.get(e.to)!;
    const x1 = a.x + W;
    const y1 = a.y + H / 2;
    const x2 = b.x - 2;
    const y2 = b.y + H / 2;
    const d =
      x2 <= x1
        ? `M${a.x + W / 2} ${a.y + H} C ${a.x + W / 2} ${a.y + H + 30}, ${b.x + W / 2} ${b.y + H + 30}, ${b.x + W / 2} ${b.y + H + 2}`
        : `M${x1} ${y1} C ${x1 + GX / 2} ${y1}, ${x2 - GX / 2} ${y2}, ${x2} ${y2}`;
    parts.push(`<path d="${d}" fill="none" stroke="#8a94a6" stroke-width="1.5" marker-end="url(#ah)"><title>${xml(relLabel(e.rel, "out"))}</title></path>`);
  }
  for (const n of nodes) {
    const p = pos.get(n.key)!;
    const sel = n.key === start.key;
    const ext = !n.obj;
    parts.push(
      `<g transform="translate(${p.x} ${p.y})">`,
      `<rect width="${W}" height="${H}" rx="8" fill="${sel ? "#eef4ff" : "#ffffff"}" stroke="${sel ? "#2563eb" : "#c9d0db"}" stroke-width="${sel ? 2 : 1}"${ext ? ' stroke-dasharray="4 3"' : ""}/>`,
      `<rect width="5" height="${H}" rx="2" fill="${BAR[n.kind] ?? "#667085"}"/>`,
      `<text x="14" y="20" font-size="11" fill="#5b6475">${xml(ext ? "vRO workflow" : kindLabel(n.kind))}</text>`,
      `<text x="14" y="40" font-size="13" font-weight="600" fill="#1b2230">${xml(red(clip(name(n), 28)))}</text>`,
      `</g>`,
    );
  }
  parts.push("</svg>");
  return { svg: parts.join(""), width, height };
}

// ---------------------------------------------------------------- per object

function tagNames(v: unknown): string {
  if (!Array.isArray(v)) return "";
  return v.map((t) => (t && typeof t === "object" ? `${s((t as J).key)}${s((t as J).value) ? ":" + s((t as J).value) : ""}` : s(t))).join(", ");
}

/** Top-level primitive fields, as on the "Details" cards. */
function details(j: J | null, skip: string[] = []): [string, string][] {
  if (!j) return [];
  return Object.entries(j)
    .filter(([k, v]) => !skip.includes(k) && v !== null && v !== "" && typeof v !== "object")
    .map(([k, v]) => [k, String(v)]);
}

function inputsTable(props: [string, J][]): Block {
  return {
    t: "table",
    head: ["Name", "Type", "Title", "Default", "Description"],
    rows: props.map(([k, p]) => [k, `${s(p.type)}${p.encrypted ? " (secret)" : ""}`, s(p.title), s(p.default ?? p.const), s(p.description)]),
  };
}

function formFields(form: J, schema: J): Block | null {
  const pages = ((form.layout as J | undefined)?.pages as J[] | undefined) ?? [];
  const sch = (form.schema as J | undefined) ?? {};
  const rows: string[][] = [];
  for (const p of pages)
    for (const sec of (p.sections as J[] | undefined) ?? [])
      for (const f of (sec.fields as J[] | undefined) ?? []) {
        const id = s(f.id);
        const sc = (sch[id] as J | undefined) ?? {};
        const state = { ...((sc.state as J) ?? {}), ...((f.state as J) ?? {}) };
        const dt = s((sc.type as J | undefined)?.dataType);
        const vis = state.visible;
        const notes = [
          vis === false ? "hidden" : vis && typeof vis === "object" ? "visible when…" : "",
          state["read-only"] === true || state.readOnly === true ? "read-only" : "",
          (sc.constraints as J | undefined)?.required === true ? "required" : "",
          sc.valueList || (sc.default as J | undefined)?.id ? "external values" : "",
        ].filter(Boolean);
        const def = sc.default;
        rows.push([s(p.title) || "General", id, s(sc.label) || s((schema[id] as J | undefined)?.title), s(f.display), dt, typeof def === "object" ? s((def as J)?.id ?? def) : s(def), notes.join(", ")]);
      }
  return rows.length ? { t: "table", head: ["Page", "Field", "Label", "Display", "Data type", "Default", "Notes"], rows } : null;
}

function objectBlocks(o: LedgerObject, l: Ledger): Block[] {
  const b: Block[] = [];
  const j = readJson(l, o.path);
  const head: [string, string][] = [["Type", o.type === "policy" ? `${policyTypeLabel(o.meta.typeId)} policy` : kindLabel(o.type)]];
  if (o.project) head.push(["Project", o.project]);
  if (o.folder.length && o.folder[0] !== o.project) head.push(["Folder", o.folder.join(" / ")]);
  head.push(["ID", o.id]);
  if (o.selectedBy === "dependency") head.push(["In the export", "Added as a dependency of a selected object"]);
  const desc = s(j?.description);
  if (desc) b.push({ t: "p", text: desc });
  b.push({ t: "kv", rows: head });

  const m = o.meta;
  switch (o.type) {
    case "template": {
      const dir = o.path.replace(/\/template\.json$/, "");
      const versions = (m.versions as { version: string; status?: string; released?: boolean }[] | undefined) ?? [];
      const rows = details(j, ["selfLink", "orgId", "content", "description"]);
      if (rows.length) b.push({ t: "h", level: 4, text: "Details" }, { t: "kv", rows });
      if (versions.length) {
        b.push({ t: "h", level: 4, text: "Versions" });
        b.push({
          t: "table",
          head: ["Version", "Status", "Released", "Description", "Change log"],
          rows: versions.map((v) => {
            const vj = readJson(l, `${dir}/versions/${safeName(v.version)}.json`);
            return [v.version, s(v.status), v.released ? "Yes" : "No", s(vj?.versionDescription), s(vj?.versionChangeLog)];
          }),
        });
      }
      const yaml = l.files.get(`${dir}/content.yaml`);
      if (yaml) b.push({ t: "h", level: 4, text: "Template YAML (current draft)" }, { t: "code", lang: "yaml", title: "content.yaml", code: yaml, file: `${dir}/content.yaml` });
      for (const v of versions) {
        const f = `${dir}/versions/${safeName(v.version)}.yaml`;
        const vy = l.files.get(f);
        if (vy && vy !== yaml) b.push({ t: "code", lang: "yaml", title: `Version ${v.version}${v.released ? " (released)" : ""}`, code: vy, detail: true, file: f });
      }
      break;
    }
    case "catalog-item": {
      const formPath = o.files.find((f) => f.endsWith(".form.json"));
      const form = readJson(l, formPath);
      let formDef: unknown = null;
      if (form && typeof form.form === "string") {
        try {
          formDef = JSON.parse(form.form);
        } catch {
          formDef = form.form;
        }
      }
      const projects = (m.projects as string[] | undefined)?.length ? (m.projects as string[]) : o.project ? [o.project] : [];
      b.push({
        t: "kv",
        rows: [
          ["Item type", s((j?.type as J | undefined)?.name) || s(m.type)],
          ["Shared with projects", projects.join(", ") || "—"],
          ["Request limit", s(j?.bulkRequestLimit) || "—"],
          ["Custom form", form ? `Yes${form.status ? ` (${s(form.status)})` : ""}` : "No"],
          ["Source object", s(j?.externalId) || "—"],
        ],
      });
      const schema = (j?.schema as { properties?: Record<string, J> } | undefined)?.properties ?? {};
      const props = Object.entries(schema);
      if (props.length) b.push({ t: "h", level: 4, text: `Request inputs (${props.length})` }, inputsTable(props));
      if (formDef && typeof formDef === "object") {
        const ff = formFields(formDef as J, schema);
        if (ff) b.push({ t: "h", level: 4, text: "Custom form fields" }, ff);
      }
      if (form) b.push({ t: "code", lang: "json", title: "Custom form definition", code: typeof formDef === "string" ? formDef : pretty(formDef ?? form), detail: true, file: formPath });
      break;
    }
    case "policy": {
      b.push({
        t: "kv",
        rows: [
          ["Policy type", policyTypeLabel(j?.typeId)],
          ["Enforcement", s(j?.enforcementType) || "—"],
          ["Scope", o.project ? `Project ${o.project}` : j?.projectId ? `Project ${s(j.projectId)}` : "Organization"],
        ],
      });
      const def = (j?.definition as J | undefined) ?? {};
      if (j?.typeId === "com.vmware.policy.catalog.entitlement") {
        const rows: string[][] = [];
        for (const g of (def.entitledUsers as J[] | undefined) ?? []) {
          const who = ((g.principals as J[] | undefined) ?? []).map((p) => (s(p.type) === "PROJECT" && !s(p.referenceId) ? "All users in the project" : `${s(p.type).toLowerCase()}: ${s(p.referenceId)}`)).join("; ");
          for (const it of (g.items as J[] | undefined) ?? []) {
            const id = s(it.id);
            const isSrc = /source/i.test(s(it.type));
            const target = l.byKey.get(`${isSrc ? "content-source" : "catalog-item"}|${id}`);
            rows.push([s(g.userType) || "USER", who || "—", isSrc ? "Content source" : "Catalog item", target?.name ?? id]);
          }
        }
        if (rows.length) b.push({ t: "h", level: 4, text: "Shared content" }, { t: "table", head: ["User type", "Principals", "Content type", "Content"], rows });
      }
      if (j?.criteria != null) b.push({ t: "h", level: 4, text: "Criteria" }, { t: "code", lang: "json", code: pretty(j.criteria) });
      if (j?.definition != null) b.push({ t: "h", level: 4, text: "Definition" }, { t: "code", lang: "json", code: pretty(j.definition) });
      break;
    }
    case "subscription": {
      const topicId = s(m.eventTopicId);
      const topic = l.topics.get(topicId);
      const run = o.out.find((r) => r.rel === "runs");
      const rec = o.out.find((r) => r.rel === "recovers-with");
      const runName = (id: string, ref?: typeof run) => {
        if (ref?.obj) return `${ref.obj.name}${ref.obj.meta.path ? ` (${s(ref.obj.meta.path)})` : ""}`;
        if (!id) return "—";
        return vroStatus(l, id) === "NOT_FOUND" ? `${id} (not found in Orchestrator)` : id;
      };
      b.push({
        t: "kv",
        rows: [
          ["Status", m.disabled ? "Disabled" : "Enabled"],
          ["Event topic", `${s(topic?.name) || topicId}${topic?.name ? ` (${topicId})` : ""}`],
          ["Condition", s(m.criteria) || "None: runs for every event"],
          ["Runnable type", /vro/i.test(s(m.runnableType)) ? "vRO workflow" : s(m.runnableType) ? "ABX action" : "—"],
          ["Runnable", runName(s(m.runnableId), run)],
          ["Recover runnable", runName(s(m.recoverRunnableId), rec)],
          ["Blocking", yes(m.blocking)],
          ["Priority", s(m.priority) || "—"],
          ["Timeout", s(m.timeout) ? `${s(m.timeout)} min` : "—"],
          ["Projects", (m.projects as string[] | undefined)?.join(", ") || "Any"],
        ],
      });
      const rows = details(j, ["criteria", "orgId", "description", "name", "id"]);
      if (rows.length) b.push({ t: "h", level: 4, text: "Details" }, { t: "kv", rows });
      break;
    }
    case "abx-action": {
      const isFlow = s(j?.actionType) === "FLOW";
      b.push({
        t: "kv",
        rows: [
          [isFlow ? "Type" : "Runtime", isFlow ? "Action flow" : `${s(j?.runtime ?? j?.runtimeName) || "—"}${s(j?.runtimeVersion) ? ` ${s(j?.runtimeVersion)}` : ""}`],
          ...(isFlow ? [] : ([["Entry point", s(j?.entrypoint) || "—"]] as [string, string][])),
          ["Memory", s(j?.memoryInMB) ? `${s(j?.memoryInMB)} MB` : "—"],
          ["Timeout", s(j?.timeoutSeconds) ? `${s(j?.timeoutSeconds)} s` : "—"],
          ["Provider", s(j?.provider) || "—"],
        ],
      });
      const inputs = Object.entries((j?.inputs as J) ?? {});
      if (inputs.length) b.push({ t: "h", level: 4, text: "Default inputs" }, { t: "table", head: ["Input", "Default value"], rows: inputs.map(([k, v]) => [k, s(v)]) });
      const src = o.files.find((f) => /\/source\.[a-z0-9]+$/.test(f));
      const code = src ? l.files.get(src) : "";
      if (code) b.push({ t: "h", level: 4, text: isFlow ? "Flow" : "Source" }, { t: "code", lang: langFor(src!), title: src!.split("/").pop(), code, file: src });
      if (s(j?.dependencies)) b.push({ t: "h", level: 4, text: "Dependencies" }, { t: "code", lang: "plaintext", code: s(j?.dependencies) });
      break;
    }
    case "property-group": {
      const props = Object.entries((j?.properties as Record<string, J>) ?? {});
      b.push({ t: "kv", rows: [["Group type", s(j?.type) || "—"], ["Used in templates as", `\${propertyGroups.${o.name}.<property>}`]] });
      if (props.length) b.push({ t: "h", level: 4, text: `Properties (${props.length})` }, inputsTable(props));
      break;
    }
    case "vro-workflow": {
      b.push({ t: "kv", rows: [["Folder", s(j?.path) || "—"], ["Version", s(j?.version) || "—"]] });
      const io = (v: unknown) => ((v as J[] | undefined) ?? []).map((p) => [s(p.name), s(p.type), s(p.description)]);
      const ins = io(j?.inputs);
      const outs = io(j?.outputs);
      if (ins.length) b.push({ t: "h", level: 4, text: "Inputs" }, { t: "table", head: ["Name", "Type", "Description"], rows: ins });
      if (outs.length) b.push({ t: "h", level: 4, text: "Outputs" }, { t: "table", head: ["Name", "Type", "Description"], rows: outs });
      const steps = ((j?.steps as J[] | undefined) ?? []).map((st, i) => [String(i + 1), s(st.displayName) || s(st.name), s(st.type), s(st.description)]);
      if (steps.length) b.push({ t: "h", level: 4, text: "Steps" }, { t: "table", head: ["#", "Step", "Type", "Description"], rows: steps });
      b.push({ t: "p", text: "Summary only. The scripts and full workflow belong in the vRO package.", muted: true });
      break;
    }
    case "cloud-zone":
    case "image-profile":
    case "flavor-profile":
    case "network-profile":
    case "storage-profile": {
      const rows: [string, string][] = [["Cloud account", `${s(m.cloudAccountName) || s(m.cloudAccountId) || "—"}${s(m.cloudAccountType) ? ` (${s(m.cloudAccountType)})` : ""}`], ["Region", s(m.regionName) || s(m.externalRegionId) || s(m.regionId) || "—"]];
      if (o.type === "cloud-zone") rows.push(["Placement policy", s(j?.placementPolicy) || "—"], ["Folder", s(j?.folder) || "—"], ["Capability tags", tagNames(j?.tags) || "—"], ["Compute tags to match", tagNames(j?.tagsToMatch) || "—"]);
      if (o.type === "network-profile") rows.push(["Isolation", s(j?.isolationType) || "—"], ["Capability tags", tagNames(j?.tags) || "—"]);
      if (o.type === "storage-profile") {
        rows.push(["Default", yes(j?.defaultItem)], ["Supports encryption", yes(j?.supportsEncryption)], ["Capability tags", tagNames(j?.tags) || "—"]);
        for (const [k, v] of Object.entries({ ...((j?.diskProperties as J) ?? {}), ...((j?.diskTargetProperties as J) ?? {}) })) rows.push([k, s(v)]);
      }
      b.push({ t: "kv", rows });
      if (o.type === "image-profile") {
        const map = Object.entries(((j?.imageMappings as J | undefined)?.mapping as Record<string, J>) ?? {});
        if (map.length)
          b.push({ t: "h", level: 4, text: "Image mappings" }, { t: "table", head: ["Name", "Image", "OS family", "Constraints", "Cloud config"], rows: map.map(([k, v]) => [k, s(v.name) || s(v.id), s(v.osFamily), Array.isArray(v.constraints) && v.constraints.length ? s(v.constraints) : "", s(v.cloudConfig) ? "Yes" : ""]) });
      }
      if (o.type === "flavor-profile") {
        const map = Object.entries(((j?.flavorMappings as J | undefined)?.mapping as Record<string, J>) ?? {});
        if (map.length) b.push({ t: "h", level: 4, text: "Flavor mappings" }, { t: "table", head: ["Name", "CPU", "Memory (MB)", "Other"], rows: map.map(([k, v]) => [k, s(v.cpuCount), s(v.memoryInMB), Object.entries(v).filter(([x]) => x !== "cpuCount" && x !== "memoryInMB").map(([x, y]) => `${x}: ${s(y)}`).join(", ")]) });
      }
      if (o.type === "network-profile") {
        const ids = (m.fabricNetworkIds as string[] | undefined) ?? [];
        const nets = ids.map((id) => l.infra.fabricNetworks.find((n) => s(n.id) === id) ?? { id });
        const ranges = (id: string) => l.infra.ipRanges.filter((r) => s(r.fabricNetworkId) === id || s(((r._links as J)?.["fabric-network"] as J)?.href).endsWith(`/${id}`));
        if (nets.length)
          b.push(
            { t: "h", level: 4, text: "Networks" },
            { t: "table", head: ["Network", "CIDR", "Tags", "IP ranges"], rows: nets.map((n) => [s(n.name) || s(n.id), s(n.cidr), tagNames(n.tags), ranges(s(n.id)).map((r) => `${s(r.name)} ${s(r.startIPAddress)} – ${s(r.endIPAddress)}`).join("; ")]) },
          );
      }
      break;
    }
    case "cloud-account":
      b.push({ t: "kv", rows: [["Account type", s(m.cloudAccountType) || "—"], ["Regions", (m.regions as string[] | undefined)?.join(", ") || "—"], ["Capability tags", (m.tags as string[] | undefined)?.join(", ") || "—"]] });
      break;
    case "tag":
      b.push({ t: "kv", rows: [["Key", s(m.key)], ["Value", s(m.value) || "—"]] });
      break;
  }
  if (["custom-resource", "resource-action", "content-source", "cloud-account", "cloud-zone", "image-profile", "flavor-profile", "network-profile", "storage-profile"].includes(o.type)) {
    const rows = details(j, ["orgId", "description", "name", "id"]);
    if (rows.length) b.push({ t: "h", level: 4, text: "Details" }, { t: "kv", rows });
  }

  const links = [...o.out.map((r) => ["Uses", r] as const), ...o.in.map((r) => ["Used by", r] as const)];
  if (links.length) {
    b.push({ t: "h", level: 4, text: "Links" });
    b.push({
      t: "table",
      head: ["Direction", "Relation", "Object"],
      rows: links.map(([dir, r]) => {
        const label = relLabel(r.rel, dir === "Uses" ? "out" : "in");
        if (r.obj) return [dir, label, `${kindLabel(r.obj.type)}: ${r.obj.name}`];
        const id = r.key.split("|")[1] ?? r.key;
        return [dir, label, `vRO workflow ${id}${vroStatus(l, id) === "NOT_FOUND" ? " (not found)" : ""}`];
      }),
    });
  }
  b.push({ t: "code", lang: "json", title: `Raw JSON (${o.path.split("/").pop()})`, code: l.files.get(o.path) ?? "", detail: true, file: o.path });
  return b;
}

// ---------------------------------------------------------------- whole document

export function buildReport(l: Ledger, red: (t: string) => string): ReportDoc {
  const src = l.manifest.source;
  const org = src.organization || l.fileName;
  const blocks: Block[] = [];
  const toc: [string, string, number][] = [];
  let n = 0;
  const h = (level: 1 | 2 | 3 | 4, text: string) => {
    const id = `s${++n}`;
    blocks.push({ t: "h", level, text, id });
    if (level <= 3) toc.push([id, text, level]);
  };

  h(1, "Package");
  blocks.push({
    t: "kv",
    rows: [
      ["Organization", org],
      ["Product", `${src.product ?? "VCF Automation"}${src.orgType ? ` · ${src.orgType}` : ""}`],
      ["VCF Automation", src.fqdn ?? "—"],
      ["Exported", l.manifest.exportedAt ? l.manifest.exportedAt.replace("T", " ").replace(/Z$/, " UTC") : "—"],
      ["Exported by", l.manifest.exportedBy ?? "—"],
      ["Selection", l.manifest.selection ?? "all"],
      ["Collector", `${l.manifest.tool?.name ?? "VCFA Ledger Collector"} ${l.manifest.tool?.version ?? ""}`.trim()],
      ["Package file", l.fileName],
    ],
  });
  const counts = new Map<string, number>();
  for (const o of l.objects) counts.set(o.type, (counts.get(o.type) ?? 0) + 1);
  blocks.push({ t: "h", level: 4, text: "Contents" });
  blocks.push({
    t: "table",
    head: ["Object type", "Count"],
    rows: [...counts.entries()].map(([k, c]) => [KIND_PLURAL(k), String(c)]),
  });
  if (l.projects.length) {
    blocks.push({ t: "h", level: 4, text: "Projects" });
    blocks.push({ t: "table", head: ["Project", "Description"], rows: l.projects.map((p) => [p.name, p.description ?? ""]) });
  }

  // Solutions: groups of linked objects, each with its diagram
  const sols = solutions(l);
  if (sols.length) {
    h(1, "Solutions");
    blocks.push({ t: "p", text: "Objects that are linked together (catalog item → template → property groups, subscriptions → ABX actions / vRO workflows…), biggest first." });
    sols.forEach((c, i) => {
      const root = pickRoot(c);
      const title = `Solution ${i + 1}: ${root.name}`;
      h(2, title);
      const d = diagramSvg(root, l, red);
      blocks.push({ t: "diagram", title, file: `diagrams/${String(i + 1).padStart(2, "0")} ${safeName(red(root.name))}`, ...d });
      blocks.push({ t: "table", head: ["Object", "Type"], rows: c.map((o) => [o.name, kindLabel(o.type)]) });
    });
  }

  // The VCF Automation tabs, in UI order
  const done = new Set<Kind>();
  for (const sec of SECTIONS) {
    if (sec.id === "home") continue;
    const items = sec.nav.flatMap((g) => g.items).filter((it) => (it.kind ? !done.has(it.kind) && l.objects.some((o) => o.type === it.kind) : it.page === "event-topics" && l.topics.size > 0));
    if (!items.length) continue;
    h(1, sec.label);
    for (const it of items) {
      if (!it.kind) {
        h(2, it.label);
        blocks.push({
          t: "table",
          head: ["Topic", "ID", "Blockable", "Subscriptions"],
          rows: [...l.topics.entries()].map(([id, t]) => [s(t.name) || id, id, yes(t.blockable), l.objects.filter((o) => o.type === "subscription" && s(o.meta.eventTopicId) === id).map((o) => o.name).join(", ")]),
        });
        continue;
      }
      done.add(it.kind);
      const objs = l.objects.filter((o) => o.type === it.kind).sort((a, b) => a.folder.join("/").localeCompare(b.folder.join("/")) || a.name.localeCompare(b.name));
      h(2, `${it.label} (${objs.length})`);
      for (const o of objs) {
        h(3, o.name);
        blocks.push(...objectBlocks(o, l));
      }
    }
  }

  // Collection log
  if (l.manifest.log?.length) {
    h(1, "Collection log");
    blocks.push({ t: "table", head: ["Section", "Endpoint", "Status", "Count", "Message"], rows: l.manifest.log.map((e) => [e.section, e.endpoint, e.status, e.count == null ? "" : String(e.count), e.message ?? ""]) });
  }

  return {
    title: red(`${org} — VCF Automation configuration`),
    subtitle: red(`${src.fqdn ?? ""}${l.manifest.exportedAt ? ` · exported ${l.manifest.exportedAt.slice(0, 10)}` : ""}`.replace(/^ · /, "")),
    blocks: mergeKv(blocks).map((b) => redactBlock(b, red)),
    toc: toc.map(([id, t, lv]) => [id, red(t), lv]),
  };
}

const KIND_PLURAL = (k: string) => ({ "catalog-item": "Catalog Items", template: "Cloud Templates" })[k] ?? kindLabel(k) + "s";

/** The object a solution diagram starts from: a catalog item, else a subscription, else the most-linked object. */
function pickRoot(c: LedgerObject[]): LedgerObject {
  for (const k of ["catalog-item", "subscription", "resource-action", "template"]) {
    const o = c.find((x) => x.type === k && component(x).length === c.length);
    if (o) return o;
  }
  return [...c].sort((a, b) => b.out.length + b.in.length - (a.out.length + a.in.length))[0];
}

/** Back-to-back key/value lists read as one. */
function mergeKv(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (b.t === "kv" && last?.t === "kv") out[out.length - 1] = { t: "kv", rows: [...last.rows, ...b.rows] };
    else out.push(b);
  }
  return out;
}

function redactBlock(b: Block, red: (t: string) => string): Block {
  switch (b.t) {
    case "h":
    case "p":
      return { ...b, text: red(b.text) };
    case "kv":
      return { ...b, rows: b.rows.map(([k, v]) => [k, red(v)] as [string, string]) };
    case "table":
      return { ...b, rows: b.rows.map((r) => r.map((c) => red(c))) };
    case "list":
      return { ...b, items: b.items.map((c) => red(c)) };
    case "code":
      return { ...b, title: b.title && red(b.title), code: red(b.code), file: b.file && red(b.file) };
    case "diagram":
      return { ...b, title: red(b.title) };
  }
}

/** One row per object, for inventory.csv / inventory.md. */
export function inventoryRows(l: Ledger, red: (t: string) => string): string[][] {
  return l.objects.map((o) => [
    kindLabel(o.type),
    red(o.name),
    red(o.project ?? ""),
    red(o.folder.join(" / ")),
    o.id,
    o.selectedBy,
    red(o.out.map((r) => `${relLabel(r.rel, "out")}: ${r.obj?.name ?? r.key}`).join("; ")),
    red(o.in.map((r) => `${relLabel(r.rel, "in")}: ${r.obj?.name ?? r.key}`).join("; ")),
    red(o.path),
  ]);
}
export const INVENTORY_HEAD = ["Type", "Name", "Project", "Folder", "ID", "Selected by", "Uses", "Used by", "File"];
