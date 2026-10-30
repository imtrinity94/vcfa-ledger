import { useEffect, useState } from "react";

declare const __COLLECTOR_VERSION__: string;

const REPO = "https://github.com/imtrinity94/vcfa-ledger";
const SCRIPT = "Export-VCFALedgerPackage.ps1";
const RAW = `${REPO}/raw/main/collector/${SCRIPT}`;
const README = `${REPO}#collector`;

/** Copyable one-line command. */
function Cmd({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="gp-cmd">
      <code>{text}</code>
      <button
        className="btn-ghost sm"
        onClick={() =>
          navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          })
        }
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** "How do I get a .vcfapkg?" guide: download the collector, run it, open the result here. */
export function GetPackage({ onClose, onPick }: { onClose: () => void; onPick?: () => void }) {
  const [os, setOs] = useState<"win" | "mac">(() => (typeof navigator !== "undefined" && /Mac|Linux/i.test(navigator.platform) ? "mac" : "win"));
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const local = typeof location !== "undefined" && location.protocol !== "file:" ? `/collector/${SCRIPT}` : RAW;

  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <div className="modal gp" role="dialog" aria-modal="true" aria-labelledby="gp-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="gp-title">How do I get a .vcfapkg?</h2>
          <button className="btn-ghost icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="gp-lede">
          A <code>.vcfapkg</code> is made by the <strong>VCFA Ledger collector</strong>, a PowerShell script you run against one VCF Automation 9.x VM Apps organization. It only reads
          (GET calls), saves everything to a folder plus one <code>.vcfapkg</code> file, and needs no modules.
        </p>

        <ol className="gp-steps">
          <li>
            <strong>Download the collector</strong>
            {__COLLECTOR_VERSION__ && <span className="gp-ver">version {__COLLECTOR_VERSION__}</span>}
            <div className="gp-links">
              <a className="btn primary" href={local} download={SCRIPT}>
                Download {SCRIPT}
              </a>
              <a className="btn" href={REPO} target="_blank" rel="noreferrer">
                GitHub repo
              </a>
              <a className="btn" href={README} target="_blank" rel="noreferrer">
                Full documentation
              </a>
            </div>
          </li>

          <li>
            <strong>Run it</strong> from a machine that can reach VCF Automation on port 443
            <div className="gp-os" role="tablist">
              <button role="tab" aria-selected={os === "win"} className={os === "win" ? "on" : ""} onClick={() => setOs("win")}>
                Windows (PowerShell 5.1)
              </button>
              <button role="tab" aria-selected={os === "mac"} className={os === "mac" ? "on" : ""} onClick={() => setOs("mac")}>
                macOS / Linux (PowerShell 7)
              </button>
            </div>
            {os === "win" ? (
              <>
                <p className="gp-note">In PowerShell, in the folder you downloaded it to (unblock it once, as it came from the internet):</p>
                <Cmd text={`Unblock-File .\\${SCRIPT}`} />
                <Cmd text={`.\\${SCRIPT}`} />
              </>
            ) : (
              <>
                <p className="gp-note">
                  Install PowerShell once (<code>brew install --cask powershell</code>), then in the folder you downloaded it to:
                </p>
                <Cmd text={`pwsh ./${SCRIPT}`} />
              </>
            )}
            <p className="gp-note">
              It asks for the <strong>FQDN</strong>, the <strong>organization</strong>, whether to skip the certificate check (lab / self-signed) and the <strong>credentials</strong>{" "}
              (an org user, or <code>user@org</code>; Organization Administrator for a full export). Or pass them up front:
            </p>
            <Cmd text={`${os === "win" ? ".\\" : "pwsh ./"}${SCRIPT} -Fqdn vcfa.example.com -Organization my-org -SkipCertificateCheck`} />
            <details className="gp-more">
              <summary>Useful options</summary>
              <table className="gp-opts">
                <tbody>
                  <tr>
                    <td>
                      <code>-Select</code>
                    </td>
                    <td>Pick what to export; related objects are added for you</td>
                  </tr>
                  <tr>
                    <td>
                      <code>-UseApiToken</code>
                    </td>
                    <td>Log in with an org API token instead of a password</td>
                  </tr>
                  <tr>
                    <td>
                      <code>-OutputPath</code>
                    </td>
                    <td>Where to write the export (default: the current folder)</td>
                  </tr>
                  <tr>
                    <td>
                      <code>-SkipTemplateVersions</code>
                    </td>
                    <td>Only the current content of each template, not every version</td>
                  </tr>
                  <tr>
                    <td>
                      <code>-IncludeSystemSubscriptions</code>
                    </td>
                    <td>Keep built-in system subscriptions (left out by default)</td>
                  </tr>
                </tbody>
              </table>
            </details>
          </li>

          <li>
            <strong>Find the package</strong>
            <p className="gp-note">
              It is written next to where you ran the script: <code>VM Apps - &lt;org&gt;/&lt;org&gt;_&lt;yyyymmdd&gt;.vcfapkg</code>, beside a folder with the same content as
              plain JSON / YAML files you can commit to git. A second run on the same day gets <code>_2</code>, <code>_3</code>…
            </p>
          </li>

          <li>
            <strong>Open it here</strong>
            <p className="gp-note">Drop the file anywhere on this page, or:</p>
            {onPick && (
              <button
                className="btn primary"
                onClick={() => {
                  onClose();
                  onPick();
                }}
              >
                Open .vcfapkg
              </button>
            )}
            <p className="gp-note gp-trust">The file is read in your browser. Nothing is uploaded.</p>
          </li>
        </ol>
      </div>
    </div>
  );
}
