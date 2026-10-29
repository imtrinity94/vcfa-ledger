import { useMemo } from "react";
import { KINDS, solutions, type Ledger } from "../lib/ledger";
import { KindIcon } from "./Icons";

function fmtDate(s?: string) {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(+d) ? s : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function Overview({ ledger, onNav }: { ledger: Ledger; onNav: (key: string) => void }) {
  const m = ledger.manifest;
  const sols = useMemo(() => solutions(ledger), [ledger]);
  const deps = ledger.objects.filter((o) => o.selectedBy === "dependency").length;
  const log = m.log ?? [];
  const bad = log.filter((l) => l.status !== "OK");

  return (
    <div className="stack">
      <div className="el-head">
        <div className="el-kind">VM Apps organization export</div>
        <h1>{m.source.organization || ledger.fileName}</h1>
        <div className="chips">
          {m.source.fqdn && <span className="chip mono">{m.source.fqdn}</span>}
          <span className="chip accent">{m.source.product || "VCF Automation"} · {m.source.orgType || "VM Apps"}</span>
          <span className="chip">{m.selection === "user-selected" ? "Selected objects" : "Full export"}</span>
          {bad.length > 0 && <span className="chip warn">{bad.length} API note{bad.length === 1 ? "" : "s"}</span>}
        </div>
      </div>

      <div className="facts">
        <div className="fact">
          <div className="fact-k">Exported</div>
          <div className="fact-v">{fmtDate(m.exportedAt) || "—"}</div>
        </div>
        <div className="fact">
          <div className="fact-k">By</div>
          <div className="fact-v">{m.exportedBy || "—"}</div>
        </div>
        <div className="fact">
          <div className="fact-k">Objects</div>
          <div className="fact-v">
            {ledger.objects.length}
            {deps > 0 && <span className="muted small"> · {deps} as dependencies</span>}
          </div>
        </div>
        <div className="fact">
          <div className="fact-k">Collector</div>
          <div className="fact-v">{m.tool?.version ?? "—"}</div>
        </div>
      </div>

      <div className="tiles">
        {KINDS.map((k) => {
          const items = ledger.objects.filter((o) => o.type === k.kind);
          return (
            <button
              key={k.kind}
              className="tile"
              style={{ textAlign: "left", cursor: items.length ? "pointer" : "default", opacity: items.length ? 1 : 0.55 }}
              onClick={() => items[0] && onNav(items.sort((a, b) => a.name.localeCompare(b.name))[0].key)}
              disabled={!items.length}
            >
              <div className="tile-top">
                <KindIcon kind={k.kind} /> {k.label}
              </div>
              <div className="tile-num">{items.length}</div>
            </button>
          );
        })}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Solutions</h3>
          <span className="muted small">objects that are linked together</span>
        </div>
        {sols.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            No linked objects in this export. Solutions show up when, say, a subscription runs an ABX action, or a catalog item publishes a template that uses a property group.
          </p>
        ) : (
          <div className="sol-list">
            {sols.map((s) => (
              <div className="sol" key={s[0].key}>
                {s.map((o, i) => (
                  <span key={o.key} style={{ display: "contents" }}>
                    {i > 0 && <span className="sol-sep">·</span>}
                    <button className="chip clickable" onClick={() => onNav(o.key)} title={o.name}>
                      <KindIcon kind={o.type} /> {o.name}
                    </button>
                  </span>
                ))}
                {s.some((o) => o.out.some((r) => !r.obj)) && (
                  <span className="chip" title="Runs vRO workflows: those live in the vRO package">
                    <KindIcon kind="vro-workflow" /> + vRO
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Source</h3>
        </div>
        <dl className="kv">
          <dt>VCF Automation</dt>
          <dd className="mono">{m.source.fqdn || "—"}</dd>
          <dt>Organization</dt>
          <dd>{m.source.organization || "—"}</dd>
          <dt>IaaS API version</dt>
          <dd className="mono">{m.source.apiVersion || "—"}</dd>
          <dt>Cloud API version</dt>
          <dd className="mono">{m.source.cloudApiVersion || "—"}</dd>
          <dt>Login</dt>
          <dd>{m.source.auth || "—"}</dd>
          <dt>Projects</dt>
          <dd>
            <div className="chips">
              {ledger.projects.map((p) => (
                <span className="chip" key={p.id} title={p.id}>
                  {p.name}
                </span>
              ))}
              {!ledger.projects.length && "—"}
            </div>
          </dd>
          <dt>Package format</dt>
          <dd className="mono">
            {m.format} {m.formatVersion}
          </dd>
        </dl>
      </div>

      {log.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3>API calls</h3>
            <span className="muted small">what the collector read</span>
          </div>
          <div className="table-wrap">
            <table className="no-resize">
              <thead>
                <tr>
                  <th>Section</th>
                  <th>Endpoint</th>
                  <th>Status</th>
                  <th className="num">Count</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {log.map((l, i) => (
                  <tr key={i}>
                    <td className="nowrap">{l.section}</td>
                    <td>
                      <code className="wrapcode">{l.endpoint}</code>
                    </td>
                    <td>
                      <span className={`chip state ${l.status === "OK" ? "ok" : l.status === "FAILED" ? "bad" : "muted-chip"}`}>
                        {l.status.toLowerCase().replace("_", " ")}
                      </span>
                    </td>
                    <td className="num">{l.count ?? ""}</td>
                    <td className="desc">{l.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
