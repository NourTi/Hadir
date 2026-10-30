import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { App } from './http.js';
import { openDb } from './db.js';
import { createEngine } from './engine.js';
import { registerCore } from './routes-core.js';
import { registerMore } from './routes-more.js';
import { registerAccounts } from './routes-accounts.js';
import { seedDemo } from './seed.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function createServer(opts = {}) {
  const dataDir = opts.dataDir ?? process.env.DATA_DIR ?? path.join(root, 'data');
  const dbFile = opts.dbFile ?? (dataDir === ':memory:' ? ':memory:' : path.join(dataDir, 'hadir.db'));
  const db = openDb(dbFile);
  let secret = opts.secret ?? process.env.HADIR_SECRET ?? db.kvGet('secret');
  if (!secret) { secret = crypto.randomBytes(32).toString('hex'); db.kvSet('secret', secret); }
  const base = dbFile === ':memory:' ? fs.mkdtempSync(path.join(os.tmpdir(), 'hadir-')) : dataDir;
  const cfg = {
    secret, demo: opts.demo ?? /^(1|true)$/i.test(process.env.DEMO_MODE || ''),
    desktop: opts.desktop ?? /^(1|true)$/i.test(process.env.HADIR_DESKTOP || ''),
    telegramToken: opts.telegramToken ?? process.env.TELEGRAM_BOT_TOKEN ?? '', webhookUrl: opts.webhookUrl ?? process.env.WEBHOOK_URL ?? '',
    uploadDir: path.join(base, 'uploads'), backupDir: path.join(base, 'backups'),
  };
  const engine = createEngine(db, { ...cfg, fetch: opts.fetch, log: (...a) => console.error(...a) });
  const extraHosts = String(opts.allowedHosts ?? process.env.HADIR_ALLOWED_HOSTS ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const app = new App({ publicDir: path.join(root, 'public'), strictHost: opts.strictHost ?? (cfg.desktop || /^(1|true)$/i.test(process.env.HADIR_STRICT_HOST || '')), allowedHosts: extraHosts });
  const ctx = { db, engine, cfg };
  registerCore(app, ctx);
  registerMore(app, ctx);
  registerAccounts(app, ctx);
  const savedUrl = db.kvGet('public_url') || process.env.HADIR_PUBLIC_URL || '';
  if (savedUrl) { try { app.allowedHosts.add(new URL(savedUrl).host.toLowerCase()); app.allowedHosts.add(new URL(savedUrl).hostname.toLowerCase()); } catch { /* ignore a bad value */ } }
  if (cfg.demo) await seedDemo(db, engine);
  if (!opts.noScheduler) engine.start();
  return { app, db, engine, cfg, async stop() { engine.stop(); await app.close(); db.close(); } };
}
