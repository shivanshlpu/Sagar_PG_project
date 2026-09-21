import { Router, Request, Response } from 'express';
import * as assetsService from '../services/assets.service';
import { authenticate, authorize, requirePg } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createAssetSchema, updateAssetSchema } from '../schemas';

const router = Router();

router.use(authenticate, requirePg, authorize('admin'));

// GET /api/v1/assets (supports ?roomId=...&condition=...)
router.get('/', async (req: Request, res: Response) => {
  try {
    const data = await assetsService.listAllAssets(req.user!.pgId, {
      roomId: req.query.roomId as string | undefined,
      condition: req.query.condition as string | undefined,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// POST /api/v1/assets
router.post('/', validate(createAssetSchema), async (req: Request, res: Response) => {
  try {
    const data = await assetsService.createAsset(req.user!.pgId, req.body, {
      id: req.user!.id,
      email: req.user!.email,
    });
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// PATCH /api/v1/assets/:id
router.patch('/:id', validate(updateAssetSchema), async (req: Request, res: Response) => {
  try {
    const data = await assetsService.updateAsset(req.user!.pgId, req.params.id, req.body, {
      id: req.user!.id,
      email: req.user!.email,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// DELETE /api/v1/assets/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await assetsService.deleteAsset(req.user!.pgId, req.params.id, {
      id: req.user!.id,
      email: req.user!.email,
    });
    res.json({ success: true, message: 'Asset deleted' });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

export default router;
