import { useState, type RefObject } from "react";
import { GetPackage } from "./GetPackage";
import { KindIcon } from "./Icons";

const ROWS: { kind: "catalog-item" | "template" | "property-group" | "subscription" | "abx-action"; k: string; n: string }[] = [
  { kind: "catalog-item", k: "Catalog item", n: "Linux - Static IP" },
  { kind: "template", k: "Cloud template", n: "LAB - Linux - Static IP" },
  { kind: "property-group", k: "Property group", n: "lab_static_ip" },
  { kind: "subscription", k: "Subscription", n: "CompAlloc Pre - Static IP" },
  { kind: "abx-action", k: "ABX action", n: "lab-reserve-ip" },
];

export function Landing({
  scrollRef,
  onPick,
  onSample,
  onOpenUrl,
  busy,
  error,
}: {
  scrollRef: RefObject<HTMLElement | null>;
  onPick: () => void;
  onSample: () => void;
  onOpenUrl: (url: string) => void;
  busy: boolean;
  error: string | null;
}) {
  const [help, setHelp] = useState(false);
  return (
    <main className="lp" ref={scrollRef}>
      <section className="lp-hero">
        <div className="lp-copy">
          <div className="lp-intro">
            <h1 className="lp-title">
              Keep a <span className="lp-ledger">Ledger</span> of your VCF Automation
              <span className="lp-title-sub">templates, subscriptions, policies and ABX, in one package</span>
            </h1>
            <p className="lp-lede">
              Open a <code>.vcfapkg</code> exported by the VCFA Ledger collector from a VCF Automation 9.x VM Apps organization. See every customised object, how they link
              together as a solution, and the YAML and code behind them.
            </p>
          </div>
          <div className="lp-act">
            <div className="lp-cta">
              <button className="btn primary lp-btn" onClick={onPick} disabled={busy}>
                {busy ? "Reading…" : "Open .vcfapkg"}
              </button>
              <button className="btn lp-btn" onClick={onSample} disabled={busy}>
                Try the sample
              </button>
              <span className="lp-hint">or drop it anywhere on this page</span>
            </div>
            <button className="link gp-open" onClick={() => setHelp(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.2-2.5 3.9M12 17h0" />
              </svg>
              How do I get a .vcfapkg?
            </button>
            {help && <GetPackage onClose={() => setHelp(false)} onPick={onPick} />}
            <OpenFromUrl onOpenUrl={onOpenUrl} busy={busy} />
            {error && <div className="callout warn">{error}</div>}
            <p className="lp-trust">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />
              </svg>
              Opened in your browser. Nothing is uploaded.
            </p>
          </div>
        </div>
        <button className="lp-art" onClick={onPick} aria-label="Open a .vcfapkg file" disabled={busy}>
          <div className="lb-frame">
            {ROWS.map((r) => (
              <div className="lb-row" key={r.n}>
                <KindIcon kind={r.kind} size={16} /> <span className="lb-k">{r.k}</span> <span className="lb-n">{r.n}</span>
              </div>
            ))}
          </div>
        </button>
      </section>

      <section className="lp-how">
        <h2 className="lp-h2">How it works</h2>
        <ol className="flow">
          <li className="flow-start" aria-hidden />
          <li className="flow-step">
            <strong>Run the collector</strong>
            <span>
              <code>Export-VCFALedgerPackage.ps1</code> on Windows PowerShell 5.1 or PowerShell 7. Read-only, one VM Apps org at a time.
            </span>
          </li>
          <li className="flow-step">
            <strong>Commit the folder</strong>
            <span>Plain JSON, YAML and source files: diff it in git across project phases.</span>
          </li>
          <li className="flow-step">
            <strong>Open the .vcfapkg here</strong>
            <span>Browse objects, follow links from catalog item to template to subscription to code.</span>
          </li>
          <li className="flow-end" aria-hidden />
        </ol>
      </section>

      <footer className="lp-foot">
        <span>VCFA Ledger · for VCF Automation 9.x VM Apps</span>
        <span>
          Sister tool of <a href="https://vro-package-viewer.vercel.app/" target="_blank" rel="noreferrer">vRO Peekage</a>
        </span>
      </footer>
    </main>
  );
}

function OpenFromUrl({ onOpenUrl, busy }: { onOpenUrl: (url: string) => void; busy: boolean }) {
  const [url, setUrl] = useState("");
  return (
    <form
      className="lp-url"
      onSubmit={(e) => {
        e.preventDefault();
        if (url.trim()) onOpenUrl(url.trim());
      }}
    >
      <label htmlFor="lp-url-input" className="lp-url-label">
        or open a package from a link
      </label>
      <div className="lp-url-row">
        <input
          id="lp-url-input"
          className="input"
          type="url"
          inputMode="url"
          placeholder="https://github.com/…/my-org_20261030.vcfapkg"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy}
          spellCheck={false}
          autoComplete="off"
        />
        <button className="btn" type="submit" disabled={busy || !url.trim()}>
          Open link
        </button>
      </div>
    </form>
  );
}
