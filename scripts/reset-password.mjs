// Offline reset for an educator who has lost both the password and the recovery code (for example the owner).
// Needs access to the computer, which is the point: it prints a one-time code that works for 24 hours.
//   node scripts/reset-password.mjs <email> [path-to-hadir.db]
// Windows data file:  %APPDATA%\Hadir\data\hadir.db     macOS: ~/Library/Application Support/Hadir/data/hadir.db     Linux: ~/.config/Hadir/data/hadir.db
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../server/db.js';
import { uid, hashPassword, recoveryCode, normalizeRecovery } from '../server/util.js';

const email = String(process.argv[2] || '').toLowerCase();
const defaults = { win32: path.join(process.env.APPDATA || '', 'Hadir', 'data', 'hadir.db'), darwin: path.join(os.homedir(), 'Library', 'Application Support', 'Hadir', 'data', 'hadir.db') };
const file = process.argv[3] || defaults[process.platform] || path.join(os.homedir(), '.config', 'Hadir', 'data', 'hadir.db');
if (!email) { console.error('Usage: node scripts/reset-password.mjs <email> [path-to-hadir.db]'); process.exit(1); }
const db = openDb(file);
const u = db.get("SELECT * FROM users WHERE login = ? AND role IN ('teacher','admin')", email);
if (!u) { console.error(`No educator with the email ${email} in ${file}`); process.exit(1); }
const code = recoveryCode();
db.run('INSERT INTO password_resets (id, user_id, code_hash, issued_by, expires_at, created_at) VALUES (?,?,?,?,?,?)', uid(), u.id, hashPassword(normalizeRecovery(code)), null, Date.now() + 24 * 3600e3, Date.now());
db.run('UPDATE users SET failed_logins = 0, locked_until = 0 WHERE id = ?', u.id);
db.audit(null, 'educator.reset_code.local', 'user', u.id);
console.log(`\nOne-time code for ${u.full_name} <${email}> (valid 24 hours):\n\n  ${code}\n\nOpen Hadir, choose "Forgot your password?", enter the email and this code, then a new password.\n`);
db.close();
