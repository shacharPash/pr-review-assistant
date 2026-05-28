import { useStore } from '../state/store.js';

export function AuthorChip() {
  const author = useStore((s) => s.bundle?.meta.author);
  if (!author) return null;
  return (
    <a
      className="author-chip"
      href={`https://github.com/${encodeURIComponent(author)}`}
      target="_blank"
      rel="noreferrer"
      title={`Open @${author} on GitHub`}
    >
      <img
        className="author-chip-avatar"
        src={`https://github.com/${encodeURIComponent(author)}.png?size=40`}
        alt=""
        loading="lazy"
      />
      <span className="author-chip-handle">@{author}</span>
    </a>
  );
}
