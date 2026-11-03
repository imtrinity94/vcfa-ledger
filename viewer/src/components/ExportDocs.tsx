import { useEffect, useState } from "react";
import type { Ledger } from "../lib/ledger";

/** "Export documentation" dialog: what's in the zip, the redaction option, and the build progress. */
export function ExportDocs({ ledger, onClose }: { ledger: Ledger; onClose: () => void }) {
  const [redact, setRedact] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose, busy]);

  const run = async () => {
    setErr(null);
    setDone(null);
    setBusy("Starting");
    try {
      // loaded on demand: the Word writer is big and most visits never export
      const { exportDocumentation, download } = await import("../lib/exporter");
      const { blob, name } = await exportDocumentation(ledger, { redact, onProgress: setBusy });
      download(blob, name);
      setDone(name);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const fqdn = ledger.manifest.source.fqdn;
  return (
    <div className="modal-back" onClick={() => !busy && onClose()} role="presentation">
      <div className="modal gp" role="dialog" aria-modal="true" aria-labelledby="ex-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="ex-title">Export documentation</h2>
          <button className="btn-ghost icon-btn" onClick={onClose} aria-label="Close" disabled={!!busy}>
            ×
          </button>
        </div>
        <p className="gp-lede">
          Downloads one zip with everything in this package, organised like the VCF Automation tabs. It is built in your browser; nothing is uploaded.
        </p>
        <ul className="ex-list">
          <li>
            <strong>report.html</strong> <span>full report, works offline, prints to PDF</span>
          </li>
          <li>
            <strong>LLD .docx</strong> <span>the same content as a Word low level design</span>
          </li>
          <li>
            <strong>report.md</strong> <span>the same content as Markdown, for a wiki or git</span>
          </li>
          <li>
            <strong>inventory.csv / .md</strong> <span>one row per object, with its links</span>
          </li>
          <li>
            <strong>diagrams/</strong> <span>each solution diagram as SVG and PNG</span>
          </li>
          <li>
            <strong>sources/</strong> <span>every file: template YAML of all versions, ABX code, custom forms, raw JSON</span>
          </li>
        </ul>
        <label className="ex-opt">
          <input type="checkbox" checked={redact} onChange={(e) => setRedact(e.target.checked)} disabled={!!busy} />
          <span>
            <strong>Hide host names and user names</strong>
            <span className="gp-note">
              Replaces {fqdn ? <code>{fqdn}</code> : "the VCF Automation FQDN"}, vCenter / NSX and other endpoints, names in the same domain, created by / updated by, owners,
              user principals and e-mail addresses with placeholders (<code>host-1.redacted.example</code>, <code>user-1</code>) everywhere, file names included. The same value
              always gets the same placeholder. IP addresses and object names are kept.
            </span>
          </span>
        </label>
        {err && <div className="callout warn">Export failed: {err}</div>}
        {done && <div className="callout ok-callout">Downloaded {done}</div>}
        <div className="ex-act">
          <button className="btn" onClick={onClose} disabled={!!busy}>
            Close
          </button>
          <button className="btn primary" onClick={run} disabled={!!busy}>
            {busy ? `${busy}…` : "Export zip"}
          </button>
        </div>
      </div>
    </div>
  );
}
