import { createServer } from './app.js';

const port = Number(process.env.PORT || 3000);
const srv = await createServer();
await srv.app.listen(port);
const url = `http://localhost:${port}`;
console.log(`\n  Hadir is running\n  Landing page  ${url}\n  App           ${url}/app/${srv.cfg.demo ? '\n  Demo mode     on (sample data, demo sign-in buttons)' : ''}\n`);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await srv.stop(); process.exit(0); });
