import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.logLevel,
  base: { service: env.serviceName },
  // Redact headers sensibles de los logs
  redact: ['req.headers["x-api-key"]'],
  transport: env.nodeEnv === 'development'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard'
        }
      }
    : undefined
});
