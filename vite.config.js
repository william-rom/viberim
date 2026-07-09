import { defineConfig } from 'vite';
import { writeFileSync, readFileSync, mkdirSync, existsSync, appendFileSync } from 'fs';
import { dirname } from 'path';

const LOG_DIR = './.devlogs';
const LOG_FILE = './.devlogs/browser.log';

// Vite plugin: exposes a POST /__log endpoint that appends browser console
// output to a file, so the agent can read it without the user copy-pasting.
function browserLogCapture() {
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    if (!existsSync(LOG_FILE)) writeFileSync(LOG_FILE, '');
  } catch {}
  return {
    name: 'browser-log-capture',
    configureServer(server) {
      server.middlewares.use('/__log', (req, res) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', () => {
            try {
              const entry = JSON.parse(body);
              const line = `[${new Date(entry.time).toISOString()}] ${entry.level}: ${entry.msg}\n`;
              appendFileSync(LOG_FILE, line);
            } catch {}
            res.statusCode = 204;
            res.end();
          });
        } else if (req.method === 'GET') {
          try {
            const content = existsSync(LOG_FILE) ? readFileSync(LOG_FILE, 'utf8') : '(no logs yet)';
            res.setHeader('Content-Type', 'text/plain');
            res.end(content);
          } catch (e) {
            res.statusCode = 500;
            res.end(String(e));
          }
        } else {
          res.statusCode = 405;
          res.end();
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [browserLogCapture()],
  server: {
    open: true,
    host: true,
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 1500,
  },
});
