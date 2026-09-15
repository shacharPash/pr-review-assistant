import { appendFileSync, chmodSync, existsSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';

/** Keep the current log and one prior segment, both private to the local user. */
export class RotatingLog {
  constructor(private readonly filename: string, private readonly maxBytes = 5 * 1024 * 1024) {}

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
