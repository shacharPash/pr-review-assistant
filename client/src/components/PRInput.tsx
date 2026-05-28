import { useState, type FormEvent } from 'react';
import { useStore } from '../state/store.js';

export function PRInput() {
  const loading = useStore((s) => s.loading);
  const loadPR = useStore((s) => s.loadPR);
  const [value, setValue] = useState('');

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
