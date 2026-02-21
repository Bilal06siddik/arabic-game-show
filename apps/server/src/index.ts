import { createAppRuntime } from './create-server.js';
import { logger } from './lib/logger.js';

const port = Number(process.env.PORT ?? 4000);
const runtime = createAppRuntime();

runtime.httpServer.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    logger.error('server_port_in_use', {
      port,
      hint:
        'Port is already in use. Stop the other process or run with a different port (PowerShell: $env:PORT=4001; npm run host).',
    });
    process.exit(1);
    return;
  }

  logger.error('server_start_failed', {
    port,
    code: error.code,
    message: error.message,
  });
  process.exit(1);
});

runtime.httpServer.listen(port, () => {
  logger.info('server_started', { port });
});

process.on('SIGINT', async () => {
  logger.info('server_shutdown', { signal: 'SIGINT' });
  await runtime.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('server_shutdown', { signal: 'SIGTERM' });
  await runtime.close();
  process.exit(0);
});
