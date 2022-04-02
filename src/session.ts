import { Request } from 'express';
import { Session as ExpressSession } from 'express-session';

export interface Session extends ExpressSession {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  logoutState: string;
  oidcState: string;
  oidcNonce: string;
  oidcOriginalUrl: string;
}

export function getSession(req: Request): Session {
  return req.session as Session;
}
