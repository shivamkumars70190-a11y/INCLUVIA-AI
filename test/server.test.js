const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const { once } = require('node:events');
const { after, before, test } = require('node:test');
const { createServer } = require('../server');
const networkFetch = global.fetch;

let server;
let base;
const originalApiKey = process.env.GNANI_API_KEY;
const originalFetch = global.fetch;

before(async () => {
  delete process.env.GNANI_API_KEY;
  server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  global.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.GNANI_API_KEY;
  else process.env.GNANI_API_KEY = originalApiKey;
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('serves the app shell and its feature assets', async () => {
  const [page, style, script] = await Promise.all([
    fetch(`${base}/`), fetch(`${base}/styles.css`), fetch(`${base}/app.js`)
  ]);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(await page.text(), /One Intelligence\. Every Ability\./);
  assert.equal(style.status, 200);
  assert.equal(script.status, 200);
  const source = await script.text();
  for (const tool of ['drishti', 'shruti', 'gati', 'communication']) assert.ok(source.includes(tool));
});

test('client keeps Gati coordinate pairs and required speech/media controls wired', async () => {
  const source = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
  assert.match(source, /const coords=originCoords\.join\(','\)\+';'\+destCoords\.join\(','\)/);
  for (const control of ['pause-speech', 'resume-speech', 'ocr-voice', 'camera-start', 'record-start', 'record-stop']) {
    assert.ok(source.includes(`id="${control}"`), `Missing ${control} control`);
  }
  assert.match(source, /audioBufferToWav\(decoded\)/);
  assert.match(source, /Microphone access was blocked/);
});

test('returns clear configuration state and safe error when Gnani credentials are missing', async () => {
  const status = await fetch(`${base}/api/status`);
  assert.deepEqual(await status.json(), { gnaniConfigured: false });
  const response = await fetch(`${base}/api/transcribe`, { method: 'POST' });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /GNANI_API_KEY/);
});

test('rejects malformed paths and unsupported audio types', async () => {
  const malformed = await fetch(`${base}/%E0%A4%A`);
  assert.equal(malformed.status, 400);
  process.env.GNANI_API_KEY = 'test-only-placeholder';
  const form = new FormData();
  form.append('audio', new Blob(['not-real-audio'], { type: 'audio/webm' }), 'sample.webm');
  form.append('language', 'en-IN');
  const response = await fetch(`${base}/api/transcribe`, { method: 'POST', body: form });
  assert.equal(response.status, 415);
  assert.match((await response.json()).error, /format is not supported/);
});

test('accepts a 15 MB audio file and rejects a larger file before contacting Gnani', async () => {
  process.env.GNANI_API_KEY = 'test-only-placeholder';
  let forwardedBytes = 0;
  global.fetch = async (url, options) => {
    if (url !== 'https://api.vachana.ai/stt/v3') return networkFetch(url, options);
    forwardedBytes = options.body.get('audio_file').size;
    return new Response(JSON.stringify({ success: true, transcript: 'Boundary test' }), { status: 200 });
  };
  const upload = async size => {
    const form = new FormData();
    form.append('audio', new Blob([Buffer.alloc(size)], { type: 'audio/wav' }), 'sample.wav');
    form.append('language', 'en-IN');
    return fetch(`${base}/api/transcribe`, { method: 'POST', body: form });
  };
  const maxSize = 15 * 1024 * 1024;
  const accepted = await upload(maxSize);
  assert.equal(accepted.status, 200);
  assert.equal(forwardedBytes, maxSize);
  forwardedBytes = 0;
  const tooLarge = await upload(maxSize + 1);
  assert.equal(tooLarge.status, 413);
  assert.equal(forwardedBytes, 0);
});

test('sends documented multipart fields to Gnani and returns the real transcript field', async () => {
  process.env.GNANI_API_KEY = 'test-only-placeholder';
  let request;
  global.fetch = async (url, options) => {
    if (url !== 'https://api.vachana.ai/stt/v3') return networkFetch(url, options);
    request = { url, options };
    return new Response(JSON.stringify({ success: true, transcript: 'Test transcript', model: 'gnani-prisma-v2.5' }), { status: 200 });
  };
  const form = new FormData();
  form.append('audio', new Blob(['RIFF-test'], { type: 'audio/wav' }), 'sample.wav');
  form.append('language', 'hi-IN');
  const response = await fetch(`${base}/api/transcribe`, { method: 'POST', body: form });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { transcript: 'Test transcript', model: 'gnani-prisma-v2.5' });
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['X-API-Key-ID'], 'test-only-placeholder');
  assert.equal(request.options.body.get('language_code'), 'hi-IN');
  assert.equal(request.options.body.get('audio_file').name, 'sample.wav');
});

test('maps provider rate limits and malformed success responses to honest errors', async () => {
  process.env.GNANI_API_KEY = 'test-only-placeholder';
  const makeUpload = () => {
    const form = new FormData();
    form.append('audio', new Blob(['RIFF-test'], { type: 'audio/wav' }), 'sample.wav');
    form.append('language', 'en-IN');
    return form;
  };
  global.fetch = async (url, options) => url === 'https://api.vachana.ai/stt/v3'
    ? new Response(JSON.stringify({ success: false, error: { message: 'Rate limit exceeded.' } }), { status: 429 })
    : networkFetch(url, options);
  const limited = await fetch(`${base}/api/transcribe`, { method: 'POST', body: makeUpload() });
  assert.equal(limited.status, 429);
  assert.match((await limited.json()).error, /Rate limit/);
  global.fetch = async (url, options) => url === 'https://api.vachana.ai/stt/v3'
    ? new Response(JSON.stringify({ success: true }), { status: 200 })
    : networkFetch(url, options);
  const malformed = await fetch(`${base}/api/transcribe`, { method: 'POST', body: makeUpload() });
  assert.equal(malformed.status, 502);
  assert.match((await malformed.json()).error, /unexpected response/);
});
