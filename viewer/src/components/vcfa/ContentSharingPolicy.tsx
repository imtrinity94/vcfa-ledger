import type { ReactNode } from "react";
import type { Ledger, LedgerObject } from "../../lib/ledger";

/**
 * Read-only replica of the VCF Automation Service Broker page
 * Content & Policies > Policies > Definitions > (Content Sharing policy).
 */

type J = Record<string, unknown>;
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

const SOURCE_TYPES: Record<string, string> = {
  "com.vmw.blueprint": "VCF Automation Templates",
  "com.vmw.vro.workflow": "VCF Operations Orchestrator Workflow",
  "com.vmw.abx.actions": "Extensibility actions",
  "com.vmw.mp.content": "Marketplace VM Templates",
  "com.github.blueprint": "GitHub",
  "com.gitlab.blueprint": "GitLab",
  "com.vmw.codestream": "Pipelines",
};

export function InfoIcon() {
  return (
    <svg className="vx-info" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 10.5v6" strokeLinecap="round" />
      <circle cx="12" cy="7.4" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function VxRow({ label, required, children, info }: { label: string; required?: boolean; children: ReactNode; info?: boolean }) {
  return (
    <>
      <div className={`vx-label${required ? " vx-req" : ""}`}>{label}</div>
      <div className="vx-value">
        <div className="vx-value-main">{children}</div>
        {info && <InfoIcon />}
      </div>
    </>
  );
}

export function VxRadio({ on, label, help }: { on: boolean; label: ReactNode; help?: ReactNode }) {
  return (
    <div className={`vx-radio${on ? " on" : ""}`}>
      <span className="vx-radio-dot" aria-hidden />
      <div>
        <div className="vx-radio-label">{label}</div>
        {help && <div className="vx-help">{help}</div>}
      </div>
    </div>
  );
}

export function VxCheck({ on, label }: { on: boolean; label?: ReactNode }) {
  return (
    <span className={`vx-check${on ? " on" : ""}`}>
      <span className="vx-check-box" aria-hidden>
        {on && (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M2.5 6.2 5 8.6 9.6 3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {label && <span>{label}</span>}
    </span>
  );
}

function SourceIcon() {
  // Clarity "blocks" style icon VCFA uses for content sources in the sharing grid
  return (
    <svg className="vx-src-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4z" />
      <path d="M4 7.4 12 12l8-4.6M12 12v9.2" />
    </svg>
  );
}
function ItemIcon() {
  return (
    <svg className="vx-src-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  );
}

const PRINCIPAL_LABEL: Record<string, string> = { USER: "User", GROUP: "Group", ROLE: "Role", PROJECT: "Project" };

export function ContentSharingPolicy({ policy, o, ledger, onNav }: { policy: J; o: LedgerObject; ledger: Ledger; onNav: (k: string) => void }) {
  const def = (policy.definition as J) ?? {};
  const groups = (def.entitledUsers as J[]) ?? [];
  const items = groups.flatMap((g) => (g.items as J[]) ?? []);
  const userTypes = new Set(groups.map((g) => str(g.userType || "USER")));
  const roleBased = userTypes.has("ROLE") && !userTypes.has("USER");
  const principals = groups.flatMap((g) => (g.principals as J[]) ?? []);
  const allInProject = principals.some((p) => str(p.type) === "PROJECT" && !str(p.referenceId));
  const named = principals.filter((p) => !(str(p.type) === "PROJECT" && !str(p.referenceId)));
  const isProject = !!policy.projectId;
  const projectName = o.project || (isProject ? str(policy.projectId) : "");
  const criteria = policy.criteria;

  const sourceName = (id: string) => ledger.byKey.get(`content-source|${id}`);
  const itemName = (id: string) => ledger.byKey.get(`catalog-item|${id}`);

  return (
    <div className="vx-page">
      <div className="vx-head">
        <h2 className="vx-title">{o.name}</h2>
        <span className="vx-readonly" title="VCFA Ledger shows the exported policy read-only">Read-only</span>
      </div>
      <p className="vx-sub">
        Content sharing policies control users access to catalog items. <InfoIcon />
      </p>
      {str(policy.enforcementType) && <p className="vx-sub">Enforcement: {str(policy.enforcementType).toLowerCase() === "hard" ? "Hard" : "Soft"}</p>}

      <div className="vx-form">
        <VxRow label="Type">
          <span className="vx-text">Content Sharing</span>
        </VxRow>
        <VxRow label="Name" required>
          <div className="vx-input">{o.name}</div>
        </VxRow>
        <VxRow label="Description">
          <div className="vx-textarea">{str(policy.description)}</div>
        </VxRow>
        <VxRow label="Scope" required info>
          <VxRadio
            on={!isProject}
            label="Organization / Multiple Projects"
            help="Apply the policy to all or a selection of projects in this organization. To target multiple projects, select project based criteria."
          />
          {!isProject && criteria != null && (
            <pre className="vx-criteria">{JSON.stringify(criteria, null, 2)}</pre>
          )}
          <VxRadio on={isProject} label="Project" help="Apply the policy to a single project in this organization." />
          {isProject && <div className="vx-scope-proj">{projectName}</div>}
        </VxRow>
        <VxRow label="Content sharing" required info>
          <div className="vx-btns">
            <button className="vx-btn vx-btn-outline" disabled title="Read-only">
              <span aria-hidden>+</span> ADD ITEMS
            </button>
            <button className="vx-btn vx-btn-flat" disabled title="Read-only">
              <span aria-hidden>×</span> REMOVE
            </button>
          </div>
          <div className="vx-grid">
            <div className="vx-grid-row vx-grid-head">
              <span className="vx-grid-cb">
                <VxCheck on={false} />
              </span>
              <span>Items Shared with this Project</span>
              <span>Content Source</span>
            </div>
            {items.map((it, i) => {
              const id = str(it.id);
              const isSrc = str(it.type) === "CATALOG_SOURCE_IDENTIFIER";
              const target = isSrc ? sourceName(id) : itemName(id);
              const src = !isSrc && target ? target.out.find((r) => r.rel === "from-source")?.obj : undefined;
              const srcType = isSrc && target ? SOURCE_TYPES[str(target.meta.typeId)] ?? str(target.meta.typeId) : "";
              return (
                <div className="vx-grid-row" key={i}>
                  <span className="vx-grid-cb">
                    <VxCheck on={false} />
                  </span>
                  <span className="vx-grid-name">
                    {isSrc ? <SourceIcon /> : <ItemIcon />}
                    {target ? (
                      <button className="vx-link" onClick={() => onNav(target.key)}>
                        {target.name}
                      </button>
                    ) : (
                      <span title={id}>
                        {isSrc ? "Content source" : "Catalog item"} <code>{id.slice(0, 8)}…</code>
                      </span>
                    )}
                  </span>
                  <span className="vx-grid-src">
                    {src ? (
                      <button className="vx-link" onClick={() => onNav(src.key)}>
                        {src.name}
                      </button>
                    ) : (
                      srcType
                    )}
                  </span>
                </div>
              );
            })}
            {!items.length && <div className="vx-grid-empty">No items shared</div>}
            <div className="vx-grid-foot">
              {items.length} item{items.length === 1 ? "" : "s"}
            </div>
          </div>
        </VxRow>
        <VxRow label="Entitlement type" required info>
          <div className="vx-inline">
            <VxRadio on={!roleBased} label="User based" />
            <VxRadio on={roleBased} label="Role based" />
          </div>
        </VxRow>
        <VxRow label={roleBased ? "Roles" : "Users"} required info>
          <VxCheck on={allInProject} label="Share (content) with all users/groups in the project" />
          {named.length > 0 && (
            <div className="vx-principals">
              {named.map((p, i) => (
                <span className="vx-chip" key={i}>
                  <span className="vx-chip-k">{PRINCIPAL_LABEL[str(p.type)] ?? str(p.type)}</span> {str(p.referenceId)}
                </span>
              ))}
            </div>
          )}
        </VxRow>
      </div>
    </div>
  );
}
