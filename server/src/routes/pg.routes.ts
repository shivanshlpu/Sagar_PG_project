import { Router, Request, Response } from 'express';
import * as pgService from '../services/pg.service';
import { authenticate, authorize, requirePg } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { updatePGSchema } from '../schemas';

const router = Router();

// GET /pg - Get current authenticated user's PG details
router.get('/', authenticate, requirePg, async (req: Request, res: Response) => {
  try {
    const data = await pgService.getPG(req.user!.pgId!);
    res.json({ success: true, data });
  } catch (err) {
    res.status(404).json({ success: false, error: (err as Error).message });
  }
});

// PATCH /pg - Update current PG details [Admin only]
router.patch('/', authenticate, authorize('admin'), requirePg, validate(updatePGSchema), async (req: Request, res: Response) => {
  try {
    const data = await pgService.updatePG(req.user!.pgId!, req.body, {
      id: req.user!.id,
      email: req.user!.email,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

export default router;
