import { createAppRuntime } from './create-server.js';
import { logger } from './lib/logger.js';

const port = Number(process.env.PORT ?? 4000);
const runtime = createAppRuntime();

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