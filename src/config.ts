import { Command } from 'commander';
import { resolve, join } from 'path';
import { Property as p, loadConfig } from '@entwico/node-config';

class ConfigServer {
  @p() baseUrl: string;
  @p() port: number;
  @p() behindProxy: boolean;
}

class ConfigLogs {
  @p() level: string;
  @p() format: 'json' | 'simple';
}

class ConfigSessionCookie {
  @p() name: string;
  @p() secure: boolean;
  @p() sameSite: 'none' | 'lax' | 'strict';
}

class ConfigSession {
  @p() ttl: number;
  @p() cookie: ConfigSessionCookie;
}

class ConfigData {
  @p() path: string;
}

class ConfigOidc {
  @p() providerUrl: string;
  @p() audience: string;
  @p() scope: string;
  @p() clientId: string;
  @p() clientSecret: string;
}

class ConfigSpaProxy {
  @p() config: { [prop: string]: any };
  @p() configPath: string;
}

class ConfigSpa {
  @p() staticFilesPath: string;
  @p() proxy: ConfigSpaProxy;
}

export class Config {
  @p() server: ConfigServer;
  @p() logs: ConfigLogs;
  @p() data: ConfigData;
  @p() spa: ConfigSpa;
  @p() session: ConfigSession;
  @p() oidc: ConfigOidc;
}

interface CliOptions {
  envPrefix?: string;
  config: string[];
}

const commander = new Command();

commander
  .name('SPA Resort')
  .description('A place where a Single Page Application can rest');

commander.option('-e, --env-prefix <string>', 'prefix for the configuration environment variables, default "SPA_"');
commander.requiredOption('-c, --config <paths...>', 'specify configuration files path(s)');

commander.parse(process.argv);

const options = commander.opts<CliOptions>();

const config = loadConfig(Config, {
  env: { prefix: options.envPrefix ?? 'SPA_' },
  files: [join(__dirname, '..', 'default-config.yaml'), ...options.config].map(configPath => resolve(configPath)),
});

export const CONFIG = config;
