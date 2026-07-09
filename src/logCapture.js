// Client-side log capture: forwards console.error and unhandled errors to the
// Vite dev server so the agent can read them from a file.
// Dev-only — in production (vite build) import.meta.env.DEV is false and the
// minifier strips this entire block, so no failed POST /__log requests fire.
if (import.meta.env.DEV) {
  const ENDPOINT = '/__log';

  function send(level, msg) {
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, msg, time: Date.now() }),
      }).catch(() => {});
    } catch {}
  }

  // Capture console.error.
  const origError = console.error;
  console.error = function (...args) {
    const msg = args
      .map((a) => {
        if (a instanceof Error) return a.stack || a.message;
        if (typeof a === 'object') {
          try { return JSON.stringify(a); } catch { return String(a); }
        }
        return String(a);
      })
      .join(' ');
    send('error', msg);
    origError.apply(console, args);
  };

  // Capture console.warn too.
  const origWarn = console.warn;
  console.warn = function (...args) {
    const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    send('warn', msg);
    origWarn.apply(console, args);
  };

  // Capture unhandled errors.
  window.addEventListener('error', (e) => {
    send('error', `Unhandled: ${e.message} at ${e.filename}:${e.lineno}:${e.colno}`);
  });

  // Capture unhandled promise rejections.
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason instanceof Error ? e.reason.stack || e.reason.message : String(e.reason);
    send('error', `UnhandledRejection: ${reason}`);
  });

  // Signal that capture is active.
  send('info', 'Browser log capture active.');
}
