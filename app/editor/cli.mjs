// `npm run editor`: builds the editor UI when its sources changed, starts the app server and prints
// the editor's address.
// Usage: npm run editor -- [--project <projectId>] [--port <port>] [--data-dir <dir>] [--rebuild]
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

console.log(`\nSite editor running on ${app.editor.editorUrl(project)}\n`);

// Open keep-alive connections from the editor would delay server.close(): exit directly.
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0));
