import type { ReactNode } from "react";
import { readJson, relLabel, type Ledger, type LedgerObject } from "../../lib/ledger";
import { VRO_ICONS } from "../../lib/vroIcons";
import { KindIcon } from "../Icons";

/** vRO workflow summary page: folder, version, inputs / outputs and the step outline. No scripts. */

type J = Record<string, unknown>;
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

// workflow item type -> Orchestrator icon (from WDT4vRO) and readable label
const STEP: Record<string, { icon: string; label: string }> = {
  task: { icon: "scriptable-task", label: "Scriptable task" },
  "custom-condition": { icon: "decision-activity", label: "Decision" },
  condition: { icon: "condition", label: "Decision" },
  "decision-activity": { icon: "decision-activity", label: "Decision activity" },
  switch: { icon: "switch", label: "Switch" },
  link: { icon: "workflow", label: "Workflow element" },
  "workflow-async": { icon: "workflow-async", label: "Asynchronous workflow" },
  "workflow-schedule": { icon: "workflow-schedule", label: "Scheduled workflow" },
  foreach: { icon: "foreach", label: "Foreach" },
  multiple: { icon: "multiple", label: "Nested workflows" },
  input: { icon: "input", label: "User interaction" },
  "waiting-timer": { icon: "waiting-timer", label: "Wait timer" },
  "waiting-event": { icon: "waiting-event", label: "Wait event" },
  "waiting-condition": { icon: "waiting-event", label: "Wait condition" },
  throw: { icon: "exception", label: "Throw exception" },
  "error-handler": { icon: "error-handler", label: "Error handler" },
  "action-call": { icon: "action", label: "Action element" },
  action: { icon: "action", label: "Action element" },
  end: { icon: "end", label: "End" },
  start: { icon: "start", label: "Start" },
};

function StepIcon({ type }: { type: string }) {
  const key = STEP[type]?.icon;
  const svg = key ? VRO_ICONS[key] : undefined;
  if (!svg) return <span className="wf-step-dot" aria-hidden />;
  return <img className="wf-step-ico" src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} alt="" width={22} height={22} />;
}

function Params({ list }: { list: J[] }) {
  if (!list.length) return <p className="muted small" style={{ margin: 0 }}>None</p>;
  return (
    <div className="vl-grid">
      <div className="vl-row vl-head" style={{ gridTemplateColumns: "minmax(150px,1.3fr) minmax(90px,0.8fr) minmax(0,2fr)" }}>
        <span>Name</span>
        <span>Type</span>
        <span>Description</span>
      </div>
      {list.map((p, i) => (
        <div key={i} className="vl-row" style={{ gridTemplateColumns: "minmax(150px,1.3fr) minmax(90px,0.8fr) minmax(0,2fr)" }}>
          <span className="mono">{str(p.name)}</span>
          <span className="type">{str(p.type)}</span>
          <span className="muted small">{str(p.description)}</span>
        </div>
      ))}
    </div>
  );
}

function Card({ title, extra, children }: { title: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>{title}</h3>
        {extra}
      </div>
      {children}
    </div>
  );
}

export function WorkflowView({ o, ledger, onNav }: { o: LedgerObject; ledger: Ledger; onNav: (k: string) => void }) {
  const w = (readJson(ledger, o.path) ?? {}) as J;
  const inputs = (w.inputs as J[]) ?? [];
  const outputs = (w.outputs as J[]) ?? [];
  const steps = (w.steps as J[]) ?? [];
  const users = o.in.filter((r) => r.obj);
  return (
    <>
      <Card title="Workflow">
        <dl className="kv">
          <dt>Folder</dt>
          <dd>{str(w.path) || "—"}</dd>
          <dt>Version</dt>
          <dd>{str(w.version) || "—"}</dd>
          <dt>Workflow ID</dt>
          <dd className="mono small">{o.id}</dd>
        </dl>
        <p className="vl-note" style={{ margin: "12px 0 0" }}>
          Summary only: scripts, attributes and nested workflows are not exported. Open the vRO package in vRO Peekage for the full workflow.
        </p>
      </Card>
      {users.length > 0 && (
        <Card title="Run by" extra={<span className="count">{users.length}</span>}>
          <ul className="ref-list">
            {users.map((r, i) => (
              <li key={i}>
                <button className="ref-row" onClick={() => onNav(r.obj!.key)}>
                  <KindIcon kind={r.obj!.type} /> <span className="ellipsis">{r.obj!.name}</span>
                  <span className="ref-rel">{relLabel(r.rel, "out")}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="grid2">
        <Card title="Inputs" extra={<span className="count">{inputs.length}</span>}>
          <Params list={inputs} />
        </Card>
        <Card title="Outputs" extra={<span className="count">{outputs.length}</span>}>
          <Params list={outputs} />
        </Card>
      </div>
      <Card title="Steps" extra={<span className="count">{steps.filter((s) => s.type !== "end").length}</span>}>
        {steps.length ? (
          <ol className="wf-steps">
            {steps.map((s, i) => {
              const t = str(s.type);
              return (
                <li key={i} className={`wf-step${t === "end" ? " end" : ""}`}>
                  <StepIcon type={t} />
                  <span className="wf-step-name">{str(s.displayName) || STEP[t]?.label || str(s.name)}</span>
                  <span className="wf-step-type">{STEP[t]?.label ?? t}</span>
                  {str(s.description) && <span className="wf-step-desc">{str(s.description)}</span>}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="muted small" style={{ margin: 0 }}>No step outline in this package.</p>
        )}
      </Card>
    </>
  );
}
