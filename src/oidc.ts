import { Request, Response } from 'express';
import { verify, GetPublicKeyOrSecret, TokenExpiredError, decode } from 'jsonwebtoken';
import jwksClient, { JwksClient } from 'jwks-rsa';
import { CallbackParamsType, Client, generators, Issuer } from 'openid-client';
import { CONFIG } from './config';
import { LOGGER } from './logger';
import { destroySession, getAllSessions, getSessionFromRequest, Session } from './session';

enum JWTStatus {
  valid,
  expired,
  error
}

export class OIDC {

  private issuer: Issuer;

  private client: Client;

  private jwksClient: JwksClient;

  private getKey: GetPublicKeyOrSecret;

  async initialize() {
    this.client = await this.getClient();

    this.jwksClient = jwksClient({ jwksUri: this.issuer.metadata.jwks_uri });

    this.getKey = (header, callback) => this.jwksClient.getSigningKey(header.kid, (err, key: any) => {
      if (err) {
        LOGGER.error('Unable to fetch the public key / secret', err);

        throw new Error();
      } else {
        callback(null, key.publicKey || key.rsaPublicKey);
      }
    });
  }

  private getRedirectUri() {
    return `${CONFIG.server.baseUrl}/resort/oidc/callback`;
  }

  private getPostLogoutRedirectUri() {
    return `${CONFIG.server.baseUrl}/resort/oidc/post-logout`;
  }

  private async getClient(): Promise<Client> {
    const { providerUrl, clientId, clientSecret } = CONFIG.oidc;

    this.issuer = await Issuer.discover(providerUrl);

    LOGGER.info('OIDC Issuer discovered', { providerUrl });

    const client = new this.issuer.Client({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris: [this.getRedirectUri()],
      response_types: ['code'],
    });

    LOGGER.info('OIDC client initialized', { clientId });

    return client;
  }

  async initiateLoginFlow(req: Request, res: Response, originalUrl: string) {
    LOGGER.debug('Starting new OIDC flow');

    const session = getSessionFromRequest(req);

    const state = generators.state();
    const nonce = generators.nonce();
    const { audience, scope } = CONFIG.oidc;
    const authorizationUrl = this.client.authorizationUrl({ scope, audience, nonce, state });

    session.oidcState = state;
    session.oidcNonce = nonce;
    session.oidcOriginalUrl = originalUrl;

    LOGGER.debug('Url created, redirecting');

    res.status(307).setHeader('Location', authorizationUrl);
    res.end();
  }

  async processLoginCallback(req: Request, res: Response): Promise<void> {
    const session = getSessionFromRequest(req);
    const params = req.query as CallbackParamsType;

    if (params.error) {
      LOGGER.error('Auth code error on callback', params);

      res.status(401).send(`Error! ${params.error}: ${params.error_description}`);

      return;
    }

    LOGGER.debug('Received auth code', { ...params, code: '***' });

    if (session.idToken) {
      LOGGER.debug('Already logged in, skipping code response');

      res.status(307).setHeader('Location', '/').end();
      return;
    }

    const tokenSet = await this.client.callback(this.getRedirectUri(), params, { state: session.oidcState, nonce: session.oidcNonce });

    const oidcOriginalUrl = session.oidcOriginalUrl;

    session.idToken = tokenSet.id_token;
    session.accessToken = tokenSet.access_token;
    session.refreshToken = tokenSet.refresh_token;

    const decoded = decode(tokenSet.id_token, { json: true });

    session.sub = decoded.sub;
    session.sid = decoded.sid;

    session.oidcNonce = session.oidcOriginalUrl = session.oidcState = null;

    LOGGER.debug('Updated session with tokens');

    res.status(307).setHeader('Location', oidcOriginalUrl || '/').end();
  }

  async initiateLogoutFlow(req: Request, res: Response) {
    const session = getSessionFromRequest(req);

    LOGGER.debug('Creating logout url');

    session.logoutState = generators.state();

    const logoutUrl = this.client.endSessionUrl({ id_token_hint: session.idToken, state: session.logoutState, post_logout_redirect_uri: this.getPostLogoutRedirectUri() });

    LOGGER.debug('Initiated logout flow', { logoutUrl });

    res.status(307).setHeader('Location', logoutUrl).end();
  }

  async processFrontChannelLogout(req: Request, res: Response) {
    LOGGER.debug('Received front channel logout request');

    const session = getSessionFromRequest(req);

    session.destroy(err => {
      let status = 200;
      let message = session.idToken ? 'success' : 'alreadyLoggedOut';

      if (err) {
        LOGGER.error('Session cannot be destroyed', err);

        status = 500;
        message = 'error';
      }

      LOGGER.debug('Session destroyed, returning success HTML page');

      res
        .status(status)
        .set('Content-Type', 'text/html')
        .send(`<!DOCTYPE html>
          <html>
            <head>
              <title>Logged out</title>
              <script>
                localStorage.clear();
                parent.postMessage({ status: '${message}' }, '${CONFIG.oidc.providerUrl}');
              </script>
            </head>
            <body><h1>Logged out</h1></body>
          </html>
        `);
    });
  }

  async processBackChannelLogout(req: Request, res: Response) {
    LOGGER.debug('Received back channel logout request');

    const token = req.query['logout_token'] as string;

    if (!token || typeof token !== 'string') {
      LOGGER.debug('Received no logout_token or it is not a string');

      res.status(400).end();
    }

    switch (await this.getTokenStatus(token)) {
      case JWTStatus.valid: {
        LOGGER.debug('Logout token is valid');

        const { sid, sub } = decode(token, { json: true });

        const sessions = await getAllSessions();
        const sessionsToDestroy = sessions.filter((session: Session) => {
          if (sid) {
            return session.sid === sid;
          } else if (sub) {
            return session.sub === sub;
          } else {
            res
              .status(400)
              .header('Cache-Control', 'no-store')
              .end();
          }
        });

        try {
          await Promise.all(sessionsToDestroy.map(s => destroySession(s.id)));

          LOGGER.debug('Sessions destroyed');

          res.status(200)
            .header('Cache-Control', 'no-store')
            .end();
        } catch (err) {
          LOGGER.error('Session cannot be destroyed', err);

          res
            .status(400)
            .header('Cache-Control', 'no-store')
            .end();
        }

        break;
      }
      default: {
        LOGGER.debug('Logout token is invalid or expired');
        res.status(400).end();
      }
    }
  }

  async processLogoutCallback(req: Request, res: Response) {
    LOGGER.debug('Received post logout callback');

    const params = req.query as CallbackParamsType;
    const session = getSessionFromRequest(req);

    if (params.state !== session.logoutState) {
      res
        .status(403)
        .json({ error: 'Invalid state' });

      return;
    }

    session.destroy(err => {
      if (err) {
        LOGGER.error('Session cannot be destroyed', err);

        throw err;
      }

      LOGGER.debug('Session destroyed, redirecting to the entry page');

      res
        .status(307)
        .setHeader('Location', '/')
        .end();
    });
  }

  async getUserinfo(req: Request, res: Response): Promise<void> {
    LOGGER.debug('Getting userinfo');

    const session = getSessionFromRequest(req);

    if (!session.idToken || !session.accessToken) {
      res.status(401).end();
      return;
    }

    const userinfo = await this.client.userinfo(session.accessToken);

    LOGGER.debug('Userinfo received');

    res.status(200).send(userinfo);
  }

  async getAccessToken(req: Request, res: Response): Promise<void> {
    LOGGER.debug('Processing access token request');

    const session = getSessionFromRequest(req);

    if (!session.idToken || !session.accessToken) {
      res.status(401).end();
      return;
    }

    switch (await this.getTokenStatus(session.accessToken)) {
      case JWTStatus.valid: {
        LOGGER.debug('Actual access token is valid');

        res.status(200).send(session.accessToken);

        break;
      }
      case JWTStatus.expired: {
        LOGGER.debug('Access token is expired');

        if (session.refreshToken) {
          LOGGER.debug('Refresh token available, refreshing', { rt: session.refreshToken });

          const tokenSet = await this.client.refresh(session.refreshToken);

          if (tokenSet.id_token) session.idToken = tokenSet.id_token;
          if (tokenSet.access_token) session.accessToken = tokenSet.access_token;
          if (tokenSet.refresh_token) session.refreshToken = tokenSet.refresh_token;

          LOGGER.debug('Refresh complete');

          res.status(200).send(session.accessToken);
        }

        break;
      }
      case JWTStatus.error: {
        res.status(500).end();

        break;
      }
      default: res.status(401).end();
    }
  }

  private getTokenStatus(token: string) {
    return new Promise<JWTStatus>((resolve) => verify(token, this.getKey, (err) => {
      if (err) {
        if (err instanceof TokenExpiredError) {
          return resolve(JWTStatus.expired);
        }

        LOGGER.error('Unknown error while validating the token', err);

        return resolve(JWTStatus.error);
      }

      return resolve(JWTStatus.valid);
    }));
  }
}
