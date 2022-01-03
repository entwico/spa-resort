import { Command } from 'commander';
import { readFileSync } from 'fs';
import { merge } from 'lodash';
import { extname, join, resolve } from 'path';
import { parse as parseYaml } from 'yaml';

interface CliOptions { configPath: string[]; }

const commander = new Command();

commander.requiredOption('-c, --configPath <paths...>', 'specify configuration files path(s)');
commander.parse(process.argv);

function readConfigFile(path: string) {
  path = resolve(path);

  switch (extname(path)) {
    case '.yml': case '.yaml': return parseYaml(readFileSync(path, 'utf8'));
    case '.js': case '.json': return require(path);
    default: throw new Error('Config file format unknown for ' + path);
  }
}

const paths = [
  join(__dirname, '..', 'default-config.yaml'),
  ...commander.opts<CliOptions>().configPath,
];

export const CONFIG: {
  server: {
    baseUrl: string;
    behindProxy: boolean;
    port: number;
  };
  logs: {
    level: string;
    format: string;
  };
  data: {
    path: string;
  };
  spa: {
    staticFilesPath: string;
    proxy: {
      config: string;
      configPath: string;
    }
  };
  oidc: {
    providerUrl: string;
    clientId: string;
    clientSecret: string;
    audience: string;
    scope: string;
  };
  session: {
    ttl: number;
    cookie: {
      secure: boolean;
    };
  };
} = paths.reduce((res, p) => merge(res, readConfigFile(p)), {});

// TODO validate config
