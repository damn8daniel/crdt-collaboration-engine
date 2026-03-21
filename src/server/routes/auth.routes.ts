import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { hashPassword, verifyPassword, signToken, authMiddleware } from '../auth';
import type { AuthPayload, UserPublic } from '../../shared/types';

const router = Router();

/** POST /api/auth/register */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, name, password } = req.body;

    if (!email || !name || !password) {
      res.status(400).json({ error: 'Bad Request', message: 'email, name, and password are required', statusCode: 400 });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'Conflict', message: 'Email already registered', statusCode: 409 });
      return;
    }

    const hashed = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, name, password: hashed },
    });

    const token = signToken(user);
    const payload: AuthPayload = {
      token,
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
    };

    res.status(201).json(payload);
  } catch (err) {
    console.error('[auth] register error:', err);
    res.status(500).json({ error: 'Internal', message: 'Registration failed', statusCode: 500 });
  }
});

/** POST /api/auth/login */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Bad Request', message: 'email and password required', statusCode: 400 });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.password))) {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials', statusCode: 401 });
      return;
    }

    const token = signToken(user);
    const payload: AuthPayload = {
      token,
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
    };

    res.json(payload);
  } catch (err) {
    console.error('[auth] login error:', err);
    res.status(500).json({ error: 'Internal', message: 'Login failed', statusCode: 500 });
  }
});

/** GET /api/auth/me */
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  res.json((req as any).user as UserPublic);
});

export default router;
