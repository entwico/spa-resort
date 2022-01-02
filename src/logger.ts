import winston from 'winston';
import { CONFIG } from './config';

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  http: 4,
};

const level = () => CONFIG.logs.level ?? 'info';

winston.addColors({
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'magenta',
  http: 'blue',
});

const format = CONFIG.logs.format === 'json' ?
  winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ) : winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.simple(),
  );

const transports = [
  new winston.transports.Console(),
];

export const LOGGER = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
});
