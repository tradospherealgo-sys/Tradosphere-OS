import pino from 'pino';

// Structured, correlation-friendly logger shared by every service.
// Never use console.log in service code -- import this instead.
export function createLogger(serviceName: string) {
  return pino({
    name: serviceName,
    level: process.env.LOG_LEVEL || 'info',
    base: { service: serviceName },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export type Logger = ReturnType<typeof createLogger>;
