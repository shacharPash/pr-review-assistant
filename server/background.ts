import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RotatingLog } from './services/rotatingLog.js';

const filename = process.env.PRA_LOG_FILE;
if (!filename) throw new Error('PRA_LOG_FILE is required for the background launcher.');
const log = new RotatingLog(filename);
const child = spawn(process.execPath, [fileURLToPath(new URL('./index.js', import.meta.url))], {
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', (chunk: Buffer) => log.write(chunk));
child.stderr.on('data', (chunk: Buffer) => log.write(chunk));
child.once('error', () => { log.write(Buffer.from('The background server could not start.\n')); process.exitCode = 1; });
child.once('exit', (code) => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => child.kill(signal));
}
