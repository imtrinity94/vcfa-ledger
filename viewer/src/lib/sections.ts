import type { Kind } from "./ledger";

export type SectionId = "home" | "consume" | "design" | "infrastructure" | "content" | "extensibility" | "orchestrator";

export type PageId =
  | "catalog"
  | "templates"
  | "custom-resources"
  | "custom-actions"
  | "property-groups"
  | "content-sources"
  | "content"
  | "policy-definitions"
  | "subscriptions"
  | "event-topics"
  | "actions"
  | "workflows"
  | "orch-workflows"
  | "cloud-accounts"
  | "cloud-zones"
  | "flavor-mappings"
  | "image-mappings"
  | "network-profiles"
  | "storage-profiles"
  | "tags";

export interface NavItem {
  page: PageId;
  label: string;
  /** objects shown on this page */
  kind?: Kind;
}
export interface NavGroup {
  label: string;
  icon: string;
  items: NavItem[];
}

export interface Section {
  id: SectionId;
  label: string;
  nav: NavGroup[];
}

// Clarity-style outline icon paths for the left navigation
const I = {
  catalog: "M4 4h4v16H4zM10 4h4v16h-4zM16 5l4 1-3 14-4-1z",
  template: "M5 3h14v18H5zM9 8h2v2H9zM13 13h2v2h-2zM10 10l4 3",
  custom: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
  props: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M14 4v4M8 10v4M16 16v4",
  source: "M4 5h16v4H4zM4 11h16v4H4zM4 17h16v2H4z",
  content: "M12 3 21 8v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8",
  policy: "M7 3h10v18H7zM10 7h4M10 11h4M10 15h2",
  sub: "M13 2 4 14h7l-1 8 9-12h-7z",
  library: "M4 4h5v16H4zM11 4h3v16h-3zM16 5l4 1-3 14-4-1z",
  topic: "M12 12h0M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8",
  workflow: "M3 3h6v5H3zM15 16h6v5h-6zM6 8v5h12v3",
  connections: "M8 12h8M5 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  configure: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1",
};

/** Top tabs and their left navigation, modelled on the VCF Automation VM Apps UI. */
export const SECTIONS: Section[] = [
  { id: "home", label: "Home", nav: [] },
  { id: "consume", label: "Consume", nav: [{ label: "Catalog", icon: I.catalog, items: [{ page: "catalog", label: "Catalog", kind: "catalog-item" }] }] },
  {
    id: "design",
    label: "Design",
    nav: [
      { label: "Templates", icon: I.template, items: [{ page: "templates", label: "Templates", kind: "template" }] },
      { label: "Custom Resources", icon: I.custom, items: [{ page: "custom-resources", label: "Custom Resources", kind: "custom-resource" }] },
      { label: "Custom Actions", icon: I.custom, items: [{ page: "custom-actions", label: "Custom Actions", kind: "resource-action" }] },
      { label: "Property Groups", icon: I.props, items: [{ page: "property-groups", label: "Property Groups", kind: "property-group" }] },
    ],
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    nav: [
      { label: "Connections", icon: I.connections, items: [{ page: "cloud-accounts", label: "Cloud Accounts", kind: "cloud-account" }] },
      {
        label: "Configure",
        icon: I.configure,
        items: [
          { page: "cloud-zones", label: "Cloud Zones", kind: "cloud-zone" },
          { page: "flavor-mappings", label: "Flavor Mappings", kind: "flavor-profile" },
          { page: "image-mappings", label: "Image Mappings", kind: "image-profile" },
          { page: "network-profiles", label: "Network Profiles", kind: "network-profile" },
          { page: "storage-profiles", label: "Storage Profiles", kind: "storage-profile" },
          { page: "tags", label: "Tags", kind: "tag" },
        ],
      },
    ],
  },
  {
    id: "content",
    label: "Content & Policies",
    nav: [
      { label: "Content Sources", icon: I.source, items: [{ page: "content-sources", label: "Content Sources", kind: "content-source" }] },
      { label: "Content", icon: I.content, items: [{ page: "content", label: "Content", kind: "catalog-item" }] },
      { label: "Policies", icon: I.policy, items: [{ page: "policy-definitions", label: "Definitions", kind: "policy" }] },
    ],
  },
  {
    id: "extensibility",
    label: "Extensibility",
    nav: [
      { label: "Subscriptions", icon: I.sub, items: [{ page: "subscriptions", label: "Subscriptions", kind: "subscription" }] },
      { label: "Event Topics", icon: I.topic, items: [{ page: "event-topics", label: "Event Topics" }] },
      {
        label: "Library",
        icon: I.library,
        items: [
          { page: "actions", label: "Actions", kind: "abx-action" },
          { page: "workflows", label: "Workflows" },
        ],
      },
    ],
  },
  { id: "orchestrator", label: "Orchestrator", nav: [{ label: "Workflows", icon: I.workflow, items: [{ page: "orch-workflows", label: "Workflows" }] }] },
];

export const sectionOf = (id: SectionId) => SECTIONS.find((s) => s.id === id)!;

/** A nav group with a single item renders as a plain link; with several, as a collapsible group. */
export const isGroup = (g: NavGroup) => g.items.length > 1 || g.items[0].label !== g.label;

export function pageInfo(page: PageId): { section: Section; item: NavItem } {
  for (const s of SECTIONS) for (const g of s.nav) for (const it of g.items) if (it.page === page) return { section: s, item: it };
  throw new Error(`unknown page ${page}`);
}

export const firstPage = (s: Section): PageId | undefined => s.nav[0]?.items[0]?.page;

/** The list page an object of this kind belongs to (keeps the current tab when it has one). */
export function pageForKind(kind: Kind, current?: SectionId): PageId {
  const pick = (s: Section) => s.nav.flatMap((g) => g.items).find((it) => it.kind === kind)?.page;
  if (current) {
    const p = pick(sectionOf(current));
    if (p) return p;
  }
  for (const s of SECTIONS) {
    if (s.id === "consume") continue;
    const p = pick(s);
    if (p) return p;
  }
  return "catalog";
}
