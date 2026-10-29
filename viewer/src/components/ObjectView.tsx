import { useState, type ReactNode } from "react";
import { CodeBlock } from "./CodeBlock";
import { KindIcon } from "./Icons";
import { ChainDiagram } from "./ChainDiagram";
import { kindLabel, langFor, policyTypeLabel, readJson, relLabel, shortId, type Ledger, type LedgerObject, type Ref } from "../lib/ledger";

type J = Record<string, unknown>;

const s = (v: unknown) => (v === undefined || v === null || v === "" ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
const pretty = (v: unknown) => JSON.stringify(v, null, 2);

/** Top-level primitive fields of an API object, shown as a key/value list. */
function Props({ obj, skip = [] }: { obj: J | null; skip?: string[] }) {
  if (!obj) return null;
  const rows = Object.entries(obj).filter(([k, v]) => !skip.includes(k) && v !== null && v !== "" && typeof v !== "object");
  if (!rows.length) return null;
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <Frag key={k}>
          <dt>{k}</dt>
          <dd className={/id$|Id$|Link$|At$/.test(k) ? "mono small" : undefined}>{String(v)}</dd>
        </Frag>
      ))}
    </dl>
  );
}
const Frag = ({ children }: { children: ReactNode }) => <>{children}</>;

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

function RefRow({ r, dir, onNav }: { r: Ref; dir: "out" | "in"; onNav: (k: string) => void }) {
  if (!r.obj) {
    const id = r.key.split("|")[1] ?? r.key;
    return (
      <li>
        <div className="ref-row ext" title="This workflow lives in the vRO package, not in this export">
          <KindIcon kind="vro-workflow" /> <span className="ellipsis">vRO workflow <code>{id}</code></span>
          <span className="ref-rel">{relLabel(r.rel, dir)}</span>
        </div>
      </li>
    );
  }
  return (
    <li>
      <button className="ref-row" onClick={() => onNav(r.obj!.key)} title={`${kindLabel(r.obj.type)}: ${r.obj.name}`}>
        <KindIcon kind={r.obj.type} /> <span className="ellipsis">{r.obj.name}</span>
        <span className="ref-rel">{relLabel(r.rel, dir)}</span>
      </button>
    </li>
  );
}

function References({ o, onNav }: { o: LedgerObject; onNav: (k: string) => void }) {
  if (!o.out.length && !o.in.length) return null;
  return (
    <Card title="Links">
      <div className="refs">
        <div className="ref-group">
          <h4>Uses</h4>
          {o.out.length ? (
            <ul className="ref-list">
              {o.out.map((r, i) => (
                <RefRow key={i} r={r} dir="out" onNav={onNav} />
              ))}
            </ul>
          ) : (
            <p className="muted small">Nothing</p>
          )}
        </div>
        <div className="ref-group">
          <h4>Used by</h4>
          {o.in.length ? (
            <ul className="ref-list">
              {o.in.map((r, i) => (
                <RefRow key={i} r={r} dir="in" onNav={onNav} />
              ))}
            </ul>
          ) : (
            <p className="muted small">Nothing in this export</p>
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- per type

function TemplateView({ o, l }: { o: LedgerObject; l: Ledger }) {
  const dir = o.path.replace(/\/template\.json$/, "");
  const versions = (o.meta.versions as { version: string; status?: string; released?: boolean }[] | undefined) ?? [];
  const [sel, setSel] = useState<string>("current");
  const file = sel === "current" ? `${dir}/content.yaml` : `${dir}/versions/${safe(sel)}.yaml`;
  const yaml = l.files.get(file) ?? "";
  const vmeta = sel === "current" ? null : readJson(l, `${dir}/versions/${safe(sel)}.json`);
  const meta = readJson(l, o.path);
  return (
    <>
      <Card title="Template">
        {(versions.length > 0) && (
          <div className="ver-pills" role="tablist" aria-label="Version">
            <button className={`pill ${sel === "current" ? "on" : ""}`} onClick={() => setSel("current")}>
              Current draft
            </button>
            {versions.map((v) => (
              <button key={v.version} className={`pill ${sel === v.version ? "on" : ""}`} onClick={() => setSel(v.version)} title={v.status}>
                <span className={`vdot${v.released ? " rel" : ""}`} />
                {v.version}
              </button>
            ))}
            <span className="muted small" style={{ marginLeft: 6 }}>
              <span className="vdot rel" style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "var(--ok)", marginRight: 4 }} />
              released
            </span>
          </div>
        )}
        {vmeta && (s(vmeta.versionDescription) || s(vmeta.versionChangeLog)) && (
          <div className="callout small">
            {s(vmeta.versionDescription) && <div><strong>Description:</strong> {s(vmeta.versionDescription)}</div>}
            {s(vmeta.versionChangeLog) && <div><strong>Change log:</strong> {s(vmeta.versionChangeLog)}</div>}
          </div>
        )}
        {yaml ? <CodeBlock code={yaml} lang="yaml" title={file.split("/").pop()} editable={false} /> : <p className="muted">No YAML content in this export.</p>}
      </Card>
      <Card title="Details">
        <Props obj={vmeta ?? meta} skip={["selfLink", "orgId"]} />
      </Card>
    </>
  );
}

function CatalogView({ o, l }: { o: LedgerObject; l: Ledger }) {
  const item = readJson(l, o.path);
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
  const schema = item?.schema as { properties?: Record<string, J> } | undefined;
  const props = Object.entries(schema?.properties ?? {});
  return (
    <>
      <Card title="Catalog item">
        <dl className="kv">
          <dt>Type</dt>
          <dd>{s((item?.type as J)?.name) || s(o.meta.type)}</dd>
          <dt>Request limit</dt>
          <dd>{s(item?.bulkRequestLimit) || "—"}</dd>
          <dt>Custom form</dt>
          <dd>{form ? <span className="chip ok">yes{form.status ? ` · ${s(form.status)}` : ""}</span> : <span className="chip">none</span>}</dd>
          <dt>Source object</dt>
          <dd className="mono small">{s(item?.externalId) || "—"}</dd>
        </dl>
      </Card>
      {props.length > 0 && (
        <Card title="Request inputs" extra={<span className="count">{props.length}</span>}>
          <InputsTable props={props} />
        </Card>
      )}
      {form && (
        <Card title="Custom form">
          <CodeBlock code={typeof formDef === "string" ? formDef : pretty(formDef ?? form)} lang="json" title={formPath?.split("/").pop()} editable={false} maxHeight={520} />
        </Card>
      )}
    </>
  );
}

function InputsTable({ props }: { props: [string, J][] }) {
  return (
    <div className="table-wrap">
      <table className="props">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Title</th>
            <th>Default</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {props.map(([k, p]) => (
            <tr key={k}>
              <td className="pk">{k}</td>
              <td className="type">{s(p.type)}{p.encrypted ? " · secret" : ""}</td>
              <td>{s(p.title)}</td>
              <td><code className="wrapcode">{s(p.default ?? p.const)}</code></td>
              <td className="desc">{s(p.description)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PolicyView({ o, l }: { o: LedgerObject; l: Ledger }) {
  const p = readJson(l, o.path);
  return (
    <>
      <Card title="Policy">
        <dl className="kv">
          <dt>Type</dt>
          <dd>{policyTypeLabel(p?.typeId)}</dd>
          <dt>Enforcement</dt>
          <dd>{s(p?.enforcementType) ? <span className={`chip ${p?.enforcementType === "HARD" ? "warn" : ""}`}>{s(p?.enforcementType)}</span> : "—"}</dd>
          <dt>Scope</dt>
          <dd>{o.project ? <span className="chip">{o.project}</span> : p?.projectId ? <code>{s(p.projectId)}</code> : "Organization"}</dd>
          {s(p?.description) && (
            <>
              <dt>Description</dt>
              <dd>{s(p?.description)}</dd>
            </>
          )}
        </dl>
      </Card>
      {p?.criteria != null && (
        <Card title="Criteria">
          <CodeBlock code={pretty(p.criteria)} lang="json" editable={false} />
        </Card>
      )}
      {p?.definition != null && (
        <Card title="Definition">
          <CodeBlock code={pretty(p.definition)} lang="json" editable={false} />
        </Card>
      )}
    </>
  );
}

function SubscriptionView({ o, l, onNav }: { o: LedgerObject; l: Ledger; onNav: (k: string) => void }) {
  const sub = readJson(l, o.path);
  const m = o.meta;
  const topicId = s(m.eventTopicId);
  const topic = l.topics.get(topicId);
  const runRef = o.out.find((r) => r.rel === "runs");
  const recRef = o.out.find((r) => r.rel === "recovers-with");
  const isVro = /vro/i.test(s(m.runnableType));
  const crit = s(m.criteria);
  return (
    <>
      <Card title="Subscription" extra={m.disabled ? <span className="chip bad">disabled</span> : <span className="chip ok">enabled</span>}>
        <div className="sub-flow">
          <div className="sub-box sub-topic">
            <div className="sub-box-k">
              <KindIcon kind="topic" /> Event topic
            </div>
            <div className="sub-box-v">{s(topic?.name) || topicId}</div>
            <code className="small muted">{topicId}</code>
            {topic?.blockable === true && <span className="chip small" style={{ alignSelf: "flex-start" }}>blockable</span>}
          </div>
          <div className="sub-arrow" aria-hidden>
            →
          </div>
          <div className={`sub-box sub-cond${crit ? "" : " none"}`}>
            <div className="sub-box-k">Condition</div>
            {crit ? <code>{crit}</code> : <span className="muted small">No condition: runs for every event</span>}
          </div>
          <div className="sub-arrow" aria-hidden>
            →
          </div>
          <div className={`sub-box sub-run${isVro ? " vro" : ""}`}>
            <div className="sub-box-k">
              <KindIcon kind={isVro ? "vro-workflow" : "abx-action"} /> {isVro ? "vRO workflow" : "ABX action"}
            </div>
            {runRef?.obj ? (
              <button className="link sub-box-v" onClick={() => onNav(runRef.obj!.key)}>
                {runRef.obj.name}
              </button>
            ) : (
              <div className="sub-box-v mono small">{s(m.runnableId) || "—"}</div>
            )}
            {isVro && <span className="muted small">in the vRO package</span>}
          </div>
        </div>
      </Card>
      <div className="facts">
        <div className="fact">
          <div className="fact-k">Blocking</div>
          <div className="fact-v">{m.blocking ? "Yes" : "No"}</div>
        </div>
        <div className="fact">
          <div className="fact-k">Priority</div>
          <div className="fact-v">{s(m.priority) || "—"}</div>
        </div>
        <div className="fact">
          <div className="fact-k">Timeout</div>
          <div className="fact-v">{s(m.timeout) ? `${s(m.timeout)} min` : "—"}</div>
        </div>
        <div className="fact">
          <div className="fact-k">Projects</div>
          <div className="fact-v">{(m.projects as string[] | undefined)?.join(", ") || "Any"}</div>
        </div>
        <div className="fact">
          <div className="fact-k">Recover</div>
          <div className="fact-v">{recRef?.obj ? recRef.obj.name : s(m.recoverRunnableId) ? shortId(s(m.recoverRunnableId)) : "—"}</div>
        </div>
      </div>
      <Card title="Details">
        <Props obj={sub} skip={["criteria", "orgId"]} />
      </Card>
    </>
  );
}

function AbxView({ o, l }: { o: LedgerObject; l: Ledger }) {
  const a = readJson(l, o.path);
  const src = o.files.find((f) => /\/source\.[a-z0-9]+$/.test(f));
  const code = src ? l.files.get(src) ?? "" : "";
  const inputs = Object.entries((a?.inputs as J) ?? {});
  const isFlow = s(a?.actionType) === "FLOW";
  return (
    <>
      <div className="facts">
        <div className="fact">
          <div className="fact-k">{isFlow ? "Type" : "Runtime"}</div>
          <div className="fact-v">{isFlow ? "Action flow" : s(a?.runtime ?? a?.runtimeName) || "—"}{s(a?.runtimeVersion) ? ` ${s(a?.runtimeVersion)}` : ""}</div>
        </div>
        {!isFlow && (
          <div className="fact">
            <div className="fact-k">Entry point</div>
            <div className="fact-v mono">{s(a?.entrypoint) || "—"}</div>
          </div>
        )}
        <div className="fact">
          <div className="fact-k">Memory</div>
          <div className="fact-v">{s(a?.memoryInMB) ? `${s(a?.memoryInMB)} MB` : "—"}</div>
        </div>
        <div className="fact">
          <div className="fact-k">Timeout</div>
          <div className="fact-v">{s(a?.timeoutSeconds) ? `${s(a?.timeoutSeconds)} s` : "—"}</div>
        </div>
        <div className="fact">
          <div className="fact-k">Provider</div>
          <div className="fact-v">{s(a?.provider) || "—"}</div>
        </div>
      </div>
      {code ? (
        <CodeBlock code={code} lang={langFor(src!)} title={src!.split("/").pop()} editable={false} />
      ) : (
        <div className="callout">No inline source in this export{a?.contentResourceName ? ` (packaged as ${s(a.contentResourceName)})` : ""}.</div>
      )}
      {inputs.length > 0 && (
        <Card title="Default inputs" extra={<span className="count">{inputs.length}</span>}>
          <table className="props">
            <tbody>
              {inputs.map(([k, v]) => (
                <tr key={k}>
                  <td className="pk">{k}</td>
                  <td>
                    <code className="wrapcode">{s(v)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {s(a?.dependencies) && (
        <Card title="Dependencies">
          <CodeBlock code={s(a?.dependencies)} lang="plaintext" editable={false} />
        </Card>
      )}
      <Card title="Details">
        <Props obj={a} skip={["orgId"]} />
      </Card>
    </>
  );
}

function PropertyGroupView({ o, l }: { o: LedgerObject; l: Ledger }) {
  const g = readJson(l, o.path);
  const props = Object.entries((g?.properties as Record<string, J>) ?? {});
  return (
    <>
      <Card title="Property group" extra={<span className="chip">{s(g?.type) || "—"}</span>}>
        {s(g?.description) && <p className="el-desc" style={{ marginTop: 0 }}>{s(g?.description)}</p>}
        {props.length ? <InputsTable props={props} /> : <p className="muted small">No properties.</p>}
        <p className="muted small" style={{ marginBottom: 0 }}>
          Used in templates as <code>{`\${propertyGroups.${o.name}.<property>}`}</code>
        </p>
      </Card>
    </>
  );
}

function safe(v: string) {
  return v.replace(/[\\/:*?"<>|]/g, "_");
}

// ---------------------------------------------------------------- main

export function ObjectView({ o, ledger, onNav }: { o: LedgerObject; ledger: Ledger; onNav: (key: string) => void }) {
  const main = readJson(ledger, o.path);
  let body: ReactNode;
  switch (o.type) {
    case "template":
      body = <TemplateView o={o} l={ledger} />;
      break;
    case "catalog-item":
      body = <CatalogView o={o} l={ledger} />;
      break;
    case "policy":
      body = <PolicyView o={o} l={ledger} />;
      break;
    case "subscription":
      body = <SubscriptionView o={o} l={ledger} onNav={onNav} />;
      break;
    case "abx-action":
      body = <AbxView o={o} l={ledger} />;
      break;
    case "property-group":
      body = <PropertyGroupView o={o} l={ledger} />;
      break;
    default:
      body = (
        <Card title="Details">
          <Props obj={main} skip={["orgId"]} />
        </Card>
      );
  }
  const desc = s(main?.description);
  return (
    <div className="stack">
      <div className="el-head">
        <div className="el-kind">
          <KindIcon kind={o.type} /> {o.type === "policy" ? `${policyTypeLabel(o.meta.typeId)} policy` : kindLabel(o.type)}
          {o.folder.length > 0 && <span className="crumbs">{o.folder.join(" / ")}</span>}
        </div>
        <h1>{o.name}</h1>
        <div className="chips">
          {o.project && <span className="chip">Project: {o.project}</span>}
          <span className="chip mono" title="ID">{o.id}</span>
          {o.selectedBy === "dependency" && <span className="chip accent" title="Not picked directly: added because something in the export uses it">added as dependency</span>}
        </div>
        {desc && o.type !== "property-group" && <p className="el-desc">{desc}</p>}
      </div>

      {(o.out.length > 0 || o.in.length > 0) && (
        <Card title="Solution" extra={<span className="muted small">everything linked to this {kindLabel(o.type).toLowerCase()}</span>}>
          <ChainDiagram start={o} onNav={onNav} />
        </Card>
      )}

      {body}
      <References o={o} onNav={onNav} />

      <Card title="Files in the package" extra={<span className="count">{o.files.length}</span>}>
        <ul className="file-list">
          {o.files.map((f) => (
            <li key={f} className="file-row">
              <code className="ellipsis">{f}</code>
              <span className="muted small nowrap">{(ledger.files.get(f)?.length ?? 0).toLocaleString()} chars</span>
            </li>
          ))}
        </ul>
        <details>
          <summary>Raw JSON ({o.path.split("/").pop()})</summary>
          <CodeBlock code={ledger.files.get(o.path) ?? ""} lang="json" title={o.path} editable={false} maxHeight={520} />
        </details>
      </Card>
    </div>
  );
}
