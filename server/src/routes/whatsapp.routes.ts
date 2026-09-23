import { Router, Request, Response } from 'express';
import * as whatsappService from '../services/whatsapp.service';
import { authenticate, authorize, enforcePgBoundary } from '../middleware/auth';

const router = Router();

// GET /api/v1/whatsapp/status [Admin]
router.get('/status', authenticate, authorize('admin'), enforcePgBoundary, async (req: Request, res: Response) => {
  try {
    const pgId = req.user?.pgId || (req.query.pgId as string) || 'default';
    const status = whatsappService.getWhatsAppStatus(pgId);
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /api/v1/whatsapp/sessions [Admin] - Scoped to authenticated admin's PG session only
router.get('/sessions', authenticate, authorize('admin'), enforcePgBoundary, async (req: Request, res: Response) => {
  try {
    const pgId = req.user?.pgId || 'default';
    const status = whatsappService.getWhatsAppStatus(pgId);
    res.json({ success: true, data: [status] });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// POST /api/v1/whatsapp/connect [Admin]
router.post('/connect', authenticate, authorize('admin'), enforcePgBoundary, async (req: Request, res: Response) => {
  try {
    const pgId = req.user?.pgId || (req.body?.pgId as string) || (req.query?.pgId as string) || 'default';
    const status = await whatsappService.connectWhatsApp(pgId);
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// POST /api/v1/whatsapp/pairing-code [Admin]
router.post('/pairing-code', authenticate, authorize('admin'), enforcePgBoundary, async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      res.status(400).json({ success: false, error: 'Phone number is required (with country code, e.g. 919876543210)' });
      return;
    }
    const pgId = req.user?.pgId || (req.body?.pgId as string) || 'default';
    const code = await whatsappService.requestPairingCode(phone, pgId);
    res.json({ success: true, data: { pairingCode: code } });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// POST /api/v1/whatsapp/disconnect [Admin]
router.post('/disconnect', authenticate, authorize('admin'), enforcePgBoundary, async (req: Request, res: Response) => {
  try {
    const pgId = req.user?.pgId || (req.body?.pgId as string) || 'default';
    await whatsappService.disconnectWhatsApp(pgId);
    res.json({ success: true, message: `Disconnected from WhatsApp for PG [${pgId}]` });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// POST /api/v1/whatsapp/send [Admin]
router.post('/send', authenticate, authorize('admin'), enforcePgBoundary, async (req: Request, res: Response) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      res.status(400).json({ success: false, error: 'Phone and message are required' });
      return;
    }
    const pgId = req.user?.pgId || (req.body?.pgId as string) || 'default';
    await whatsappService.sendWhatsAppMessage(phone, message, {
      pgId,
      purpose: 'ADMIN_DIRECT_MESSAGE',
    });
    res.json({ success: true, message: 'Message sent' });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
