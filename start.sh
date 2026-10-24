#!/bin/sh
command -v node >/dev/null || { echo "Install Node.js 22.13 or newer from https://nodejs.org"; exit 1; }
(sleep 2; (xdg-open http://localhost:3000 || open http://localhost:3000) >/dev/null 2>&1) &
exec node --disable-warning=ExperimentalWarning server/index.js
