import { useState, type FormEvent } from 'react';
import { useStore } from '../state/store.js';

const SAMPLE_REF = 'cli/cli#13510';

export function LandingHero() {
  const loading = useStore((s) => s.loading);
  const loadPR = useStore((s) => s.loadPR);
  const [value, setValue] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    loadPR(trimmed);
  }

  function loadSample() {
    if (loading) return;
    setValue(SAMPLE_REF);
    loadPR(SAMPLE_REF);
  }

  return (
    <div className="landing">
      <div className="landing-card">
        <div className="landing-eyebrow">
          <span className="landing-dot" />
          <span>PR Review Assistant</span>
        </div>

        <h1 className="landing-title">Read PRs faster, with full context.</h1>
        <p className="landing-sub">
          Paste a GitHub PR URL. The TL;DR streams while you wait — risk and
          blast radius first, code second. Noise stays hidden.
        </p>

        <form className="landing-form" onSubmit={onSubmit}>
          <input
            type="text"
            className="landing-input"
            placeholder="https://github.com/owner/repo/pull/123  ·  or  owner/repo#123"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={loading}
            autoFocus
            aria-label="GitHub PR URL or shorthand"
          />
          <button
            type="submit"
            className="landing-submit"
            disabled={loading || !value.trim()}
          >
            {loading ? 'Loading…' : 'Open PR →'}
          </button>
        </form>

        <button
          type="button"
          className="landing-sample"
          onClick={loadSample}
          disabled={loading}
        >
          Try a sample: <code>{SAMPLE_REF}</code>
        </button>

        <ul className="landing-features">
          <li>
            <span className="landing-feature-icon">⚡</span>
            <div>
              <strong>Concrete TL;DR</strong>
              <span>Cites real files, lines, and the main risk — not generic bullets.</span>
            </div>
          </li>
          <li>
            <span className="landing-feature-icon">◐</span>
            <div>
              <strong>Signal over noise</strong>
              <span>Lockfiles, imports, formatting collapse by default. One click reveals.</span>
            </div>
          </li>
          <li>
            <span className="landing-feature-icon">⌘</span>
            <div>
              <strong>Code is the hero</strong>
              <span>Monaco diff with blame, reading order, and keyboard nav (j/k).</span>
            </div>
          </li>
        </ul>

        <div className="landing-foot">
          Runs locally. Uses your <code>gh</code> CLI auth and <code>claude</code> CLI — no API keys required.
        </div>
      </div>
    </div>
  );
}
