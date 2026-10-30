import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';

export class HttpError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}
export const bad = (code, message) => new HttpError(400, code, message);
export const unauthorized = (code = 'unauthorized', message = 'Sign in to continue.') => new HttpError(401, code, message);
export const forbidden = (code = 'forbidden', message = 'You do not have access to this.') => new HttpError(403, code, message);
export const notFound = (code = 'not_found', message = 'Not found.') => new HttpError(404, code, message);
export const conflict = (code, message) => new HttpError(409, code, message);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  "font-src 'self'", "img-src 'self' data: blob:", "connect-src 'self'",
  "media-src 'self' blob:", "worker-src 'self'", "manifest-src 'self'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
].join('; ');

export class App {
  constructor({ publicDir, maxBody = 256 * 1024, bigBody = 6 * 1024 * 1024, bigPaths = ['/api/excuses'], strictHost = false, allowedHosts = [] }) {
    this.routes = [];
    this.publicDir = publicDir;
    this.maxBody = maxBody; this.bigBody = bigBody; this.bigPaths = bigPaths;
    this.strictHost = strictHost; this.allowedHosts = new Set(allowedHosts.map((x) => x.toLowerCase()));
  }
  // Refuse requests that were not meant for this server. A web page on another site cannot reach a local Hadir through DNS tricks,
  // because the Host header must be localhost, an IP address, a .local name, or a name the owner listed.
  hostOk(req) {
    const raw = String(req.headers.host || '').toLowerCase();
    const host = raw.startsWith('[') ? raw.slice(0, raw.indexOf(']') + 1) : raw.replace(/:\d+$/, '');
    if (!this.strictHost) return !!host;
    return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[') || this.allowedHosts.has(host);
  }
  originOk(req) {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return true;
    const origin = req.headers.origin;
    if (!origin) return true;
    try { return new URL(origin).host.toLowerCase() === String(req.headers.host || '').toLowerCase(); } catch { return false; }
  }
  route(method, pattern, ...handlers) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:([A-Za-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, handlers });
  }
  get(p, ...h) { this.route('GET', p, ...h); }
  post(p, ...h) { this.route('POST', p, ...h); }
  put(p, ...h) { this.route('PUT', p, ...h); }
  patch(p, ...h) { this.route('PATCH', p, ...h); }
  del(p, ...h) { this.route('DELETE', p, ...h); }

  readBody(req) {
    const cap = this.bigPaths.includes(req.path) ? this.bigBody : this.maxBody;
    return new Promise((resolve, reject) => {
      const chunks = []; let size = 0, over = false;
      req.on('data', (c) => {
        if (over) return;
        size += c.length;
        if (size > cap) { over = true; chunks.length = 0; reject(new HttpError(413, 'too_large', 'That upload is too large.')); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (over) return;
        if (!chunks.length) return resolve({});
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(bad('bad_json', 'The request body is not valid JSON.')); }
      });
      req.on('error', reject);
    });
  }

  attach(res) {
    res.json = (data, status = 200) => {
      const body = JSON.stringify(data);
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
      res.end(body);
    };
  }

  async handle(req, res) {
    this.attach(res);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(), microphone=(), payment=(), usb=()');
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https') res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    try {
      if (!this.hostOk(req)) throw new HttpError(421, 'bad_host', 'This address is not allowed.');
      if (!this.originOk(req)) throw new HttpError(403, 'bad_origin', 'This request came from another site.');
      const url = new URL(req.url, 'http://localhost');
      req.path = decodeURIComponent(url.pathname);
      req.query = Object.fromEntries(url.searchParams);
      req.ip = req.socket.remoteAddress;
      // Behind a tunnel on this same computer every request arrives from loopback, so trust the forwarded address only then.
      if (/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(req.ip) && req.headers['x-forwarded-for']) req.ip = String(req.headers['x-forwarded-for']).split(',')[0].trim().slice(0, 64);
      if (req.path.startsWith('/api/')) return await this.api(req, res);
      return this.serveStatic(req, res);
    } catch (e) {
      this.fail(res, e);
    }
  }

  async api(req, res) {
    for (const r of this.routes) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(req.path);
      if (!m) continue;
      req.params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      if (req.method !== 'GET' && req.method !== 'DELETE') req.body = await this.readBody(req); else req.body = {};
      for (const h of r.handlers) {
        const out = await h(req, res);
        if (res.writableEnded) return;
        if (out !== undefined) return res.json(out);
      }
      if (!res.writableEnded) res.json({ ok: true });
      return;
    }
    throw notFound('no_route', 'No such API route.');
  }

  fail(res, e) {
    if (res.headersSent) { res.end(); return; }
    if (e instanceof HttpError) return res.json({ error: e.code, message: e.message }, e.status);
    console.error(e);
    res.json({ error: 'server_error', message: 'Something went wrong on the server.' }, 500);
  }

  serveStatic(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method_not_allowed', 'Method not allowed.');
    let rel = req.path;
    if (!rel.endsWith('/') && !path.extname(rel)) { // /download -> /download/
      try { if (fs.statSync(path.normalize(path.join(this.publicDir, rel))).isDirectory()) { res.writeHead(301, { Location: rel + '/' }); return res.end(); } } catch { /* fall through to not found */ }
    }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(this.publicDir, rel));
    if (!file.startsWith(this.publicDir + path.sep)) throw notFound();
    let st;
    try { st = fs.statSync(file); } catch { throw notFound('not_found', 'Page not found.'); }
    if (!st.isFile()) throw notFound();
    const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end(); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size, ETag: etag, 'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  }

  listen(port, host = '0.0.0.0', tls = null) {
    this.server = (tls ? https.createServer(tls, (req, res) => this.handle(req, res)) : http.createServer((req, res) => this.handle(req, res)));
    this.server.requestTimeout = 30000; this.server.headersTimeout = 15000; this.server.maxHeadersCount = 60;
    return new Promise((resolve) => this.server.listen(port, host, () => resolve(this.server)));
  }
  close() { return new Promise((r) => (this.server ? this.server.close(() => r()) : r())); }
}
