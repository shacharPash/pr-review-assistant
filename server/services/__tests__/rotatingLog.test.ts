import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RotatingLog } from '../rotatingLog.js';

describe('background log retention', () => {
  it('bounds a long-running log even when one write exceeds a segment', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pra-log-test-'));
    try {
      const filename = join(directory, 'app.log');
      const log = new RotatingLog(filename, 10);
      log.write(Buffer.from('1234567890123456789012345'));
      expect(readdirSync(directory).sort()).toEqual(['app.log', 'app.log.1']);
      expect(statSync(filename).size).toBe(5);
      expect(statSync(`${filename}.1`).size).toBe(10);
      log.write(Buffer.from('last'));
      expect(readFileSync(filename, 'utf8')).toBe('12345last');
      if (process.platform !== 'win32') expect(statSync(filename).mode & 0o777).toBe(0o600);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
