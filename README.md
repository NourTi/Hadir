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

## How a class works
1. Classes → create a group → **Import students** (paste a list: ID, name). Each student gets an invite code.
2. The student opens the app on any phone (Android or iPhone), joins with the code, and gets a QR that changes every 30 s, signed by that phone's own key.
3. Today → **Start roll call**. Scan each student's QR with your phone. It works offline: codes are verified on your phone and sent to the server later (the sync pill shows the queue).
4. Closing the session marks everyone unscanned as absent; rules then send alerts, and approvals wait in Automation.

Scanner: uses the built-in detector on Chrome/Android, and a bundled decoder on iPhone and Firefox.
