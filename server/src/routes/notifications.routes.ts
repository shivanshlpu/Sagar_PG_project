import { Router, Request, Response } from 'express';
import * as notificationsService from '../services/notifications.service';
import * as reportsService from '../services/reports.service';
import { authenticate, requirePg } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// GET /notifications
router.get('/', async (req: Request, res: Response) => {
  try {
    const data = await notificationsService.listNotifications(req.user!.id, {
      unreadOnly: req.query.unread === 'true',
      pgId: req.user?.pgId || undefined,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// PATCH /notifications/:id/read
router.patch('/:id/read', async (req: Request, res: Response) => {
  try {
    const data = await notificationsService.markAsRead(req.params.id, req.user!.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

export default router;

// Audit log route
export const auditLogRouter = Router();
auditLogRouter.use(authenticate, requirePg);

// GET /audit-log [Admin]
auditLogRouter.get('/', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }
    const result = await reportsService.getAuditLog(req.user!.pgId, {
      actor: req.query.actor as string | undefined,
      action: req.query.action as string | undefined,
      range: req.query.range as string | undefined,
      page: parseInt(req.query.page as string || '1', 10),
      limit: parseInt(req.query.limit as string || '50', 10),
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

