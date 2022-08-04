import { Command } from 'commander';
import { resolve, join } from 'path';
import { Property, List, loadConfig } from '@entwico/node-config';

class ConfigServer {
  @Property() baseUrl: string;
  @Property() port: number;
  @Property() behindProxy: boolean;
}

class ConfigLogs {
  @Property() level: string;
  @Property() format: 'json' | 'simple';
}

class ConfigSessionCookie {
  @Property() name: string;
  @Property() secure: boolean;
  @Property() sameSite: 'none' | 'lax' | 'strict';
}

class ConfigSession {
  @Property() ttl: number;
  @Property() cookie: ConfigSessionCookie;
}

class ConfigData {
  @Property() path: string;
}

class ConfigOidc {
  @Property() providerUrl: string;
  @Property() audience: string;
  @Property() scope: string;
  @Property() clientId: string;
  @Property() clientSecret: string;
}

class ConfigSpaProxy {
  @Property() config: { [prop: string]: any };
  @Property() configPath: string;
}

class ConfigSpa {
  @Property() staticFilesPath: string;
  @List(String) publicPaths: string[];
  @Property() proxy: ConfigSpaProxy;
}

export class Config {
  @Property() server: ConfigServer;
  @Property() logs: ConfigLogs;
  @Property() data: ConfigData;
  @Property() spa: ConfigSpa;
  @Property() session: ConfigSession;
  @Property() oidc: ConfigOidc;
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
