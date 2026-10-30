# Hadir (حاضر) — attendance, grades and reminders for teachers

Roll call that works with no internet. English and Arabic (RTL). No dependencies: Node 22.13+ only.

## Run it
```
npm start          # real use: starts empty, you create your teacher account on first visit
npm run demo       # optional: sample data and demo sign-in buttons (never use for real students)
npm test
```
Open http://localhost:3000 (landing page) and /app/ (the app).

Environment: `PORT`, `DATA_DIR`, `HADIR_SECRET`, `TELEGRAM_BOT_TOKEN`, `WEBHOOK_URL`, `DEMO_MODE=1`.
Phones need **HTTPS** (camera and signing keys only work on https or localhost). Put it behind Caddy or Nginx, or a tunnel such as Cloudflare Tunnel.

## Desktop app (Windows, macOS, Linux)
Hadir also ships as a desktop app. It runs the server inside the app, on your own computer, with your data in your own app-data folder. There is no hosting and no database to pay for.

- **Get the installer:** push to the `desktop` branch (or run *Build the Hadir desktop app* in GitHub, tab Actions). When it finishes, download `Hadir-Windows` from the run: `Hadir-Setup-x.y.z.exe` installs it, `Hadir-Portable-x.y.z.exe` runs without installing.
- **Build it yourself:** `cd desktop && npm install && npm run dist`.
- **Students' phones** sign class codes only on a secure **https** address. Create a free static address that points at your computer (for example an ngrok static domain: `ngrok http 3977 --url=your-name.ngrok-free.app`), then paste it in **Settings, Student address**. Join links and QR codes use it. Once a student has joined, class roll call works with no internet at all.
- **Data:** `%APPDATA%\Hadir\data\hadir.db` (Windows), `~/Library/Application Support/Hadir/data` (macOS), `~/.config/Hadir/data` (Linux). Menu: *Hadir, Back up now*.

## Educators, passwords and security
- Any educator can create an account (Settings, Educators, lets the owner close sign-up). The first account is the **owner**. Each educator sees only their own classes, students, grades and messages, and gets a portal tailored to them: title, university, subjects, colour, defaults for new classes, and a welcome note students see when they join.
- **Forgot password:** every educator is shown a **recovery code** at sign-up. *Forgot your password?* takes the email, that code and a new password, then issues a fresh code. If the code is lost, the owner issues a one-time code (Settings, Educators, Reset code). If the owner is locked out: `node scripts/reset-password.mjs <email> [path-to-hadir.db]` prints a one-time code.
- **Hardening:** passwords are scrypt-hashed and checked for strength; eight wrong passwords lock an account for ten minutes; changing or resetting a password signs out every other device; sessions last 7 days for educators; requests must carry the right Host and Origin; request sizes are capped; strict CSP, no third-party requests (fonts are bundled); each educator's audit log and exports are their own, and the whole-database backup is owner-only.

## How a class works
1. Classes → create a group → **Import students** (paste a list: ID, name). Each student gets an invite code.
2. The student opens the app on any phone (Android or iPhone), joins with the code, and gets a QR that changes every 30 s, signed by that phone's own key.
3. Today → **Start roll call**. Scan each student's QR with your phone. It works offline: codes are verified on your phone and sent to the server later (the sync pill shows the queue).
4. Closing the session marks everyone unscanned as absent; rules then send alerts, and approvals wait in Automation.

Scanner: uses the built-in detector on Chrome/Android, and a bundled decoder on iPhone and Firefox.
