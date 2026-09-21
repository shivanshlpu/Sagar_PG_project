import { Router, Request, Response } from 'express';
import * as whatsappService from '../services/whatsapp.service';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// GET /api/v1/whatsapp/status [Admin]
router.get('/status', authenticate, authorize('admin'), async (_req: Request, res: Response) => {
  try {
    const status = whatsappService.getWhatsAppStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// POST /api/v1/whatsapp/connect [Admin]
router.post('/connect', authenticate, authorize('admin'), async (_req: Request, res: Response) => {
  try {
    const status = await whatsappService.connectWhatsApp();
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// POST /api/v1/whatsapp/pairing-code [Admin]
router.post('/pairing-code', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      res.status(400).json({ success: false, error: 'Phone number is required (with country code, e.g. 919876543210)' });
      return;
    }
    const code = await whatsappService.requestPairingCode(phone);
    res.json({ success: true, data: { pairingCode: code } });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// POST /api/v1/whatsapp/disconnect [Admin]
router.post('/disconnect', authenticate, authorize('admin'), async (_req: Request, res: Response) => {
  try {
    await whatsappService.disconnectWhatsApp();
    res.json({ success: true, message: 'Disconnected from WhatsApp' });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// POST /api/v1/whatsapp/send [Admin]
router.post('/send', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      res.status(400).json({ success: false, error: 'Phone and message are required' });
      return;
    }
    await whatsappService.sendWhatsAppMessage(phone, message);
    res.json({ success: true, message: 'Message sent' });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
