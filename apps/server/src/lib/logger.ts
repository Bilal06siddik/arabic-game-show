export type LogLevel = 'info' | 'warn' | 'error';

function write(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(data ?? {}),
  };
  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

export const logger = {
  info: (message: string, data?: Record<string, unknown>) => write('info', message, data),
  warn: (message: string, data?: Record<string, unknown>) => write('warn', message, data),
  error: (message: string, data?: Record<string, unknown>) => write('error', message, data),
};