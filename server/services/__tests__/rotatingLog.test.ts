import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

it('normalizes both oversized pre-existing segments on startup with private permissions', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pra-log-upgrade-'));
  try {
    const filename = join(directory, 'app.log');
    writeFileSync(filename, 'older content:1234567890', { mode: 0o644 });
    writeFileSync(`${filename}.1`, 'previous content:abcdefghij', { mode: 0o644 });
    const log = new RotatingLog(filename, 10);
    expect(readFileSync(filename, 'utf8')).toBe('1234567890');
    expect(readFileSync(`${filename}.1`, 'utf8')).toBe('abcdefghij');
    for (const segment of [filename, `${filename}.1`]) expect(statSync(segment).mode & 0o777).toBe(0o600);
    log.write(Buffer.from('startup'));
    expect(readFileSync(`${filename}.1`, 'utf8')).toBe('1234567890');
    expect(statSync(filename).size).toBeLessThanOrEqual(10);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
