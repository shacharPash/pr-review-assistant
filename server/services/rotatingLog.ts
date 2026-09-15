import { closeSync, openSync, readSync, appendFileSync, chmodSync, existsSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';

/** Keep the current log and one prior segment, both private to the local user. */
export class RotatingLog {
  constructor(private readonly filename: string, private readonly maxBytes = 5 * 1024 * 1024) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Log segment limit must be a positive integer.');
    for (const segment of [filename, `${filename}.1`]) {
      if (!existsSync(segment)) continue;
      chmodSync(segment, 0o600);
      const size = statSync(segment).size;
      if (size <= maxBytes) continue;
      // Read only the allowed tail, even when upgrading an enormous old log.
      const tail = Buffer.alloc(maxBytes);
      const fd = openSync(segment, 'r');
      try { readSync(fd, tail, 0, maxBytes, size - maxBytes); }
      finally { closeSync(fd); }
      writeFileSync(segment, tail, { mode: 0o600 });
    }
  }

  write(chunk: Buffer): void {
    for (let offset = 0; offset < chunk.length;) {
      let size = existsSync(this.filename) ? statSync(this.filename).size : 0;
      if (size >= this.maxBytes) {
        rmSync(`${this.filename}.1`, { force: true });
        renameSync(this.filename, `${this.filename}.1`);
        chmodSync(`${this.filename}.1`, 0o600);
        size = 0;
      }
      if (!existsSync(this.filename)) writeFileSync(this.filename, '', { mode: 0o600 });
      chmodSync(this.filename, 0o600);
      const end = Math.min(chunk.length, offset + this.maxBytes - size);
      appendFileSync(this.filename, chunk.subarray(offset, end));
      offset = end;
    }
  }
}
