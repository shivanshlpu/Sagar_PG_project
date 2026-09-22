import { Router, Request, Response } from 'express';
import * as rentService from '../services/rent.service';
import { checkAndSendRentReminders } from '../services/reminders.service';
import { authenticate, authorize, requirePg } from '../middleware/auth';
import { validate, validateQuery } from '../middleware/validate';
import { generateRentSchema, updateRentSchema, rentQuerySchema } from '../schemas';

const router = Router();

router.use(authenticate, requirePg);

// POST /rent/send-reminders [Admin] — manually trigger rent reminder check for this PG
router.post('/send-reminders', authorize('admin'), async (req: Request, res: Response) => {
  try {
    const stats = await checkAndSendRentReminders(req.user!.pgId);
    res.json({
      success: true,
      message: `Rent reminders processed: ${stats.sent} sent, ${stats.skippedAlreadySent} already sent today, ${stats.skippedNoPhone} skipped (no phone).`,
      data: stats,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /rent and /rent/records [Admin]
router.get(['/', '/records'], authorize('admin'), validateQuery(rentQuerySchema), async (req: Request, res: Response) => {
  try {
    const result = await rentService.listRentRecords(req.user!.pgId, req.query as Record<string, string>);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// POST /rent, /rent/records, /rent/generate [Admin]
router.post(['/', '/records', '/generate'], authorize('admin'), validate(generateRentSchema), async (req: Request, res: Response) => {
  try {
    const { month, tenant_ids, due_date } = req.body;
    const data = await rentService.generateRentRecords(req.user!.pgId, month, tenant_ids, due_date, { id: req.user!.id, email: req.user!.email });
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// GET /rent/:id and /rent/records/:id [Admin or Tenant self]
router.get(['/:id', '/records/:id'], async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.role === 'tenant' ? req.user!.tenantId : undefined;
    const data = await rentService.getRentRecord(req.user!.pgId, req.params.id, tenantId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(404).json({ success: false, error: (err as Error).message });
  }
});

// PATCH /rent/:id, /rent/records/:id [Admin]
router.patch(['/:id', '/records/:id', '/:id/status', '/records/:id/status'], authorize('admin'), validate(updateRentSchema), async (req: Request, res: Response) => {
  try {
    const data = await rentService.updateRentRecord(req.user!.pgId, req.params.id, req.body, { id: req.user!.id, email: req.user!.email });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// IMMUTABILITY: Reject DELETE on rent records
router.delete(['/:id', '/records/:id'], (_req: Request, res: Response) => {
  res.status(405).json({
    success: false,
    error: 'Financial records are immutable. Rent records cannot be deleted.',
  });
});

export default router;

