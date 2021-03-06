#!/usr/bin/env node

import 'reflect-metadata';

import express, { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import bodyParser from 'body-parser';
import session from 'express-session';
import expressStaticGzip from 'express-static-gzip';
import { createProxyMiddleware } from 'http-proxy-middleware';
import morgan from 'morgan';
import { resolve } from 'path';
import { CONFIG } from './config';
import { initializeData, sessionSecret, sessionStore } from './data';
import { LOGGER } from './logger';
import { OIDC } from './oidc';
import { getSessionFromRequest } from './session';

initializeData(CONFIG.data.path);

const oidc = new OIDC();

oidc.initialize();

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.disable('x-powered-by');

if (CONFIG.server.behindProxy) {
  app.set('trust proxy', true);
}

// w/o session

app.use(morgan(':method :url :status :res[content-length] - :response-time ms', {
  stream: {
    write: (message) => LOGGER.http(message.replace(/\n$/, '')),
  },
}));

app.get('/resort/health', asyncHandler(async (_req, res) => {
  res.status(200).end();
}));

app.post('/resort/oidc/back-channel-logout', asyncHandler(async (req, res) => await oidc.processBackChannelLogout(req, res)));

// w/ session

app.use(session({
  store: sessionStore,
  secret: sessionSecret,
  proxy: CONFIG.server.behindProxy,
  name: CONFIG.session.cookie.name,
  cookie: {
    secure: CONFIG.session.cookie.secure,
    sameSite: 'lax',
    maxAge: CONFIG.session.ttl * 1e3,
  },
  resave: false,
  saveUninitialized: true,
}));

app.get('/resort/oidc/callback', asyncHandler(async (req, res) => await oidc.processLoginCallback(req, res)));

app.get('/resort/oidc/logout', asyncHandler(async (req, res) => await oidc.initiateLogoutFlow(req, res)));

app.get('/resort/oidc/front-channel-logout', asyncHandler(async (req, res) => await oidc.processFrontChannelLogout(req, res)));

app.get('/resort/oidc/post-logout', asyncHandler(async (req, res) => await oidc.processLogoutCallback(req, res)));

app.get('/resort/oidc/access-token', asyncHandler(async (req, res) => await oidc.getAccessToken(req, res)));

app.get('/resort/oidc/userinfo', asyncHandler(async (req, res) => await oidc.getUserinfo(req, res)));

app.use((req, res, next) => {
  const session = getSessionFromRequest(req);

  if (!session.idToken) {
    oidc.initiateLoginFlow(req, res, req.url).catch(next);
  } else {
    session.touch();
    next();
  }
});

if (CONFIG.spa.proxy.config || !!CONFIG.spa.proxy.configPath) {
  const proxyConfig = CONFIG.spa.proxy.config || require(resolve(CONFIG.spa.proxy.configPath));

  Object.keys(proxyConfig).forEach(path => {
    LOGGER.info('Proxying requests', { path, to: proxyConfig[path].target });

    // important to proxy to multiple websockets https://github.com/chimurai/http-proxy-middleware/issues/463#issuecomment-676630189
    // can cause performance issues?
    app.use(createProxyMiddleware(path, {
      ...proxyConfig[path],
      logLevel: 'silent',
      onError: e => LOGGER.error('Proxy error', e),
    }));
  });
}

if (CONFIG.spa.staticFilesPath) {
  LOGGER.info('Serving static files', { location: CONFIG.spa.staticFilesPath });

  app.use(expressStaticGzip(resolve(CONFIG.spa.staticFilesPath), {
    enableBrotli: true,
    orderPreference: ['br'],
  }));
}

app.get('*', (req, res) => {
  res.status(200).sendFile(resolve(CONFIG.spa.staticFilesPath, 'index.html'));
});

app.use((err: Error, _req: Request, res: Response, _) => { // eslint-disable-line
  LOGGER.error('Uncaught error', { name: err.name, message: err.message, stack: app.get('env') === 'production' ? 'omitted in production' : err.stack });

  if (!res.headersSent) {
    res.status(500).end();
  } else {
    res.end();
  }
});

app.listen(CONFIG.server.port, () => {
  LOGGER.info('Started server', { url: CONFIG.server.baseUrl, port: CONFIG.server.port });
});
