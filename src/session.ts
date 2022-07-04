import { Request } from 'express';
import { basename } from 'path';
import { Session as ExpressSession } from 'express-session';
import { sessionStore } from './data';

export interface Session extends ExpressSession {
  sub: string;
  sid: string;
  idToken: string;
  accessToken: string;
  refreshToken: string;
  logoutState: string;
  oidcState: string;
  oidcNonce: string;
  oidcOriginalUrl: string;
}

export function getSessionFromRequest(req: Request): Session {
  return req.session as Session;
}

export function getSession(sid: string): Promise<Session> {
  return new Promise((resolve, reject) => {
    sessionStore.get(sid, (error: Error, session: Session) => {
      if (error) {
        reject(error);
      } else {
        resolve(session);
      }
    });
  });
}

export function getAllSessions(): Promise<Session[]> {
  return new Promise((resolve, reject) => {
    (sessionStore as any).list(async (error: Error, files: string[]) => {
      if (error) {
        return reject(error);
      }

      resolve(Promise.all(files.map(f => getSession(basename(f, '.json')))));
    });
  });
}

export function destroySession(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sessionStore.destroy(id, (error: Error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}
