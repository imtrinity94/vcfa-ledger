/**
 * Which subscriptions fire for which cloud templates.
 *
 * VCF Automation never stores this link: a subscription listens on an event topic, limited to some
 * projects and filtered by a JavaScript condition. This works it out from what the package holds:
 *   1. project   - the subscription is limited to the template's project, or not limited at all
 *   2. topic     - compute.* needs a machine in the template, network.* a network, disk.* a volume...
 *   3. condition - names the template, checks custom properties the template sets, or is absent
 */

export type FireLevel = "targets" | "property" | "could" | "unknown";

export interface Fire {
  level: FireLevel;
  reason: string;
}

export const FIRE_LABEL: Record<FireLevel, string> = {
  targets: "Targets this template",
  property: "Matches on property",
  could: "Could fire",
  unknown: "Can't tell",
};

export const FIRE_ORDER: FireLevel[] = ["targets", "property", "could", "unknown"];

type J = Record<string, unknown>;
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

export interface TemplateFacts {
  id: string;
  name: string;
  projectId: string;
  orgShared: boolean;
  resourceTypes: string[];
  /** property name -> literal values set in the YAML ("" for dynamic values) */
  props: Map<string, string[]>;
}

/** Resource types and properties set in a cloud template's YAML (line based; good enough for matching). */
export function templateFacts(id: string, name: string, meta: J, yaml: string): TemplateFacts {
  const resourceTypes = new Set<string>();
  const props = new Map<string, string[]>();
  let inResources = false;
  for (const raw of yaml.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "");
    if (/^\S/.test(line)) inResources = /^resources\s*:/.test(line);
    if (!inResources) continue;
    const t = /^\s+type:\s*['"]?([A-Za-z][\w.]*\.[\w.]+)['"]?\s*$/.exec(line);
    if (t) {
      resourceTypes.add(t[1]);
      continue;
    }
    const kv = /^\s+['"]?([A-Za-z_][\w.\-]*)['"]?\s*:\s*(.*)$/.exec(line);
    if (kv) {
      const v = kv[2].trim().replace(/^['"]|['"]$/g, "");
      const dynamic = /\$\{/.test(v);
      const list = props.get(kv[1]) ?? [];
      list.push(dynamic ? "" : v);
      props.set(kv[1], list);
    }
  }
  return {
    id,
    name,
    projectId: str(meta.projectId),
    orgShared: meta.requestScopeOrg === true,
    resourceTypes: [...resourceTypes],
    props,
  };
}

/** Does this topic apply to a template with these resource types? null = applies to anything. */
function topicNeeds(topic: string): { label: string; test: RegExp } | null {
  const t = topic.toLowerCase();
  if (t.startsWith("compute.")) return { label: "a machine", test: /machine|instance|virtualmachine/i };
  if (t.startsWith("network.")) return { label: "a network", test: /network|nsx/i };
  if (t.startsWith("disk.") || t.startsWith("storage.")) return { label: "a volume or disk", test: /volume|disk/i };
  if (t.startsWith("loadbalancer.") || t.startsWith("load.balancer")) return { label: "a load balancer", test: /loadbalancer/i };
  return null;
}

const PROP_RE =
  /(?:event\.)?data\.customProperties(?:\[\s*['"]([^'"\]]+)['"]\s*\]|\.([A-Za-z_]\w*))(?:\s*(===?|!==?)\s*(['"][^'"]*['"]|true|false|-?\d+(?:\.\d+)?))?/g;
const BP_RE = /(?:event\.)?data\.(blueprintId|blueprintName|templateId|templateName|catalogItemId)\s*(===?|!==?)\s*['"]([^'"]+)['"]/g;

const unq = (s: string) => s.replace(/^['"]|['"]$/g, "");

/** Decide how a subscription relates to a template; null = it does not fire for it. */
export function fireFor(sub: J, t: TemplateFacts, projectName: (id: string) => string): Fire | null {
  const topic = str(sub.eventTopicId);
  const criteria = str(sub.criteria).trim();
  const reasons: string[] = [];

  // 1. project
  const cons = (sub.constraints as J) ?? {};
  const projects = ([] as unknown[]).concat(cons.projectId ?? cons.projectIds ?? sub.projectIds ?? []).map(str).filter(Boolean);
  if (projects.length) {
    if (projects.includes(t.projectId)) reasons.push(`limited to project ${projectName(t.projectId)}`);
    else if (t.orgShared) reasons.push(`limited to ${projects.map(projectName).join(", ")}; the template is shared across the organization`);
    else return null;
  } else reasons.push("all projects");

  // 2. topic vs. resource types
  const need = topicNeeds(topic);
  if (need) {
    if (!t.resourceTypes.some((r) => need.test.test(r))) return null;
    reasons.push(`${topic} and the template has ${need.label}`);
  } else reasons.push(topic || "any topic");

  // 3. condition
  if (!criteria) return { level: "could", reason: `No condition: ${reasons.join(", ")}` };

  let rest = criteria;
  let targets = false;
  for (const m of criteria.matchAll(BP_RE)) {
    const [whole, field, op, value] = m;
    rest = rest.replace(whole, "");
    const isId = /Id$/.test(field);
    const hit = isId ? value === t.id : value.toLowerCase() === t.name.toLowerCase();
    if (field === "catalogItemId") continue; // catalog item ids differ from template ids; treated as unresolved
    if (op.startsWith("=")) {
      if (!hit) return null;
      targets = true;
    } else if (hit) return null;
  }
  if (targets) return { level: "targets", reason: `Condition names the template (${criteria})` };

  const matched: string[] = [];
  const dynamic: string[] = [];
  for (const m of criteria.matchAll(PROP_RE)) {
    const [whole, k1, k2, op, val] = m;
    rest = rest.replace(whole, "");
    const key = k1 ?? k2;
    const values = t.props.get(key);
    const negated = !!op && op.startsWith("!");
    if (!values) {
      if (negated) continue; // "not equal" holds when the template never sets it
      return null;
    }
    if (!op) {
      matched.push(key);
      continue;
    }
    const want = unq(val ?? "");
    const literal = values.filter((v) => v !== "");
    if (literal.length === 0) {
      dynamic.push(key);
      continue;
    }
    const eq = literal.some((v) => unq(v).toLowerCase() === want.toLowerCase());
    if (negated ? eq && literal.length === values.length : !eq && literal.length === values.length) return null;
    matched.push(`${key} = ${want}`);
  }

  const leftover = /(?:event\.)?data\.[A-Za-z_]/.test(rest) || /\w+\(/.test(rest.replace(/\b(?:true|false|null)\b/g, ""));
  if (matched.length || dynamic.length) {
    const bits = [
      matched.length ? `the template sets ${matched.join(", ")}` : "",
      dynamic.length ? `${dynamic.join(", ")} is set from a request input, so it fires when the requester chooses it` : "",
      leftover ? "the condition also checks other values" : "",
    ].filter(Boolean);
    const text = bits.join("; ");
    return { level: leftover ? "unknown" : "property", reason: `${text.charAt(0).toUpperCase()}${text.slice(1)}. Condition: ${criteria}` };
  }
  return { level: "unknown", reason: `Condition can't be checked against the template: ${criteria}` };
}
