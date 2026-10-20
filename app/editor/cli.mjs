// `npm run editor`: builds the editor UI when its sources changed, starts the app server and prints
// a one-time login link for the visual editor.
// Usage: npm run editor -- [--project <projectId>] [--port <port>] [--data-dir <dir>] [--rebuild]
import { join } from 'node:path';
import { createAppServer } from '../server.mjs';
import { buildEditor, editorBuildIsStale } from './build.mjs';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

if (process.argv.includes('--help')) {
  console.log('Usage: npm run editor -- [--project <projectId>] [--port <port>] [--data-dir <dir>] [--rebuild]');
  process.exit(0);
}

if (process.argv.includes('--rebuild') || editorBuildIsStale()) await buildEditor({ log: console.log });

const overrides = {};
if (arg('port')) overrides.port = Number(arg('port'));
if (arg('data-dir')) overrides.dataDir = arg('data-dir');
const app = createAppServer(overrides);
await app.listen();

const project = arg('project');
if (project) app.editor.store.check(project);
const link = () => app.editor.createLaunchUrl(project);

console.log(`\nVisual editor running on ${app.config.publicOrigin}/editor/`);
console.log(`\n  Login link (single use, expires in ${Math.round(app.config.launchCodeTtlMs / 60_000)} min):\n\n  ${link()}\n`);
console.log(`Press "l" + Enter for a new login link. Alternatively sign in with the application API token`);
console.log(`stored in ${join(app.config.dataDir, 'secrets.json')} (or SAR_APP_API_TOKEN).`);

process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  if (d.trim().toLowerCase() === 'l') console.log(`\n  ${link()}\n`);
});
// Open keep-alive connections from the editor would delay server.close(): exit directly.
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0));
