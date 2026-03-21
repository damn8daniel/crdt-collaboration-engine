import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Request, Response, NextFunction } from 'express';
import { config } from './config';
import { prisma } from './db';
import type { UserPublic } from '../shared/types';

interface JwtPayload {
  sub: string;
  email: string;
}

/** Hash a plaintext password. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

/** Compare plaintext against hash. */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Issue a signed JWT. */
export function signToken(user: { id: string; email: string }): string {
  return jwt.sign({ sub: user.id, email: user.email } satisfies JwtPayload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

/** Verify and decode a JWT. Returns the user id. */
export function verifyToken(token: string): string {
  const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
  return decoded.sub;
}

/** Express middleware — attaches `req.userId` if valid Bearer token present. */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized', message: 'Missing token', statusCode: 401 });
    return;
  }

  try {
    const userId = verifyToken(header.slice(7));
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(401).json({ error: 'Unauthorized', message: 'User not found', statusCode: 401 });
      return;
    }
    (req as any).userId = userId;
    (req as any).user = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    } satisfies UserPublic;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid token', statusCode: 401 });
  }
}
