import { Router, Request, Response } from 'express';
import * as reportsService from '../services/reports.service';
import { authenticate, authorize, requirePg } from '../middleware/auth';

const router = Router();

router.use(authenticate, requirePg, authorize('admin'));

// GET /reports/rent
router.get('/rent', async (req: Request, res: Response) => {
  try {
    const data = await reportsService.getRentReport(req.user!.pgId, {
      range: req.query.range as string | undefined,
      roomId: req.query.roomId as string | undefined,
      tenantId: req.query.tenantId as string | undefined,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// GET /reports/electricity
router.get('/electricity', async (req: Request, res: Response) => {
  try {
    const data = await reportsService.getElectricityReport(req.user!.pgId, {
      range: req.query.range as string | undefined,
      roomId: req.query.roomId as string | undefined,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// GET /reports/revenue
router.get('/revenue', async (req: Request, res: Response) => {
  try {
    const data = await reportsService.getRevenueReport(req.user!.pgId, {
      range: req.query.range as string | undefined,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// GET /reports/audit-log
router.get('/audit-log', async (req: Request, res: Response) => {
  try {
    const result = await reportsService.getAuditLog(req.user!.pgId, {
      actor: req.query.actor as string | undefined,
      action: req.query.action as string | undefined,
      range: req.query.range as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// GET /reports/monthly-summary?month=YYYY-MM
router.get('/monthly-summary', async (req: Request, res: Response) => {
  try {
    const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
    const data = await reportsService.getMonthlyBillingSummary(req.user!.pgId, month);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// GET /reports/export?month=YYYY-MM&format=csv
router.get('/export', async (req: Request, res: Response) => {
  try {
    const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
    const format = (req.query.format as string) || 'csv';

    if (format === 'csv') {
      const csv = await reportsService.exportMonthlyBillingCsv(req.user!.pgId, month);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="Billing_Report_${month}.csv"`);
      res.send(csv);
    } else {
      res.status(400).json({ success: false, error: 'Unsupported export format. Use format=csv' });
    }
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

export default router;

