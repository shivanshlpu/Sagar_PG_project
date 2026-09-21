import { Router, Request, Response } from 'express';
import * as moveService from '../services/moveInOut.service';
import { authenticate, authorize, requirePg } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { moveInSchema, moveOutSchema } from '../schemas';

const router = Router();

router.use(authenticate, requirePg, authorize('admin'));

// POST /tenants/:id/move-in
router.post('/:id/move-in', validate(moveInSchema), async (req: Request, res: Response) => {
  try {
    await moveService.moveIn(req.user!.pgId, req.params.id, req.body, { id: req.user!.id, email: req.user!.email });
    res.json({ success: true, message: 'Move-in processed' });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// POST /tenants/:id/move-out
router.post('/:id/move-out', validate(moveOutSchema), async (req: Request, res: Response) => {
  try {
    await moveService.moveOut(req.user!.pgId, req.params.id, req.body, { id: req.user!.id, email: req.user!.email });
    res.json({ success: true, message: 'Move-out processed' });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// GET /tenants/:id/move-out-summary
router.get('/:id/move-out-summary', async (req: Request, res: Response) => {
  try {
    const data = await moveService.getMoveOutSummary(req.user!.pgId, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

export default router;

