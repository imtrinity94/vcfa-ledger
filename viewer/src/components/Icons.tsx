import type { Kind } from "../lib/ledger";

type IconKind = Kind | "vro-workflow" | "topic";

const paths: Record<IconKind, string> = {
  // blueprint sheet with a node graph
  template: "M5 3h14v18H5zM9 8h2v2H9zM13 13h2v2h-2zM10 10l4 3",
  // shop tag
  "catalog-item": "M3 12 12 3h8v8l-9 9zM16 7.5h0",
  // stacked trays
  "content-source": "M4 5h16v4H4zM4 11h16v4H4zM4 17h16v2H4z",
  // shield with check
  policy: "M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6zM9 12l2 2 4-4",
  // lightning
  subscription: "M13 2 4 14h7l-1 8 9-12h-7z",
  // brackets with play
  "abx-action": "M7 4 3 12l4 8M17 4l4 8-4 8M10 9v6l5-3z",
  // sliders
  "property-group": "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M14 4v4M8 10v4M16 16v4",
  // puzzle-ish cube
  "custom-resource": "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
  // cursor click
  "resource-action": "M9 9l11 4-5 2-2 5zM4 4l2 2M9 3v3M3 9h3",
  // flow chart (vRO)
  "vro-workflow": "M3 3h6v5H3zM15 16h6v5h-6zM6 8v5h12v3",
  // broadcast
  topic: "M12 12h0M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8",
};

export function KindIcon({ kind, size = 14 }: { kind: IconKind; size?: number }) {
  return (
    <svg className={`kicon k-${kind}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={paths[kind] ?? "M4 4h16v16H4z"} />
    </svg>
  );
}

/** Ledger mark: a closed book with an amber bookmark ribbon. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <rect x="12" y="8" width="40" height="48" rx="5" fill="var(--brand-fg)" />
      <path d="M12 46h40" stroke="var(--bg)" strokeWidth="2.5" opacity=".35" />
      <path d="M20 8v4" stroke="var(--bg)" strokeWidth="2.5" opacity=".35" />
      <path d="M38 8h8v22l-4-3.5-4 3.5z" fill="var(--brand-amber)" />
      <path d="M20 22h12M20 29h10M20 36h14" stroke="var(--bg)" strokeWidth="3" strokeLinecap="round" opacity=".55" />
    </svg>
  );
}
