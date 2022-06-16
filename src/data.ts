import assert from 'assert';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { generators } from 'openid-client';
import { join, resolve } from 'path';
import fileStoreFactory from 'session-file-store';
import session, { Store } from 'express-session';
import { CONFIG } from './config';

export let sessionSecret: string;
export let sessionPath: string;
export let sessionStore: Store;

export function initializeData(path: string) {
  path = resolve(path);

  if (!existsSync(path)) {
    mkdirSync(path);
  }

  assert(lstatSync(path).isDirectory(), `${path} must be a directory!`);

  sessionPath = join(path, 'session');

  if (!existsSync(sessionPath)) {
    mkdirSync(sessionPath);
  }

  assert(lstatSync(sessionPath).isDirectory(), `${sessionPath} must be a directory!`);

  const secretPath = join(sessionPath, 'secret');

  if (!existsSync(secretPath)) {
    sessionSecret = generators.random(32);
    writeFileSync(secretPath, sessionSecret, 'utf-8');
  } else {
    assert(!lstatSync(secretPath).isDirectory(), `${secretPath} must be a file!`);

    sessionSecret = readFileSync(secretPath, 'utf-8');
  }

  const FileStore = fileStoreFactory(session);

  sessionStore = new FileStore({
    path: join(sessionPath, 'file-storage'),
    ttl: CONFIG.session.ttl,
  });
}
