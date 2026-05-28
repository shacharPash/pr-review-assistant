import { useEffect, useState } from 'react';

interface Shortcut {
  keys: string[];
  label: string;
}

const SHORTCUTS: { group: string; items: Shortcut[] }[] = [
  {
    group: 'Files',
    items: [
      { keys: ['j'], label: 'Next file' },
      { keys: ['k'], label: 'Previous file' },
    ],
  },
  {
    group: 'Diff',
    items: [
      { keys: ['click +'], label: 'Add a comment on this line' },
      { keys: ['drag +'], label: 'Extend selection up or down, release to comment on the range' },
      { keys: ['Esc'], label: 'Close the comment composer' },
    ],
  },
];

export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className={`shortcuts ${open ? 'open' : ''}`}>
      <button
        type="button"
        className="shortcuts-trigger"
        onClick={() => setOpen((v) => !v)}
        title="Keyboard shortcuts"
        aria-label="Keyboard shortcuts"
      >
        <span className="shortcuts-key">j</span>
        <span className="shortcuts-key">k</span>
        <span className="shortcuts-q">?</span>
      </button>
      {open && (
        <>
          <div className="shortcuts-overlay" onClick={() => setOpen(false)} />
          <div className="shortcuts-pop" role="dialog" aria-label="Keyboard shortcuts">
            <div className="shortcuts-pop-title">Keyboard & mouse</div>
            {SHORTCUTS.map((g) => (
              <div key={g.group} className="shortcuts-group">
                <div className="shortcuts-group-name">{g.group}</div>
                {g.items.map((it) => (
                  <div key={it.label} className="shortcuts-row">
                    <span className="shortcuts-row-keys">
                      {it.keys.map((k) => (
                        <span key={k} className="shortcuts-kbd">{k}</span>
                      ))}
                    </span>
                    <span className="shortcuts-row-label">{it.label}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
