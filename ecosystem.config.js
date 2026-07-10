// Optional process supervisor for the ingest worker (`npm run worker:inbox`
// still works standalone for local/manual runs — this just adds automatic
// restart on crash for anyone leaving it running unattended).
//
// Spawns `node --env-file=.env --import tsx scripts/inbox-worker.ts`
// directly (same command as the worker:inbox npm script) rather than
// wrapping `npm run`, which pm2 resolves unreliably on Windows.
//
// Usage: npm run worker:pm2:start / :stop / :logs
module.exports = {
  apps: [
    {
      name: "inbox-worker",
      script: "scripts/inbox-worker.ts",
      interpreter: "node",
      interpreter_args: "--env-file=.env --import tsx",
      cwd: __dirname,
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 20,
    },
  ],
};
