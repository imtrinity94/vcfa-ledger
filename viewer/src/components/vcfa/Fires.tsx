import { useState } from "react";
import { FIRE_LABEL, FIRE_ORDER, type FireLevel } from "../../lib/fires";
import type { LedgerObject, Ref } from "../../lib/ledger";
import { KindIcon } from "../Icons";

/**
 * "Fires for" (on a subscription) / "Subscriptions that fire for this template" (on a template).
 * The link is inferred, so every row says how sure it is and why.
 */
export function FiresCard({ o, onNav }: { o: LedgerObject; onNav: (k: string) => void }) {
  const isSub = o.type === "subscription";
  const refs = (isSub ? o.out : o.in).filter((r) => r.rel === "fires-for" && r.obj);
  const [open, setOpen] = useState<string | null>(null);
  const counts = FIRE_ORDER.map((l) => [l, refs.filter((r) => r.level === l).length] as const).filter(([, n]) => n > 0);

  return (
    <div className="card">
      <div className="card-head">
        <h3>{isSub ? "Fires for templates" : "Subscriptions that fire for this template"}</h3>
        <span className="count">{refs.length}</span>
        <span className="spacer" />
        {counts.map(([l, n]) => (
          <span key={l} className={`fire-chip fire-${l}`}>
            {FIRE_LABEL[l]} {n}
          </span>
        ))}
      </div>
      <p className="vl-note" style={{ marginTop: 0 }}>
        VCF Automation does not store this link. It is worked out from the subscription's projects, event topic and condition against the template's project, resources and
        properties.
      </p>
      {refs.length ? (
        <ul className="fire-list">
          {FIRE_ORDER.flatMap((lvl) =>
            refs
              .filter((r) => r.level === lvl)
              .sort((a, b) => a.obj!.name.localeCompare(b.obj!.name))
              .map((r: Ref) => {
                const id = r.obj!.key;
                const topic = isSub ? "" : String(r.obj!.meta.eventTopicId ?? "");
                return (
                  <li key={id} className="fire-row">
                    <button className="fire-main" onClick={() => onNav(id)}>
                      <KindIcon kind={r.obj!.type} /> <span className="ellipsis">{r.obj!.name}</span>
                      {topic && <code className="fire-topic">{topic}</code>}
                    </button>
                    <span className={`fire-chip fire-${r.level as FireLevel}`}>{FIRE_LABEL[r.level as FireLevel]}</span>
                    <button className="vx-link fire-why" onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id}>
                      {open === id ? "Hide why" : "Why?"}
                    </button>
                    {open === id && <p className="fire-reason">{r.reason}</p>}
                  </li>
                );
              }),
          )}
        </ul>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          {isSub ? "No template in this export matches this subscription's projects, topic and condition." : "No subscription in this export fires for this template."}
        </p>
      )}
    </div>
  );
}
