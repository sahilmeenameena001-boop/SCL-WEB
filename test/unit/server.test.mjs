import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppServer } from '../../app/server.mjs';

let app;
let base;
let dataDir;

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sar-unit-'));
  app = createAppServer(
    { port: 0, host: '127.0.0.1', publicOrigin: 'http://127.0.0.1', dataDir, uploadTokenSecret: 'unit-secret-abcdefghijklmnop', extensionId: 'a'.repeat(32) },
    { faults: {}, log: () => {} }
  );
  const addr = await app.listen();
  base = `http://127.0.0.1:${addr.port}`;
  app.config.publicOrigin = base;
});
after(async () => {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
});

const api = (path, { method = 'GET', token, body, headers = {} } = {}) =>
  fetch(base + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !(body instanceof Uint8Array) ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body instanceof Uint8Array ? body : body ? JSON.stringify(body) : undefined,
  });

async function newJob() {
  const r = await api('/api/jobs', { method: 'POST', body: { url: 'https://example.com/', options: { maxPages: 2 } } });
  assert.equal(r.status, 201);
  const { jobId, launchUrl } = await r.json();
  const code = new URL(launchUrl).hash.split('=')[1];
  const launch = await (await api(`/api/launch/${code}`, { method: 'POST' })).json();
  return { jobId, code, launch };
}

const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);

test('job creation needs no token, validates input and refuses other websites', async () => {
  assert.equal((await api('/api/jobs', { method: 'POST', body: { url: 'ftp://e.com' } })).status, 400);
  assert.equal((await api('/api/jobs', { method: 'POST', body: { url: 'https://e.com', options: { maxPages: -1 } } })).status, 400);
  assert.equal((await api('/api/jobs', { method: 'POST', body: { url: 'https://e.com' }, headers: { Origin: 'https://evil.example' } })).status, 403, 'cross-site browser requests are refused');
  const r = await api('/api/jobs', { method: 'POST', body: { url: 'https://e.com' } });
  assert.equal(r.status, 201, 'server-to-server calls need no token');
  assert.equal((await api('/', { headers: {} })).url.endsWith('/editor/'), true, 'the site root opens the editor');
});

test('launch codes are single use and return a job-scoped upload descriptor', async () => {
  const { jobId, code, launch } = await newJob();
  assert.equal(launch.jobId, jobId);
  assert.equal(launch.upload.endpoint, `${base}/api/capture-jobs/${jobId}`);
  assert.ok(launch.upload.expiresAt > Date.now());
  assert.equal((await api(`/api/launch/${code}`, { method: 'POST' })).status, 404);
  assert.equal((await api(`/api/launch/${code}x`, { method: 'POST', headers: { Origin: 'https://evil.example' } })).status, 403);
});

test('uploads require the job token, the extension origin and a zip body', async () => {
  const { jobId, launch } = await newJob();
  const other = await newJob();
  const put = (token, body = ZIP, headers = { 'Content-Type': 'application/zip' }) => api(`/api/capture-jobs/${jobId}/pages/home`, { method: 'PUT', token, body, headers });
  assert.equal((await put(undefined)).status, 401);
  assert.equal((await put(other.launch.upload.token)).status, 401, 'token of another job is rejected');
  assert.equal((await put(launch.controlToken)).status, 401, 'control token cannot upload');
  assert.equal((await put(launch.upload.token, ZIP, { 'Content-Type': 'application/zip', Origin: 'https://evil.example' })).status, 403);
  assert.equal((await put(launch.upload.token, new Uint8Array([1, 2, 3, 4]))).status, 400);
  assert.equal((await api(`/api/capture-jobs/${jobId}/pages/..%2Fx`, { method: 'PUT', token: launch.upload.token, body: ZIP, headers: { 'Content-Type': 'application/zip' } })).status, 400);
  const ok = await put(launch.upload.token, ZIP, { 'Content-Type': 'application/zip', Origin: `chrome-extension://${'a'.repeat(32)}` });
  assert.equal(ok.status, 200);
  assert.equal(app.store.get(jobId).status, 'capturing');
});

test('upload failures are reported as retryable 503s; cancelled jobs answer 409', async () => {
  const { jobId, launch } = await newJob();
  app.faults.failUploads = 1;
  const put = () => api(`/api/capture-jobs/${jobId}/pages/home`, { method: 'PUT', token: launch.upload.token, body: ZIP, headers: { 'Content-Type': 'application/zip' } });
  assert.equal((await put()).status, 503);
  assert.equal((await put()).status, 200, 'retry succeeds');
  const progress = await api(`/api/capture-jobs/${jobId}/progress`, { method: 'POST', token: launch.upload.token, body: { stage: 'capturing', progress: { captured: 1 } } });
  assert.deepEqual(await progress.json(), { ok: true, cancelled: false });
  assert.equal((await api(`/api/jobs/${jobId}/cancel`, { method: 'POST' })).status, 200);
  assert.equal((await put()).status, 409);
  const ack = await (await api(`/api/capture-jobs/${jobId}/progress`, { method: 'POST', token: launch.upload.token, body: {} })).json();
  assert.equal(ack.cancelled, true);
  assert.equal(app.store.get(jobId).status, 'cancelled');
});

test('status endpoint needs no token and never echoes tokens', async () => {
  const { jobId, launch } = await newJob();
  const r = await api(`/api/jobs/${jobId}`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.status, 'awaiting_extension');
  assert.equal(JSON.stringify(body).includes(launch.upload.token), false, 'tokens are never echoed');
  assert.equal((await api('/api/jobs/job_missing')).status, 404);
});

test('extension-unavailable report fails the job with a clear error', async () => {
  const { jobId, launch } = await newJob();
  await api(`/api/jobs/${jobId}/extension-unavailable`, { method: 'POST', token: launch.controlToken, body: { reason: 'not installed' } });
  const job = app.store.get(jobId);
  assert.equal(job.status, 'failed');
  assert.match(job.errors[0], /extension unavailable: not installed/);
});
