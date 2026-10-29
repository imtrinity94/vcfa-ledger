import { useMemo, useState, type ReactNode } from "react";
import { InfoIcon } from "./ContentSharingPolicy";

/**
 * Live, local-only preview of the VCF Automation "New Request" page for a catalog item.
 * Built from the custom form (form-service layout + schema) when the item has one,
 * otherwise from the catalog item's JSON request schema. Nothing is ever submitted.
 */

type J = Record<string, unknown>;
const str = (v: unknown) => (v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

interface Field {
  id: string;
  label: string;
  display: string;
  dataType: string;
  multiple: boolean;
  required: boolean;
  readOnly: boolean;
  /** static default value */
  def: unknown;
  /** where a dynamic default / value list comes from (vRO action, binding...) */
  dynamicDefault?: string;
  dynamicValues?: string;
  options?: { label: string; value: string }[];
  signpost?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  pattern?: string;
  encrypted: boolean;
  visible: boolean | ((vals: Record<string, unknown>) => boolean);
  visibleRule?: string;
  /** datagrid / object field columns */
  columns?: { id: string; label: string }[];
  /** for "text" display: static text */
  text?: string;
}

interface Page {
  title: string;
  sections: Field[][];
}

// ------------------------------------------------------------------ model building

function sourceLabel(v: unknown): string | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const o = v as J;
  const type = str(o.type);
  if (type === "scriptAction" || type === "vroAction" || o.id) {
    const id = str(o.id);
    return `${type === "scriptAction" ? "vRO action" : type || "binding"}${id ? ` ${id}` : ""}`;
  }
  if (o.bind) return `bound to ${str(o.bind)}`;
  return JSON.stringify(v);
}

function optionsFrom(list: unknown): { label: string; value: string }[] | undefined {
  if (!Array.isArray(list)) return undefined;
  return list.map((x) =>
    typeof x === "object" && x !== null ? { label: str((x as J).label ?? (x as J).title ?? (x as J).value ?? (x as J).const), value: str((x as J).value ?? (x as J).const) } : { label: str(x), value: str(x) },
  );
}

/** Custom form visibility: boolean, or VCFA's [{ equals: { field: value }, value: true }] rule list. */
function visibilityOf(state: J | undefined): { fn: Field["visible"]; rule?: string } {
  const v = state?.visible;
  if (v === undefined || v === true) return { fn: true };
  if (v === false) return { fn: false, rule: "hidden" };
  if (Array.isArray(v)) {
    const rules = v as J[];
    const simple = rules.every((r) => r && typeof r === "object" && (r.equals || r.notEquals) && "value" in r);
    if (simple) {
      return {
        rule: JSON.stringify(v),
        fn: (vals) => {
          for (const r of rules) {
            const cond = (r.equals ?? r.notEquals) as J;
            const ok = Object.entries(cond).every(([k, want]) => str(vals[k]) === str(want));
            if (r.equals ? ok : !ok) return !!r.value;
          }
          return false;
        },
      };
    }
  }
  return { fn: true, rule: JSON.stringify(v) };
}

function fieldFromForm(id: string, layoutField: J, schema: J): Field {
  const sc = (schema[id] as J) ?? {};
  const type = (sc.type as J) ?? {};
  const cons = (sc.constraints as J) ?? {};
  const state = { ...((sc.state as J) ?? {}), ...((layoutField.state as J) ?? {}) };
  const vis = visibilityOf(state);
  const defIsDynamic = sc.default !== null && typeof sc.default === "object" && !Array.isArray(sc.default);
  const valuesStatic = optionsFrom(sc.valueList);
  const dataType = str(type.dataType || "string");
  const fields = (type.fields as J[] | undefined) ?? [];
  return {
    id,
    label: str(sc.label) || id,
    display: str(layoutField.display || "textField"),
    dataType,
    multiple: !!type.isMultiple,
    required: !!(cons.required === true || (cons.required as J)?.value === true),
    readOnly: state["read-only"] === true || state.readOnly === true,
    def: defIsDynamic ? undefined : sc.default,
    dynamicDefault: defIsDynamic ? sourceLabel(sc.default) : undefined,
    dynamicValues: valuesStatic ? undefined : sourceLabel(sc.valueList),
    options: valuesStatic,
    signpost: str(sc.signpost) || undefined,
    placeholder: str(sc.placeholder) || undefined,
    min: typeof (cons.min as J)?.value === "number" ? ((cons.min as J).value as number) : typeof cons.min === "number" ? (cons.min as number) : undefined,
    max: typeof (cons.max as J)?.value === "number" ? ((cons.max as J).value as number) : typeof cons.max === "number" ? (cons.max as number) : undefined,
    pattern: str((cons.pattern as J)?.value ?? cons.pattern) || undefined,
    encrypted: dataType === "secureString" || display(layoutField) === "passwordField",
    visible: vis.fn,
    visibleRule: vis.rule,
    columns: fields.length ? fields.map((f) => ({ id: str(f.id), label: str(f.label || f.id) })) : undefined,
    text: str(sc.default ?? sc.label),
  };
}
const display = (f: J) => str(f.display);

function pagesFromForm(form: J): Page[] | null {
  const layout = form.layout as J | undefined;
  const schema = (form.schema as J) ?? {};
  const pages = (layout?.pages as J[] | undefined) ?? [];
  if (!pages.length) return null;
  return pages.map((p, i) => ({
    title: str(p.title) || `Page ${i + 1}`,
    sections: ((p.sections as J[]) ?? []).map((s) => ((s.fields as J[]) ?? []).map((f) => fieldFromForm(str(f.id), f, schema))),
  }));
}

function pagesFromSchema(schema: J | undefined): Page[] {
  const props = (schema?.properties as Record<string, J>) ?? {};
  const required = new Set((schema?.required as string[]) ?? []);
  const fields: Field[] = Object.entries(props).map(([id, p]) => {
    const type = str(p.type || "string");
    const opts = optionsFrom(p.enum) ?? optionsFrom(p.oneOf);
    const isArray = type === "array";
    const isBool = type === "boolean";
    const isNum = type === "integer" || type === "number";
    return {
      id,
      label: str(p.title) || id,
      display: opts ? "dropDown" : isBool ? "checkbox" : isNum ? "integerField" : isArray ? "multiValue" : p.encrypted ? "passwordField" : str(p.format) === "textarea" ? "textArea" : "textField",
      dataType: type,
      multiple: isArray,
      required: required.has(id),
      readOnly: !!p.readOnly,
      def: p.default,
      dynamicDefault: p.$data ? `bound to ${str(p.$data)}` : undefined,
      dynamicValues: p.$dynamicEnum ? sourceLabel({ type: "scriptAction", id: str(p.$dynamicEnum) }) : undefined,
      options: opts,
      signpost: str(p.description) || undefined,
      min: typeof p.minimum === "number" ? p.minimum : undefined,
      max: typeof p.maximum === "number" ? p.maximum : undefined,
      pattern: str(p.pattern) || undefined,
      encrypted: !!p.encrypted,
      visible: true,
    };
  });
  return [{ title: "General", sections: fields.map((f) => [f]) }];
}

// ------------------------------------------------------------------ rendering

function Signpost({ f }: { f: Field }) {
  const lines = [
    f.signpost,
    f.dynamicDefault && `Default from ${f.dynamicDefault}`,
    f.dynamicValues && `Values from ${f.dynamicValues}`,
    f.pattern && `Pattern: ${f.pattern}`,
    f.min !== undefined && `Min: ${f.min}`,
    f.max !== undefined && `Max: ${f.max}`,
    f.visibleRule && `Visibility: ${f.visibleRule}`,
    `Field id: ${f.id} · ${f.dataType}${f.multiple ? "[]" : ""} · ${f.display}`,
  ].filter(Boolean);
  return (
    <span className="rq-sign" tabIndex={0}>
      <InfoIcon />
      <span className="rq-pop" role="tooltip">
        {lines.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </span>
    </span>
  );
}

function Control({ f, value, set }: { f: Field; value: unknown; set: (v: unknown) => void }) {
  const dis = f.readOnly;
  const v = value ?? "";
  if (f.display === "checkbox" || (f.dataType === "boolean" && f.display !== "dropDown")) {
    return (
      <label className="rq-cb">
        <input type="checkbox" checked={!!value} disabled={dis} onChange={(e) => set(e.target.checked)} />
        <span className="vx-check-box rq-cb-box" aria-hidden>
          {!!value && (
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M2.5 6.2 5 8.6 9.6 3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      </label>
    );
  }
  if (f.display === "dropDown" || f.display === "comboBox" || f.display === "valuePicker" || f.display === "multiSelect" || f.options) {
    if (f.display === "radioGroup" && f.options) {
      return (
        <div className="rq-radios">
          {f.options.map((o) => (
            <label key={o.value} className={`vx-radio${str(v) === o.value ? " on" : ""}`}>
              <input type="radio" name={f.id} checked={str(v) === o.value} disabled={dis} onChange={() => set(o.value)} />
              <span className="vx-radio-dot" aria-hidden />
              <span className="vx-radio-label">{o.label}</span>
            </label>
          ))}
        </div>
      );
    }
    return (
      <div className="rq-select">
        <select value={str(v)} disabled={dis} onChange={(e) => set(e.target.value)}>
          {!f.options?.some((o) => o.value === str(v)) && <option value={str(v)}>{f.dynamicValues ? `Values from ${f.dynamicValues}` : str(v)}</option>}
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>
    );
  }
  if (f.display === "radioGroup") return <span className="muted small">Values from {f.dynamicValues || "—"}</span>;
  if (f.display === "textArea") return <textarea className="rq-ta" value={str(v)} readOnly={dis} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} rows={3} />;
  if (f.display === "datagrid" || f.display === "objectField" || f.columns) {
    const cols = f.columns ?? [
      { id: "key", label: "key" },
      { id: "value", label: "value" },
    ];
    const rows = Array.isArray(value) ? (value as J[]) : [];
    return (
      <div className="rq-dg-wrap">
        {!dis && (
          <button className="rq-add" onClick={() => set([...rows, Object.fromEntries(cols.map((c) => [c.id, ""]))])} aria-label="Add row" title="Add row">
            +
          </button>
        )}
        <div className="rq-dg">
          <div className="rq-dg-row rq-dg-head" style={{ gridTemplateColumns: `40px repeat(${cols.length}, minmax(0, 1fr))` }}>
            <span className="vx-grid-cb">
              <span className="vx-check-box" />
            </span>
            {cols.map((c) => (
              <span key={c.id}>{c.label}</span>
            ))}
          </div>
          {rows.map((r, i) => (
            <div key={i} className="rq-dg-row" style={{ gridTemplateColumns: `40px repeat(${cols.length}, minmax(0, 1fr))` }}>
              <span className="vx-grid-cb">
                <button className="rq-del" onClick={() => set(rows.filter((_, j) => j !== i))} aria-label="Remove row" title="Remove row">
                  ×
                </button>
              </span>
              {cols.map((c) => (
                <span key={c.id}>
                  <input className="rq-in" value={str(r[c.id])} onChange={(e) => set(rows.map((x, j) => (j === i ? { ...x, [c.id]: e.target.value } : x)))} />
                </span>
              ))}
            </div>
          ))}
          {!rows.length && <div className="rq-dg-empty" />}
          <div className="rq-dg-foot">
            <span className="rq-mc">Manage Columns</span>
            <span>
              {rows.length ? `1 - ${rows.length}` : "0 - 0"} of {rows.length}
            </span>
          </div>
        </div>
      </div>
    );
  }
  const num = f.display === "integerField" || f.display === "decimalField" || f.dataType === "integer" || f.dataType === "decimal" || f.dataType === "number";
  return (
    <input
      className="rq-in"
      type={f.encrypted ? "password" : num ? "number" : "text"}
      value={str(v)}
      readOnly={dis}
      min={f.min}
      max={f.max}
      placeholder={f.placeholder ?? (f.dynamicDefault ? `From ${f.dynamicDefault}` : undefined)}
      onChange={(e) => set(num && e.target.value !== "" ? Number(e.target.value) : e.target.value)}
    />
  );
}

function Row({ f, value, set }: { f: Field; value: unknown; set: (v: unknown) => void }) {
  if (f.display === "text") {
    return (
      <div className="rq-row rq-text">
        <div />
        <div className="rq-static">{f.text}</div>
      </div>
    );
  }
  return (
    <div className="rq-row">
      <label className={`rq-label${f.required ? " vx-req" : ""}`}>{f.label}</label>
      <div className="rq-ctl">
        <Control f={f} value={value} set={set} />
        {(f.readOnly || f.visibleRule || f.dynamicDefault || f.dynamicValues) && (
          <div className="rq-tags">
            {f.readOnly && <span className="rq-tag">read-only</span>}
            {f.visibleRule && <span className="rq-tag" title={f.visibleRule}>conditional</span>}
            {f.dynamicDefault && <span className="rq-tag" title={`Default from ${f.dynamicDefault}`}>default: {f.dynamicDefault}</span>}
            {f.dynamicValues && <span className="rq-tag" title={`Values from ${f.dynamicValues}`}>values: {f.dynamicValues}</span>}
          </div>
        )}
      </div>
      <Signpost f={f} />
    </div>
  );
}

export function RequestForm({
  itemName,
  icon,
  projects,
  schema,
  form,
  isTemplate,
}: {
  itemName: string;
  icon: ReactNode;
  projects: string[];
  schema?: J;
  form?: J | null;
  isTemplate: boolean;
}) {
  const custom = useMemo(() => (form ? pagesFromForm(form) : null), [form]);
  const pages = useMemo(() => custom ?? pagesFromSchema(schema), [custom, schema]);
  const all = useMemo(() => pages.flatMap((p) => p.sections.flat()), [pages]);
  const hasProjectField = all.some((f) => f.id === "project");
  const hasDeplField = all.some((f) => f.id === "deploymentName");
  const initial = useMemo(() => {
    const v: Record<string, unknown> = {};
    for (const f of all) v[f.id] = f.def ?? (f.dataType === "boolean" ? false : f.multiple && f.columns ? [] : "");
    if (!("project" in v) || !v.project) v.project = projects[0] ?? "";
    return v;
  }, [all, projects]);
  const [vals, setVals] = useState(initial);
  const [page, setPage] = useState(0);
  const set = (id: string) => (x: unknown) => setVals((p) => ({ ...p, [id]: x }));
  const isVisible = (f: Field) => (typeof f.visible === "function" ? f.visible(vals) : f.visible);
  const hiddenCount = all.filter((f) => !isVisible(f)).length;

  const projectField: Field = {
    id: "project",
    label: "Project",
    display: "dropDown",
    dataType: "string",
    multiple: false,
    required: true,
    readOnly: false,
    def: projects[0],
    options: projects.map((p) => ({ label: p, value: p })),
    encrypted: false,
    visible: true,
  };
  const deplField: Field = { id: "deploymentName", label: "Deployment Name", display: "textField", dataType: "string", multiple: false, required: true, readOnly: false, def: "", encrypted: false, visible: true };

  return (
    <div className="rq">
      <div className="rq-banner">
        <span>Live preview · nothing is submitted</span>
        <span className="rq-src">{custom ? "From the custom form" : "From the request schema (no custom form)"}</span>
        <button className="vx-link" onClick={() => setVals(initial)}>
          Reset values
        </button>
      </div>
      <h2 className="rq-title">New Request</h2>
      <div className="rq-item">
        {icon}
        <span>{itemName}</span>
      </div>
      {pages.length > 1 && (
        <div className="rq-tabs" role="tablist">
          {pages.map((p, i) => (
            <button key={i} role="tab" aria-selected={page === i} className={`rq-tab${page === i ? " on" : ""}`} onClick={() => setPage(i)}>
              {p.title}
            </button>
          ))}
        </div>
      )}
      <div className="rq-form">
        {page === 0 && !hasProjectField && <Row f={projectField} value={vals.project} set={set("project")} />}
        {page === 0 && isTemplate && !hasDeplField && <Row f={deplField} value={vals.deploymentName} set={set("deploymentName")} />}
        {pages[page]?.sections.map((sec, si) =>
          sec.filter(isVisible).map((f) => <Row key={`${si}-${f.id}`} f={f.id === "project" ? { ...f, options: f.options ?? projectField.options } : f} value={vals[f.id]} set={set(f.id)} />),
        )}
        {!all.length && <p className="muted small">No other request inputs for this item.</p>}
      </div>
      {hiddenCount > 0 && (
        <p className="rq-hidden">
          {hiddenCount} field{hiddenCount === 1 ? " is" : "s are"} hidden by the form's visibility rules right now:{" "}
          {all
            .filter((f) => !isVisible(f))
            .map((f) => f.label)
            .join(", ")}
        </p>
      )}
      <div className="rq-actions">
        <button className="vx-btn rq-submit" disabled title="Preview only">
          SUBMIT
        </button>
        <button className="vx-btn vx-btn-outline" onClick={() => setVals(initial)}>
          CANCEL
        </button>
      </div>
      <details className="rq-values">
        <summary>Request inputs as they would be sent</summary>
        <pre>{JSON.stringify(vals, null, 2)}</pre>
      </details>
    </div>
  );
}
