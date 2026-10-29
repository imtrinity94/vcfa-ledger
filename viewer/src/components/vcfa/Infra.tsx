import type { ReactNode } from "react";
import { readJson, type Ledger, type LedgerObject } from "../../lib/ledger";
import { KindIcon } from "../Icons";

/** Detail pages for infrastructure objects: cloud accounts, zones, mappings, profiles and tags. Read-only. */

type J = Record<string, unknown>;
const str = (v: unknown) => (v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

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

function Kv({ rows }: { rows: [string, ReactNode][] }) {
  const r = rows.filter(([, v]) => v !== "" && v !== null && v !== undefined);
  if (!r.length) return null;
  return (
    <dl className="kv">
      {r.map(([k, v]) => (
        <span key={k} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </span>
      ))}
    </dl>
  );
}

function Tags({ names, ledger, onNav }: { names: string[]; ledger: Ledger; onNav: (k: string) => void }) {
  if (!names.length) return <span className="muted small">None</span>;
  return (
    <span className="vx-tags">
      {names.map((n) => {
        const t = ledger.byKey.get(`tag|${n}`);
        return t ? (
          <button key={n} className="vx-tag clickable" onClick={() => onNav(t.key)}>
            <KindIcon kind="tag" size={11} /> {n}
          </button>
        ) : (
          <span key={n} className="vx-tag">
            {n}
          </span>
        );
      })}
    </span>
  );
}

const tagNames = (arr: unknown) => ((arr as J[] | undefined) ?? []).map((t) => (t.value ? `${str(t.key)}:${str(t.value)}` : str(t.key)));

function AccountRegion({ o, onNav }: { o: LedgerObject; ledger?: Ledger; onNav: (k: string) => void }) {
  const acc = o.out.find((r) => r.rel === "in-account")?.obj;
  return (
    <>
      {acc ? (
        <button className="vx-link" onClick={() => onNav(acc.key)}>
          {acc.name}
        </button>
      ) : (
        str(o.meta.cloudAccountName) || "—"
      )}
      {" / "}
      {str(o.meta.regionName) || "—"}
      {o.meta.externalRegionId ? <span className="muted small"> ({str(o.meta.externalRegionId)})</span> : null}
    </>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="vl-grid">
      <div className="vl-row vl-head" style={{ gridTemplateColumns: `repeat(${head.length}, minmax(0, 1fr))` }}>
        {head.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      {rows.map((r, i) => (
        <div key={i} className="vl-row" style={{ gridTemplateColumns: `repeat(${head.length}, minmax(0, 1fr))` }}>
          {r.map((c, j) => (
            <span key={j}>{c}</span>
          ))}
        </div>
      ))}
      {!rows.length && <div className="vl-empty">None</div>}
      <div className="vl-foot">{rows.length} items</div>
    </div>
  );
}

export function InfraView({ o, ledger, onNav }: { o: LedgerObject; ledger: Ledger; onNav: (k: string) => void }) {
  const j = (readJson(ledger, o.path) ?? {}) as J;

  if (o.type === "cloud-account") {
    const props = (j.cloudAccountProperties as J) ?? {};
    const contained = o.in.filter((r) => r.rel === "in-account" && r.obj);
    return (
      <>
        <Card title="Cloud account">
          <Kv
            rows={[
              ["Type", str(j.cloudAccountType)],
              ["Description", str(j.description)],
              ["Regions", ((o.meta.regions as string[] | undefined) ?? []).join(", ")],
              ["Capability tags", <Tags key="t" names={tagNames(j.tags)} ledger={ledger} onNav={onNav} />],
              ...Object.entries(props).map(([k, v]) => [k, <code key={k}>{str(v)}</code>] as [string, ReactNode]),
              ["Created", str(j.createdAt)],
            ]}
          />
        </Card>
        {contained.length > 0 && (
          <Card title="Configured on this account" extra={<span className="count">{contained.length}</span>}>
            <ul className="ref-list">
              {contained.map((r) => (
                <li key={r.key}>
                  <button className="ref-row" onClick={() => onNav(r.obj!.key)}>
                    <KindIcon kind={r.obj!.type} /> <span className="ellipsis">{r.obj!.name}</span>
                    <span className="ref-rel">{r.obj!.type.replace("-profile", " mapping").replace("-", " ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </>
    );
  }

  if (o.type === "cloud-zone") {
    return (
      <Card title="Cloud zone">
        <Kv
          rows={[
            ["Account / region", <AccountRegion key="a" o={o} ledger={ledger} onNav={onNav} />],
            ["Description", str(j.description)],
            ["Placement policy", str(j.placementPolicy)],
            ["Folder", str(j.folder)],
            ["Capability tags", <Tags key="t" names={tagNames(j.tags)} ledger={ledger} onNav={onNav} />],
            ["Compute filter (tags to match)", <Tags key="m" names={tagNames(j.tagsToMatch)} ledger={ledger} onNav={onNav} />],
          ]}
        />
      </Card>
    );
  }

  if (o.type === "image-profile" || o.type === "flavor-profile") {
    const isImg = o.type === "image-profile";
    const mapping = ((j[isImg ? "imageMappings" : "flavorMappings"] as J)?.mapping as Record<string, J>) ?? {};
    const users = o.in.filter((r) => (r.rel === "uses-image-mapping" || r.rel === "uses-flavor-mapping") && r.obj);
    return (
      <>
        <Card title={isImg ? "Image mappings" : "Flavor mappings"} extra={<span className="count">{Object.keys(mapping).length}</span>}>
          <p className="small" style={{ margin: "0 0 10px" }}>
            Account / region: <AccountRegion o={o} ledger={ledger} onNav={onNav} />
          </p>
          {isImg ? (
            <Table
              head={["Image mapping", "Image", "OS family", "Constraints", "Cloud config"]}
              rows={Object.entries(mapping).map(([k, m]) => [
                <strong key="k">{k}</strong>,
                str(m.name ?? m.externalId ?? m.id),
                str(m.osFamily),
                <code key="c" className="wrapcode">{(m.constraints as J[] | undefined)?.length ? JSON.stringify(m.constraints) : ""}</code>,
                m.cloudConfig ? <pre key="cc" className="vx-criteria" style={{ margin: 0 }}>{str(m.cloudConfig)}</pre> : "",
              ])}
            />
          ) : (
            <Table
              head={["Flavor mapping", "vCPU", "Memory", "Instance type / name", "Other"]}
              rows={Object.entries(mapping).map(([k, m]) => {
                const rest = Object.fromEntries(Object.entries(m).filter(([x]) => !["cpuCount", "memoryInMB", "name"].includes(x)));
                return [
                  <strong key="k">{k}</strong>,
                  str(m.cpuCount),
                  m.memoryInMB !== undefined ? `${Math.round((Number(m.memoryInMB) / 1024) * 10) / 10} GB (${str(m.memoryInMB)} MB)` : "",
                  str(m.name),
                  <code key="o" className="wrapcode">{Object.keys(rest).length ? JSON.stringify(rest) : ""}</code>,
                ];
              })}
            />
          )}
        </Card>
        {users.length > 0 && (
          <Card title="Used by templates" extra={<span className="count">{users.length}</span>}>
            <ul className="ref-list">
              {users.map((r) => (
                <li key={r.key}>
                  <button className="ref-row" onClick={() => onNav(r.obj!.key)}>
                    <KindIcon kind="template" /> <span className="ellipsis">{r.obj!.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </>
    );
  }

  if (o.type === "network-profile") {
    const ids = (o.meta.fabricNetworkIds as string[] | undefined) ?? [];
    const nets = ids.map((id) => ledger.infra.fabricNetworks.find((n) => str(n.id) === id) ?? { id });
    const rangesFor = (id: string) =>
      ledger.infra.ipRanges.filter((r) => str(r.fabricNetworkId) === id || str(((r._links as J)?.["fabric-network"] as J)?.href).endsWith(`/${id}`));
    return (
      <>
        <Card title="Network profile">
          <Kv
            rows={[
              ["Account / region", <AccountRegion key="a" o={o} ledger={ledger} onNav={onNav} />],
              ["Description", str(j.description)],
              ["Isolation", str(j.isolationType)],
              ["Capability tags", <Tags key="t" names={tagNames(j.tags)} ledger={ledger} onNav={onNav} />],
            ]}
          />
        </Card>
        <Card title="Networks" extra={<span className="count">{nets.length}</span>}>
          <Table
            head={["Network", "CIDR", "Tags", "IP ranges"]}
            rows={nets.map((n) => {
              const rs = rangesFor(str(n.id));
              return [
                <strong key="n">{str(n.name) || <code>{str(n.id)}</code>}</strong>,
                str(n.cidr),
                <Tags key="t" names={tagNames(n.tags)} ledger={ledger} onNav={onNav} />,
                rs.length ? (
                  <span key="r" className="vl-chips">
                    {rs.map((r) => (
                      <span key={str(r.id)} className="small">
                        <strong>{str(r.name)}</strong> {str(r.startIPAddress)} – {str(r.endIPAddress)}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span key="r" className="muted small">
                    —
                  </span>
                ),
              ];
            })}
          />
        </Card>
      </>
    );
  }

  if (o.type === "storage-profile") {
    const disk = (j.diskProperties as J) ?? {};
    const target = (j.diskTargetProperties as J) ?? {};
    return (
      <Card title="Storage profile">
        <Kv
          rows={[
            ["Account / region", <AccountRegion key="a" o={o} ledger={ledger} onNav={onNav} />],
            ["Description", str(j.description)],
            ["Default", j.defaultItem ? "Yes" : "No"],
            ["Supports encryption", j.supportsEncryption === undefined ? "" : j.supportsEncryption ? "Yes" : "No"],
            ["Capability tags", <Tags key="t" names={tagNames(j.tags)} ledger={ledger} onNav={onNav} />],
            ...Object.entries(disk).map(([k, v]) => [`Disk: ${k}`, str(v)] as [string, ReactNode]),
            ...Object.entries(target).map(([k, v]) => [`Target: ${k}`, str(v)] as [string, ReactNode]),
          ]}
        />
      </Card>
    );
  }

  if (o.type === "tag") {
    const on = o.in.filter((r) => r.rel === "has-tag" && r.obj);
    const req = o.in.filter((r) => r.rel === "needs-tag" && r.obj);
    const list = (refs: typeof on) =>
      refs.length ? (
        <ul className="ref-list">
          {refs.map((r) => (
            <li key={r.key}>
              <button className="ref-row" onClick={() => onNav(r.obj!.key)}>
                <KindIcon kind={r.obj!.type} /> <span className="ellipsis">{r.obj!.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Nothing in this export</p>
      );
    return (
      <>
        <Card title="Tag">
          <Kv
            rows={[
              ["Key", <code key="k">{str(o.meta.key)}</code>],
              ["Value", <code key="v">{str(o.meta.value) || "(none)"}</code>],
            ]}
          />
        </Card>
        <div className="refs">
          <Card title="Capability tag on" extra={<span className="count">{on.length}</span>}>
            {list(on)}
          </Card>
          <Card title="Constraint in templates" extra={<span className="count">{req.length}</span>}>
            {list(req)}
          </Card>
        </div>
      </>
    );
  }
  return null;
}
