import { Router, Request, Response } from 'express';
import * as pgService from '../services/pg.service';
import { authenticate, authorize, requirePg, enforcePgBoundary } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { updatePGSchema } from '../schemas';

const router = Router();

// GET /pg - Get current authenticated user's PG details
router.get('/', authenticate, requirePg, enforcePgBoundary, async (req: Request, res: Response) => {
  try {
    const data = await pgService.getPG(req.user!.pgId!);
    res.json({ success: true, data });
  } catch (err) {
    res.status(404).json({ success: false, error: (err as Error).message });
  }
});

// PATCH /pg - Update current PG details [Admin only]
router.patch(
  '/',
  authenticate,
  authorize('admin'),
  requirePg,
  enforcePgBoundary,
  validate(updatePGSchema),
  async (req: Request, res: Response) => {
    try {
      const data = await pgService.updatePG(req.user!.pgId!, req.body, {
        id: req.user!.id,
        email: req.user!.email,
      });
      res.json({ success: true, data });
    } catch (err) {
      res.status(400).json({ success: false, error: (err as Error).message });
    }
  }
);

// POST /pg/logo - Upload or update PG logo [Admin only]
router.post('/logo', authenticate, authorize('admin'), requirePg, enforcePgBoundary, async (req: Request, res: Response) => {
  try {
    const { logo_url } = req.body;
    if (!logo_url || typeof logo_url !== 'string') {
      res.status(400).json({ success: false, error: 'Valid logo_url is required' });
      return;
    }

    // Safety guard against unreasonably large payloads (> 3.5MB base64)
    if (logo_url.length > 3.5 * 1024 * 1024) {
      res.status(400).json({ success: false, error: 'Logo image exceeds maximum allowed payload size (2.5MB)' });
      return;
    }

    const data = await pgService.updatePGLogo(req.user!.pgId!, logo_url, {
      id: req.user!.id,
      email: req.user!.email,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// DELETE /pg/logo - Remove PG logo [Admin only]
router.delete('/logo', authenticate, authorize('admin'), requirePg, enforcePgBoundary, async (req: Request, res: Response) => {
  try {
    const data = await pgService.updatePGLogo(req.user!.pgId!, null, {
      id: req.user!.id,
      email: req.user!.email,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

export default router;

