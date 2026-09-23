import { Router, Request, Response } from 'express';
import * as electricityService from '../services/electricity.service';
import { authenticate, authorize, requirePg } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createElectricityBillSchema, updateElectricityBillSchema } from '../schemas';
const router = Router();

router.use(authenticate, requirePg);

// GET /electricity/my-bills [Tenant only]
router.get('/my-bills', authorize('tenant'), async (req: Request, res: Response) => {
  try {
    const data = await electricityService.listElectricityBills(req.user!.pgId, {
      tenant_id: req.user!.tenantId,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// GET /electricity/latest-reading [Admin]
router.get('/latest-reading', authorize('admin'), async (req: Request, res: Response) => {
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

// GET /electricity/bills [Admin]
router.get('/bills', authorize('admin'), async (req: Request, res: Response) => {
  try {
    const data = await electricityService.listElectricityBills(req.user!.pgId, req.query as Record<string, string>);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// POST /electricity/bills [Admin]
router.post('/bills', authorize('admin'), validate(createElectricityBillSchema), async (req: Request, res: Response) => {
  try {
    const data = await electricityService.createElectricityBill(req.user!.pgId, req.body, { id: req.user!.id, email: req.user!.email });
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// GET /electricity/bills/:id [Admin]
router.get('/bills/:id', authorize('admin'), async (req: Request, res: Response) => {
  try {
    const data = await electricityService.getElectricityBill(req.user!.pgId, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(404).json({ success: false, error: (err as Error).message });
  }
});

// PATCH /electricity/bills/:id [Admin]
router.patch('/bills/:id', authorize('admin'), validate(updateElectricityBillSchema), async (req: Request, res: Response) => {
  try {
    const data = await electricityService.updateElectricityBill(req.user!.pgId, req.params.id, req.body, { id: req.user!.id, email: req.user!.email });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// IMMUTABILITY: Reject DELETE on bills
router.delete('/bills/:id', authorize('admin'), (_req: Request, res: Response) => {
  res.status(405).json({
    success: false,
    error: 'Financial records are immutable. Electricity bills cannot be deleted.',
  });
});

export default router;

