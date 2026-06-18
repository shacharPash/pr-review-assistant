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
      {/* Decorative, motion-driven backdrop. Pointer-events:none so it never
          intercepts the input. Honors prefers-reduced-motion in CSS. */}
      <div className="landing-bg" aria-hidden="true">
        <span className="landing-aurora a1" />
        <span className="landing-aurora a2" />
        <span className="landing-aurora a3" />
        <div className="landing-grid" />
      </div>

      <div className="landing-inner">
        <div className="landing-hero">
          {/* Left: the pitch + input */}
          <div className="landing-lead">
            <div className="landing-eyebrow reveal" style={{ animationDelay: '0ms' }}>
              <span className="landing-dot" />
              <span>PR Review Assistant</span>
            </div>

            <h1 className="landing-title reveal" style={{ animationDelay: '70ms' }}>
              Read PRs faster,
              <br />
              <span className="landing-title-grad">with full context.</span>
            </h1>

            <p className="landing-sub reveal" style={{ animationDelay: '140ms' }}>
              Paste a GitHub PR URL. The TL;DR streams while you wait: risk and
              blast radius first, code second. Noise stays hidden.
            </p>

            <form className="landing-form reveal" style={{ animationDelay: '210ms' }} onSubmit={onSubmit}>
              <input
                type="text"
                className="landing-input"
                placeholder="https://github.com/owner/repo/pull/123   ·   or   owner/repo#123"
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
              className="landing-sample reveal"
              style={{ animationDelay: '280ms' }}
              onClick={loadSample}
              disabled={loading}
            >
              Try a sample: <code>{SAMPLE_REF}</code>
            </button>
          </div>

          {/* Right: an animated preview of the product doing its thing. */}
          <div className="landing-show reveal" style={{ animationDelay: '320ms' }} aria-hidden="true">
            <div className="lp-win">
              <div className="lp-winbar">
                <span className="lp-traffic r" />
                <span className="lp-traffic y" />
                <span className="lp-traffic g" />
                <span className="lp-win-title">cli/cli #13510</span>
                <span className="lp-win-status">● Open</span>
              </div>
              <div className="lp-body">
                <div className="lp-tldr">
                  <span className="lp-tldr-label">◆ TL;DR</span>
                  <p className="lp-typed">
                    Token refresh now runs before expiry, not after. See{' '}
                    <code>auth/session.go:88</code>.
                  </p>
                </div>
                <div className="lp-diff">
                  <div className="lp-line ctx" style={{ animationDelay: '1.6s' }}>
                    <span className="lp-no">86</span>
                    <span className="lp-code">func (s *Session) Token() string {'{'}</span>
                  </div>
                  <div className="lp-line del" style={{ animationDelay: '1.8s' }}>
                    <span className="lp-no">87</span>
                    <span className="lp-code">  if s.expired() {'{'} s.refresh() {'}'}</span>
                  </div>
                  <div className="lp-line add" style={{ animationDelay: '2.0s' }}>
                    <span className="lp-no">87</span>
                    <span className="lp-code">  if s.expiringSoon() {'{'} s.refresh() {'}'}</span>
                  </div>
                  <div className="lp-line ctx" style={{ animationDelay: '2.2s' }}>
                    <span className="lp-no">88</span>
                    <span className="lp-code">  return s.token</span>
                  </div>
                </div>
                <div className="lp-noise" style={{ animationDelay: '2.5s' }}>
                  ⋯ 3 noise hunks hidden (imports, lockfile)
                </div>
              </div>
            </div>
          </div>
        </div>

        <ul className="landing-features">
          <li className="reveal" style={{ animationDelay: '420ms' }}>
            <span className="landing-feature-icon">⚡</span>
            <div>
              <strong>Concrete TL;DR</strong>
              <span>Cites real files, lines, and the main risk, not generic bullets.</span>
            </div>
          </li>
          <li className="reveal" style={{ animationDelay: '500ms' }}>
            <span className="landing-feature-icon">◐</span>
            <div>
              <strong>Signal over noise</strong>
              <span>Lockfiles, imports, formatting collapse by default. One click reveals.</span>
            </div>
          </li>
          <li className="reveal" style={{ animationDelay: '580ms' }}>
            <span className="landing-feature-icon">⌘</span>
            <div>
              <strong>Code is the hero</strong>
              <span>Monaco diff with blame, reading order, and keyboard nav (j/k).</span>
            </div>
          </li>
        </ul>

        <div className="landing-foot reveal" style={{ animationDelay: '660ms' }}>
          Runs locally. Uses your <code>gh</code> CLI auth and <code>claude</code> CLI. No API keys required.
        </div>
      </div>
    </div>
  );
}
