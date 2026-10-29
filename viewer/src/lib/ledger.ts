import JSZip from "jszip";

export type Kind =
  | "template"
  | "catalog-item"
  | "content-source"
  | "policy"
  | "subscription"
  | "abx-action"
  | "property-group"
  | "custom-resource"
  | "resource-action";

export const KINDS: { kind: Kind; label: string; single: string }[] = [
  { kind: "template", label: "Cloud Templates", single: "Cloud Template" },
  { kind: "catalog-item", label: "Catalog Items", single: "Catalog Item" },
  { kind: "content-source", label: "Content Sources", single: "Content Source" },
  { kind: "policy", label: "Policies", single: "Policy" },
  { kind: "subscription", label: "Subscriptions", single: "Subscription" },
  { kind: "abx-action", label: "ABX Actions", single: "ABX Action" },
  { kind: "property-group", label: "Property Groups", single: "Property Group" },
  { kind: "custom-resource", label: "Custom Resources", single: "Custom Resource" },
  { kind: "resource-action", label: "Resource Actions", single: "Resource Action" },
];

export const kindLabel = (k: string) => KINDS.find((x) => x.kind === k)?.single ?? k;

export interface ManifestObject {
  key: string;
  type: Kind;
  id: string;
  name: string;
  project?: string | null;
  selectedBy: "user" | "dependency";
  path: string;
  files: string[];
  meta: Record<string, unknown>;
}

export interface Link {
  from: string;
  to: string;
  rel: string;
}

export interface Manifest {
  format: string;
  formatVersion: string;
  tool: { name: string; version: string };
  source: { product?: string; orgType?: string; fqdn?: string; organization?: string; apiVersion?: string; cloudApiVersion?: string; auth?: string };
  exportedAt?: string;
  exportedBy?: string;
  selection?: string;
  counts?: Record<string, number>;
  objects: ManifestObject[];
  links: Link[];
  eventTopics?: { id: string; name?: string; blockable?: boolean; path: string }[];
  log?: { section: string; endpoint: string; status: string; count?: number; message?: string }[];
}

export interface Ref {
  rel: string;
  /** object in this package, or undefined for external (vRO workflow) */
  obj?: LedgerObject;
  key: string;
}

export interface LedgerObject extends ManifestObject {
  /** sidebar folder path */
  folder: string[];
  out: Ref[];
  in: Ref[];
}

export interface Ledger {
  fileName: string;
  manifest: Manifest;
  objects: LedgerObject[];
  byKey: Map<string, LedgerObject>;
  /** text of every file, by path inside the package */
  files: Map<string, string>;
  /** images (icons/), as data: URLs, by path inside the package */
  images: Map<string, string>;
  topics: Map<string, Record<string, unknown>>;
  projects: { id: string; name: string; description?: string }[];
}

const POLICY_TYPES: Record<string, string> = {
  "com.vmware.policy.approval": "Approval",
  "com.vmware.policy.deployment.lease": "Lease",
  "com.vmware.policy.deployment.action": "Day 2 Actions",
  "com.vmware.policy.catalog.entitlement": "Content Sharing",
  "com.vmware.policy.resource.quota": "IaaS Resource Quota",
  "com.vmware.policy.deployment.limit": "Deployment Limit",
  "com.vmware.policy.resource.limit": "Resource Limit",
};
export const policyTypeLabel = (t?: unknown) => (t ? POLICY_TYPES[String(t)] ?? String(t).replace(/^com\.vmware\.policy\./, "") : "Policy");

function folderFor(o: ManifestObject): string[] {
  if (o.type === "policy") return [policyTypeLabel(o.meta?.typeId)];
  if (o.type === "subscription" && o.meta?.eventTopicId) return [String(o.meta.eventTopicId)];
  if (o.project) return [o.project];
  return [];
}

export async function parseLedger(buf: ArrayBuffer, fileName: string): Promise<Ledger> {
  const zip = await JSZip.loadAsync(buf);
  // a package zipped with its folder at the top: find manifest.json wherever it sits
  const mfEntry = Object.values(zip.files).find((f) => !f.dir && /(^|\/)manifest\.json$/.test(f.name) && f.name.split("/").length <= 2);
  if (!mfEntry) throw new Error("This doesn't look like a VCFA Ledger package (no manifest.json found).");
  const prefix = mfEntry.name.slice(0, mfEntry.name.length - "manifest.json".length);
  const files = new Map<string, string>();
  const images = new Map<string, string>();
  const MIME: Record<string, string> = { svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
  await Promise.all(
    Object.values(zip.files)
      .filter((f) => !f.dir && f.name.startsWith(prefix))
      .map(async (f) => {
        const rel = f.name.slice(prefix.length);
        const ext = (/\.([a-z0-9]+)$/i.exec(rel)?.[1] ?? "").toLowerCase();
        if (rel.startsWith("icons/")) images.set(rel, `data:${MIME[ext] ?? "application/octet-stream"};base64,${await f.async("base64")}`);
        else files.set(rel, await f.async("string"));
      }),
  );
  const manifest = JSON.parse(stripBom(files.get("manifest.json")!)) as Manifest;
  if (manifest.format !== "vcfapkg") throw new Error("manifest.json is not a .vcfapkg manifest.");
  manifest.objects ??= [];
  manifest.links ??= [];

  let projects: Ledger["projects"] = [];
  try {
    const p = files.get("projects.json");
    if (p) projects = [].concat(JSON.parse(stripBom(p)));
  } catch {
    /* optional */
  }
  const projName = new Map(projects.map((p) => [p.id, p.name]));
  const fileJson = (path: string) => {
    try {
      const t = files.get(path);
      return t ? (JSON.parse(stripBom(t)) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };

  // Fill gaps left by older collectors (before 2026.1.3): project from sourceProjectId, catalog item -> template from externalId
  for (const o of manifest.objects) {
    if (!o.project) {
      const j = fileJson(o.path);
      const pid = j && String(j.projectId ?? j.sourceProjectId ?? "");
      if (pid && projName.has(pid)) o.project = projName.get(pid);
    }
    if (o.type === "catalog-item" && !manifest.links.some((l) => l.from === o.key && l.rel === "publishes")) {
      const ext = String(fileJson(o.path)?.externalId ?? "");
      const m = /\/blueprint\/api\/blueprints\/([^/?]+)/.exec(ext);
      if (m && manifest.objects.some((x) => x.key === `template|${m[1]}`)) manifest.links.push({ from: o.key, to: `template|${m[1]}`, rel: "publishes" });
    }
  }

  const objects: LedgerObject[] = manifest.objects.map((o) => ({ ...o, meta: o.meta ?? {}, folder: folderFor(o), out: [], in: [] }));
  const byKey = new Map(objects.map((o) => [o.key, o]));
  for (const l of manifest.links) {
    const from = byKey.get(l.from);
    if (!from) continue;
    const to = byKey.get(l.to);
    from.out.push({ rel: l.rel, obj: to, key: l.to });
    if (to) to.in.push({ rel: l.rel, obj: from, key: l.from });
  }

  const topics = new Map<string, Record<string, unknown>>();
  for (const t of manifest.eventTopics ?? []) {
    const txt = files.get(t.path);
    try {
      topics.set(t.id, txt ? JSON.parse(stripBom(txt)) : { id: t.id, name: t.name });
    } catch {
      topics.set(t.id, { id: t.id, name: t.name });
    }
  }
  return { fileName, manifest, objects, byKey, files, images, topics, projects };
}

function stripBom(s: string) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

export function readJson(l: Ledger, path?: string): Record<string, unknown> | null {
  if (!path) return null;
  const t = l.files.get(path);
  if (!t) return null;
  try {
    return JSON.parse(stripBom(t));
  } catch {
    return null;
  }
}

export function langFor(path: string): string {
  if (/\.ya?ml$/i.test(path)) return "yaml";
  if (/\.py$/i.test(path)) return "python";
  if (/\.ps1$/i.test(path)) return "powershell";
  if (/\.js$/i.test(path)) return "javascript";
  if (/\.json$/i.test(path)) return "json";
  return "plaintext";
}

export const REL_LABEL: Record<string, [string, string]> = {
  // [outgoing, incoming]
  publishes: ["Publishes template", "Published by catalog item"],
  "from-source": ["From content source", "Catalog items from this source"],
  "uses-property-group": ["Uses property group", "Used by template"],
  "uses-custom-resource": ["Uses custom resource", "Used by template"],
  "uses-template": ["Uses template", "Used by"],
  runs: ["Runs", "Run by"],
  "recovers-with": ["Recovers with", "Recover runnable of"],
  "applies-to": ["Applies to", "Policies that apply"],
};

export function relLabel(rel: string, dir: "out" | "in") {
  const l = REL_LABEL[rel];
  return l ? (dir === "out" ? l[0] : l[1]) : rel;
}

/** All objects connected to `start` by links in either direction (a "solution"). */
export function component(start: LedgerObject): LedgerObject[] {
  const seen = new Set<string>([start.key]);
  const out: LedgerObject[] = [start];
  for (let i = 0; i < out.length; i++) {
    for (const r of [...out[i].out, ...out[i].in]) {
      // content sources and the policies on them tie everything together; don't walk through them
      if (r.rel === "from-source" || r.rel === "applies-to") continue;
      if (r.obj && !seen.has(r.obj.key)) {
        seen.add(r.obj.key);
        out.push(r.obj);
      }
    }
  }
  return out;
}

/** Groups of linked objects with more than one member, biggest first. */
export function solutions(l: Ledger): LedgerObject[][] {
  const seen = new Set<string>();
  const res: LedgerObject[][] = [];
  for (const o of l.objects) {
    if (seen.has(o.key)) continue;
    const c = component(o);
    c.forEach((x) => seen.add(x.key));
    const ext = c.some((x) => x.out.some((r) => !r.obj));
    if (c.length > 1 || ext) res.push(c);
  }
  return res.sort((a, b) => b.length - a.length);
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function shortId(id: string) {
  return id.length > 13 ? id.slice(0, 8) + "…" : id;
}
