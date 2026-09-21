import { Router, Request, Response } from 'express';
import * as electricityService from '../services/electricity.service';
import { authenticate, authorize, requirePg } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createElectricityBillSchema, updateElectricityBillSchema } from '../schemas';

const router = Router();

router.use(authenticate, requirePg, authorize('admin'));

// GET /electricity/latest-reading
router.get('/latest-reading', async (req: Request, res: Response) => {
  try {
    const data = await electricityService.getLatestElectricityReading(
      req.user!.pgId,
      req.query.room_id as string | undefined,
      req.query.tenant_id as string | undefined
    );
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// GET /electricity/bills
router.get('/bills', async (req: Request, res: Response) => {
  try {
    const data = await electricityService.listElectricityBills(req.user!.pgId, req.query as Record<string, string>);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// POST /electricity/bills
router.post('/bills', validate(createElectricityBillSchema), async (req: Request, res: Response) => {
  try {
    const data = await electricityService.createElectricityBill(req.user!.pgId, req.body, { id: req.user!.id, email: req.user!.email });
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// GET /electricity/bills/:id
router.get('/bills/:id', async (req: Request, res: Response) => {
  try {
    const data = await electricityService.getElectricityBill(req.user!.pgId, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(404).json({ success: false, error: (err as Error).message });
  }
});

// PATCH /electricity/bills/:id
router.patch('/bills/:id', validate(updateElectricityBillSchema), async (req: Request, res: Response) => {
  try {
    const data = await electricityService.updateElectricityBill(req.user!.pgId, req.params.id, req.body, { id: req.user!.id, email: req.user!.email });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// IMMUTABILITY: Reject DELETE on bills
router.delete('/bills/:id', (_req: Request, res: Response) => {
  res.status(405).json({
    success: false,
    error: 'Financial records are immutable. Electricity bills cannot be deleted.',
  });
});

export default router;

