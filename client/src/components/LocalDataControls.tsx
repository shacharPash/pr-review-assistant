import { useRef, useState } from 'react';
import { applicationData, clearApplicationData, usePrivacy } from '../state/privacy.js';

export function LocalDataControls() {
  const dialog = useRef<HTMLDialogElement>(null);
  const aiEnabled = usePrivacy((s) => s.aiEnabled);
  const setAIEnabled = usePrivacy((s) => s.setAIEnabled);
  const [error, setError] = useState('');
  const [clearing, setClearing] = useState(false);

  function exportData() {
    try {
      const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data: applicationData(window.localStorage) }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'pr-review-assistant-local-data.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError('This browser blocked access to local data. Check its storage settings.'); }
  }

  async function clearData() {
    setClearing(true); setError('');
    try {
      const res = await fetch('/api/local-data/clear', { method: 'POST' });
      if (!res.ok) throw new Error('Could not clear the server cache. Restart the app and try again.');
      clearApplicationData(window.localStorage);
      // Reload closes streams and discards in-memory state. Do not reopen the PR.
      window.location.replace('/');
    } catch (err) { setError((err as Error).message); setClearing(false); }
  }

  return <>
    <button type="button" className="link-btn" onClick={() => dialog.current?.showModal()}>
      Local data &amp; AI{aiEnabled ? '' : ' (AI off)'}
    </button>
    <dialog ref={dialog} aria-labelledby="local-data-title" className="local-data-dialog">
      <h2 id="local-data-title">Local data &amp; AI</h2>
      <p>AI sends PR code, descriptions, commit messages and optional Jira context through your local Claude account and configured provider. Provider retention and organization policies still apply.</p>
      <p>Enable it only for repositories you are allowed to share with that provider. The diff and manual review work with AI off.</p>
      <label><input type="checkbox" checked={aiEnabled} onChange={(event) => {
        setAIEnabled(event.target.checked);
        // Reload stops active AI requests before applying the new choice.
        window.location.reload();
      }} /> Enable AI for this browser</label>
      <hr />
      <p>Drafts, reviewed files and preferences are saved in this browser until cleared. Exports contain private text; store them carefully.</p>
      <div className="local-data-actions">
        <button type="button" onClick={exportData}>Export local data</button>
        <button type="button" onClick={clearData} disabled={clearing}>Clear drafts, preferences &amp; cache</button>
      </div>
      <p>This does not delete posted GitHub reviews, provider records, browser history, downloaded exports or backups. Close other app tabs before clearing data.</p>
      <p><a href="/PRIVACY.md" target="_blank" rel="noreferrer">Privacy details</a> · <a href="/THIRD_PARTY_NOTICES.txt" target="_blank" rel="noreferrer">Third-party notices</a></p>
      {error && <p role="alert">{error}</p>}
      <form method="dialog"><button type="submit">Close</button></form>
    </dialog>
  </>;
}
