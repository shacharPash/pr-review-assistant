import { useState, useEffect, type FormEvent } from 'react';
import { useStore } from '../state/store.js';

export function PRInput() {
  const loading = useStore((s) => s.loading);
  const loadPR = useStore((s) => s.loadPR);
  const currentUrl = useStore((s) => s.bundle?.meta.url ?? '');
  const [value, setValue] = useState(currentUrl);

  // Show the PR that's currently loaded (e.g. opened via the extension deep
  // link) instead of an empty box. Only re-syncs when a different PR loads —
  // it won't clobber what the user is mid-typing, since currentUrl is stable
  // until the next successful load.
  useEffect(() => {
    setValue(currentUrl);
  }, [currentUrl]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim() || loading) return;
    loadPR(value.trim());
  }

  return (
    <form className="input-row" onSubmit={onSubmit}>
      <input
        type="text"
        placeholder="PR URL or owner/repo#123"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={loading}
        autoFocus
      />
      <button type="submit" disabled={loading || !value.trim()}>
        {loading ? 'Loading…' : 'Open'}
      </button>
    </form>
  );
}
