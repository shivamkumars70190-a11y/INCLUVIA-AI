const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, 'public');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

// Read a local .env file without adding a dependency; real environment values win.
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !Object.hasOwn(process.env, match[1])) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }

function send(res, status, data, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}

function multipart(buffer, contentType) {
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundary) return null;
  const marker = Buffer.from(`--${boundary[1] || boundary[2]}`);
  let cursor = buffer.indexOf(marker) + marker.length;
  while (cursor > marker.length - 1 && cursor < buffer.length) {
    if (buffer.subarray(cursor, cursor + 2).toString() === '--') break;
    if (buffer.subarray(cursor, cursor + 2).toString() === '\r\n') cursor += 2;
    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), cursor);
    if (headerEnd < 0) break;
    const headers = buffer.subarray(cursor, headerEnd).toString('utf8');
    const next = buffer.indexOf(marker, headerEnd + 4);
    if (next < 0) break;
    const dataEnd = next >= 2 && buffer.subarray(next - 2, next).toString() === '\r\n' ? next - 2 : next;
    const data = buffer.subarray(headerEnd + 4, dataEnd);
    const name = headers.match(/name="([^"]+)"/i)?.[1];
    if (name === 'audio') return { headers, data };
    const field = name === 'language' ? 'language' : null;
    if (field) return { headers, data, language: data.toString('utf8').trim() };
    cursor = next + marker.length;
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/api/status') {
    return send(res, 200, { gnaniConfigured: Boolean(process.env.GNANI_API_KEY) });
  }
  if (req.method === 'POST' && req.url === '/api/transcribe') {
    if (!process.env.GNANI_API_KEY) return send(res, 503, { error: 'Gnani Prisma is not configured yet. Add GNANI_API_KEY to your environment and restart the app.' });
    const chunks = []; let size = 0; const limit = 15 * 1024 * 1024;
    req.on('data', chunk => { size += chunk.length; if (size <= limit) chunks.push(chunk); });
    req.on('end', async () => {
      if (size > limit) return send(res, 413, { error: 'Audio must be 15 MB or smaller.' });
      try {
        const body = Buffer.concat(chunks);
        const boundary = req.headers['content-type'] || '';
        const fileMatch = boundary.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
        if (!fileMatch) return send(res, 400, { error: 'A valid audio upload is required.' });
        const marker = Buffer.from(`--${fileMatch[1] || fileMatch[2]}`);
        let cursor = body.indexOf(marker) + marker.length; let audio; let filename = 'recording.wav'; let mime = 'audio/wav'; let language = 'en-IN';
        while (cursor >= marker.length && cursor < body.length) {
          if (body.subarray(cursor, cursor + 2).toString() === '--') break;
          if (body.subarray(cursor, cursor + 2).toString() === '\r\n') cursor += 2;
          const hEnd = body.indexOf(Buffer.from('\r\n\r\n'), cursor); if (hEnd < 0) break;
          const h = body.subarray(cursor, hEnd).toString(); const next = body.indexOf(marker, hEnd + 4); if (next < 0) break;
          const end = next >= 2 && body.subarray(next - 2, next).toString() === '\r\n' ? next - 2 : next;
          const data = body.subarray(hEnd + 4, end); const name = h.match(/name="([^"]+)"/)?.[1];
          if (name === 'audio') { audio = data; filename = h.match(/filename="([^"]+)"/)?.[1] || filename; mime = h.match(/Content-Type:\s*([^\r\n]+)/i)?.[1] || mime; }
          if (name === 'language') language = data.toString('utf8').trim() || language;
          cursor = next + marker.length;
        }
        if (!audio?.length) return send(res, 400, { error: 'Choose or record an audio file first.' });
        if (!['audio/wav','audio/x-wav','audio/mpeg','audio/mp4','audio/aac','audio/ogg','audio/flac','audio/webm'].includes(mime.toLowerCase())) return send(res, 415, { error: 'This audio format is not supported by the connector.' });
        const form = new FormData(); form.append('audio_file', new Blob([audio], { type: mime }), filename); form.append('language_code', language);
        const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 45000);
        const upstream = await fetch('https://api.vachana.ai/stt/v3', { method: 'POST', headers: { 'X-API-Key-ID': process.env.GNANI_API_KEY }, body: form, signal: controller.signal }); clearTimeout(timer);
        const result = await upstream.json().catch(() => ({}));
        if (!upstream.ok) return send(res, upstream.status === 429 ? 429 : 502, { error: result?.error?.message || `Gnani returned an error (${upstream.status}). Check your key, access and available credits.` });
        if (!result.success || typeof result.transcript !== 'string') return send(res, 502, { error: 'Gnani returned an unexpected response. Please try again.' });
        return send(res, 200, { transcript: result.transcript, model: result.model || 'Gnani Prisma' });
      } catch (error) { return send(res, 502, { error: error.name === 'AbortError' ? 'The transcription request timed out.' : 'Could not reach Gnani. Check your connection and try again.' }); }
    });
    return;
  }
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed.' });
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(root + path.sep) && file !== path.join(root, 'index.html')) return send(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, data) => err ? send(res, 404, 'Not found', 'text/plain') : send(res, 200, data, types[path.extname(file)] || 'application/octet-stream'));
});

const port = Number(process.env.PORT) || 4173;
server.listen(port, () => console.log(`INCLUVIA AI is ready at http://localhost:${port}`));
