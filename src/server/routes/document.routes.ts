import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../auth';
import { documentManager } from '../crdt/DocumentManager';
import type { DocumentMeta, PaginatedResponse, DocumentPermissionDTO } from '../../shared/types';

const router = Router();
router.use(authMiddleware);

/** GET /api/documents — list documents the user can access */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100);

    const [docs, total] = await Promise.all([
      prisma.document.findMany({
        where: {
          OR: [
            { ownerId: userId },
            { permissions: { some: { userId } } },
          ],
        },
        include: {
          owner: { select: { name: true } },
          permissions: true,
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.document.count({
        where: {
          OR: [
            { ownerId: userId },
            { permissions: { some: { userId } } },
          ],
        },
      }),
    ]);

    const data: DocumentMeta[] = docs.map((doc) => {
      const perm = doc.permissions.find((p) => p.userId === userId);
      return {
        id: doc.id,
        title: doc.title,
        language: doc.language,
        ownerId: doc.ownerId,
        ownerName: doc.owner.name,
        role: doc.ownerId === userId ? 'OWNER' : perm?.role ?? 'VIEWER',
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
        collaboratorCount: doc.permissions.length,
      };
    });

    const response: PaginatedResponse<DocumentMeta> = { data, total, page, pageSize };
    res.json(response);
  } catch (err) {
    console.error('[docs] list error:', err);
    res.status(500).json({ error: 'Internal', message: 'Failed to list documents', statusCode: 500 });
  }
});

/** POST /api/documents — create a new document */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const { title, language } = req.body;

    const doc = await prisma.document.create({
      data: {
        title: title || 'Untitled',
        language: language || 'plaintext',
        ownerId: userId,
        permissions: {
          create: { userId, role: 'OWNER' },
        },
      },
    });

    res.status(201).json({ id: doc.id, title: doc.title, language: doc.language });
  } catch (err) {
    console.error('[docs] create error:', err);
    res.status(500).json({ error: 'Internal', message: 'Failed to create document', statusCode: 500 });
  }
});

/** GET /api/documents/:id — get document metadata */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: {
        owner: { select: { name: true } },
        permissions: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });

    if (!doc) {
      res.status(404).json({ error: 'Not Found', message: 'Document not found', statusCode: 404 });
      return;
    }

    const perm = doc.permissions.find((p) => p.userId === userId);
    if (doc.ownerId !== userId && !perm) {
      res.status(403).json({ error: 'Forbidden', message: 'Access denied', statusCode: 403 });
      return;
    }

    const meta: DocumentMeta = {
      id: doc.id,
      title: doc.title,
      language: doc.language,
      ownerId: doc.ownerId,
      ownerName: doc.owner.name,
      role: doc.ownerId === userId ? 'OWNER' : perm?.role ?? 'VIEWER',
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      collaboratorCount: doc.permissions.length,
    };

    const permissions: DocumentPermissionDTO[] = doc.permissions.map((p) => ({
      userId: p.user.id,
      userName: p.user.name,
      userEmail: p.user.email,
      role: p.role,
    }));

    res.json({ ...meta, permissions });
  } catch (err) {
    console.error('[docs] get error:', err);
    res.status(500).json({ error: 'Internal', message: 'Failed to get document', statusCode: 500 });
  }
});

/** PATCH /api/documents/:id — update title/language */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });

    if (!doc) {
      res.status(404).json({ error: 'Not Found', message: 'Document not found', statusCode: 404 });
      return;
    }

    const perm = await prisma.documentPermission.findUnique({
      where: { documentId_userId: { documentId: doc.id, userId } },
    });

    if (doc.ownerId !== userId && perm?.role !== 'EDITOR') {
      res.status(403).json({ error: 'Forbidden', message: 'Only owner or editor can update', statusCode: 403 });
      return;
    }

    const { title, language } = req.body;
    const updated = await prisma.document.update({
      where: { id: doc.id },
      data: {
        ...(title !== undefined && { title }),
        ...(language !== undefined && { language }),
      },
    });

    res.json({ id: updated.id, title: updated.title, language: updated.language });
  } catch (err) {
    console.error('[docs] update error:', err);
    res.status(500).json({ error: 'Internal', message: 'Failed to update document', statusCode: 500 });
  }
});

/** DELETE /api/documents/:id */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });

    if (!doc) {
      res.status(404).json({ error: 'Not Found', message: 'Document not found', statusCode: 404 });
      return;
    }

    if (doc.ownerId !== userId) {
      res.status(403).json({ error: 'Forbidden', message: 'Only owner can delete', statusCode: 403 });
      return;
    }

    await prisma.document.delete({ where: { id: doc.id } });
    res.status(204).send();
  } catch (err) {
    console.error('[docs] delete error:', err);
    res.status(500).json({ error: 'Internal', message: 'Failed to delete document', statusCode: 500 });
  }
});

/** POST /api/documents/:id/share — share with another user */
router.post('/:id/share', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });

    if (!doc || doc.ownerId !== userId) {
      res.status(403).json({ error: 'Forbidden', message: 'Only owner can share', statusCode: 403 });
      return;
    }

    const { email, role } = req.body;
    if (!email || !['EDITOR', 'VIEWER'].includes(role)) {
      res.status(400).json({ error: 'Bad Request', message: 'email and role (EDITOR/VIEWER) required', statusCode: 400 });
      return;
    }

    const targetUser = await prisma.user.findUnique({ where: { email } });
    if (!targetUser) {
      res.status(404).json({ error: 'Not Found', message: 'User not found', statusCode: 404 });
      return;
    }

    await prisma.documentPermission.upsert({
      where: { documentId_userId: { documentId: doc.id, userId: targetUser.id } },
      update: { role },
      create: { documentId: doc.id, userId: targetUser.id, role },
    });

    res.json({ message: `Shared with ${targetUser.name} as ${role}` });
  } catch (err) {
    console.error('[docs] share error:', err);
    res.status(500).json({ error: 'Internal', message: 'Failed to share document', statusCode: 500 });
  }
});

/** GET /api/documents/:id/snapshots — list version history */
router.get('/:id/snapshots', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const docId = req.params.id;

    const hasAccess = await prisma.documentPermission.findUnique({
      where: { documentId_userId: { documentId: docId, userId } },
    });

    const doc = await prisma.document.findUnique({ where: { id: docId } });
    if (!doc || (doc.ownerId !== userId && !hasAccess)) {
      res.status(403).json({ error: 'Forbidden', message: 'Access denied', statusCode: 403 });
      return;
    }

    const snapshots = await prisma.documentSnapshot.findMany({
      where: { documentId: docId },
      include: { author: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json(
      snapshots.map((s) => ({
        id: s.id,
        label: s.label,
        createdBy: s.createdBy,
        authorName: s.author.name,
        createdAt: s.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    console.error('[docs] snapshots error:', err);
    res.status(500).json({ error: 'Internal', message: 'Failed to list snapshots', statusCode: 500 });
  }
});

/** POST /api/documents/:id/snapshots — create a snapshot */
router.post('/:id/snapshots', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const docId = req.params.id;
    const { label } = req.body;

    const snapshotId = await documentManager.createSnapshot(docId, userId, label);
    res.status(201).json({ id: snapshotId });
  } catch (err) {
    console.error('[docs] create snapshot error:', err);
    res.status(500).json({ error: 'Internal', message: 'Failed to create snapshot', statusCode: 500 });
  }
});

/** POST /api/documents/:id/snapshots/:snapshotId/restore */
router.post('/:id/snapshots/:snapshotId/restore', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const docId = req.params.id;
    const doc = await prisma.document.findUnique({ where: { id: docId } });

    if (!doc || doc.ownerId !== userId) {
      res.status(403).json({ error: 'Forbidden', message: 'Only owner can restore', statusCode: 403 });
      return;
    }

    await documentManager.restoreSnapshot(docId, req.params.snapshotId);
    res.json({ message: 'Snapshot restored' });
  } catch (err) {
    console.error('[docs] restore snapshot error:', err);
    res.status(500).json({ error: 'Internal', message: 'Failed to restore snapshot', statusCode: 500 });
  }
});

export default router;
