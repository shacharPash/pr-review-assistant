import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it('includes notices for every installed lockfile package, including server-imported development tools', () => {
  execFileSync(process.execPath, ['bin/third-party-notices.mjs']);
  const output = readFileSync('client/public/THIRD_PARTY_NOTICES.txt', 'utf8');
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  let checked = 0;
  for (const relativePath of Object.keys(lock.packages)) {
    if (!relativePath || !existsSync(relativePath)) continue;
    const pkg = JSON.parse(readFileSync(resolve(relativePath, 'package.json'), 'utf8'));
    expect(output).toContain(`\n${pkg.name}@${pkg.version}\n`);
    checked++;
  }
  expect(checked).toBeGreaterThan(100);
  expect(output).toMatch(/\nvite@/);
  expect(output).toMatch(/\nopen@/);
});
