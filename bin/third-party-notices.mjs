import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const sections = ['Third-party notices for the all installed dependencies (runtime, development and build tools).\nGenerated from package-lock.json and the installed packages.\nOriginal license and notice text is reproduced below.'];
for (const [relativePath, entry] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
  if (!relativePath) continue;
  const directory = path.join(root, relativePath);
  if (!fs.existsSync(directory)) continue; // Optional dependencies for another platform.
  const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  sections.push(`\n${'='.repeat(72)}\n${pkg.name}@${pkg.version}\nLicense: ${JSON.stringify(pkg.license ?? entry.license ?? 'See package notices')}\nSource: ${typeof pkg.repository === 'object' ? pkg.repository.url : pkg.repository ?? pkg.homepage ?? ''}`);
  const files = fs.readdirSync(directory).filter((name) => /^(licen[cs]e|copying|notice|thirdpartynotices)([._-]|$)/i.test(name));
  for (const name of files.sort()) {
    const filename = path.join(directory, name);
    if (fs.statSync(filename).isFile()) sections.push(`\n--- ${name} ---\n${fs.readFileSync(filename, 'utf8')}`);
  }
  if (!files.length) sections.push(`License text is supplied by the upstream package: ${pkg.homepage ?? pkg.name}.`);
}
const output = path.join(root, 'client/public/THIRD_PARTY_NOTICES.txt');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, sections.join('\n') + '\n');
console.log('Generated third-party notices for the local build.');

fs.copyFileSync(path.join(root, 'PRIVACY.md'), path.join(root, 'client/public/PRIVACY.md'));
