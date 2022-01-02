import { Request, Response } from 'express';
import jwt, { GetPublicKeyOrSecret, TokenExpiredError } from 'jsonwebtoken';
import jwksClient, { JwksClient } from 'jwks-rsa';
import { CallbackParamsType, Client, generators, Issuer } from 'openid-client';
import { CONFIG } from './config';
import { LOGGER } from './logger';
import { getSession } from './session';

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
    return `${CONFIG.server.baseUrl}/oidc/callback`;
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

    const session = getSession(req);

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

  async processCallback(req: Request, res: Response): Promise<void> {
    const session = getSession(req);
    const params = req.query as CallbackParamsType;

    if (params.error) {
      LOGGER.error('Auth code error on callback', params);

      res.status(401).send(`Error! ${params.error}: ${params.error_description}`);

      return;
    }

    LOGGER.debug('Received auth code', { ...params, code: '***' });

    if (session.idToken) {
      LOGGER.debug('Already logged in, skipping code response');

      return res.status(307).setHeader('Location', '/').end();
    }

    const tokenSet = await this.client.callback(this.getRedirectUri(), params, { state: session.oidcState, nonce: session.oidcNonce });

    const oidcOriginalUrl = session.oidcOriginalUrl;

    session.idToken = tokenSet.id_token;
    session.accessToken = tokenSet.access_token;
    session.refreshToken = tokenSet.refresh_token;
    session.oidcNonce = null;
    session.oidcOriginalUrl = null;
    session.oidcState = null;

    LOGGER.debug('Updated session with tokens');

    res.status(307).setHeader('Location', oidcOriginalUrl || '/').end();
  }

  async logout(req: Request, res: Response) {
    const session = getSession(req);

    session.destroy(() => res.status(307).setHeader('Location', '/').end());
  }

  async getIdToken(req: Request, res: Response) {
    const session = getSession(req);

    if (!session.idToken || !session.accessToken) {
      return res.status(401).end();
    }

    res.status(200).send(session.idToken);
  }

  async getAccessToken(req: Request, res: Response) {
    LOGGER.debug('Processing access token request');

    const session = getSession(req);

    if (!session.idToken || !session.accessToken) {
      return res.status(401).end();
    }

    enum Status {
      valid,
      expired,
      error
    }

    const status = await new Promise<Status>((resolve) => jwt.verify(session.accessToken, this.getKey, (err) => {
      if (err) {
        if (err instanceof TokenExpiredError) {
          return resolve(Status.expired);
        }

        LOGGER.error('Unknown error while validating the token', err);

        return resolve(Status.error);
      }

      return resolve(Status.valid);
    }));

    if (status === Status.valid) {
      LOGGER.debug('Actual access token is valid');

      res.status(200).send(session.accessToken);

      return;
    } else if (status === Status.expired) {
      LOGGER.debug('Access token is expired');

      if (session.refreshToken) {
        LOGGER.debug('Refresh token available, refreshing', { rt: session.refreshToken });

        const tokenSet = await this.client.refresh(session.refreshToken);

        if (tokenSet.id_token) session.idToken = tokenSet.id_token;
        if (tokenSet.access_token) session.accessToken = tokenSet.access_token;
        if (tokenSet.refresh_token) session.refreshToken = tokenSet.refresh_token;

        LOGGER.debug('Refresh complete');

        res.status(200).send(session.accessToken);

        return;
      } else {
        res.status(500).end();
      }
    }

    return res.status(401).end();
  }
}
