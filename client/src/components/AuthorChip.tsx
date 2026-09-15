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
      <span
        className="author-chip-avatar"
        aria-hidden="true"
      >{author.slice(0, 1).toUpperCase()}</span>
      <span className="author-chip-handle">@{author}</span>
    </a>
  );
}
