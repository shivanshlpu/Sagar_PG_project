import { Router, Request, Response } from 'express';
import * as settingsService from '../services/settings.service';
import { authenticate, authorize, requirePg } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { updateWifiSchema, updateRemindersSchema, createContactSchema, updateContactSchema, updateBankingSchema } from '../schemas';

const router = Router();

router.use(authenticate, requirePg);

// --- Contacts ---
// GET /contacts [Admin/Tenant read-only]
router.get('/contacts', async (req: Request, res: Response) => {
  try {
    const data = await settingsService.listContacts(req.user!.pgId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// POST /contacts [Admin]
router.post('/contacts', authorize('admin'), validate(createContactSchema), async (req: Request, res: Response) => {
  try {
    const data = await settingsService.createContact(req.user!.pgId, req.body, { id: req.user!.id, email: req.user!.email });
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// PATCH /contacts/:id [Admin]
router.patch('/contacts/:id', authorize('admin'), validate(updateContactSchema), async (req: Request, res: Response) => {
  try {
    const data = await settingsService.updateContact(req.user!.pgId, req.params.id, req.body, { id: req.user!.id, email: req.user!.email });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// DELETE /contacts/:id [Admin]
router.delete('/contacts/:id', authorize('admin'), async (req: Request, res: Response) => {
  try {
    await settingsService.deleteContact(req.user!.pgId, req.params.id, { id: req.user!.id, email: req.user!.email });
    res.json({ success: true, message: 'Contact deleted' });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// --- Wi-Fi ---
// GET /settings/wifi [Admin/Tenant]
router.get('/settings/wifi', async (req: Request, res: Response) => {
  try {
    const data = await settingsService.getWifiSettings(req.user!.pgId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// PATCH /settings/wifi [Admin]
router.patch('/settings/wifi', authorize('admin'), validate(updateWifiSchema), async (req: Request, res: Response) => {
  try {
    const data = await settingsService.updateWifiSettings(req.user!.pgId, req.body, { id: req.user!.id, email: req.user!.email });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// --- Reminders ---
// GET /settings/reminders [Admin]
router.get('/settings/reminders', authorize('admin'), async (req: Request, res: Response) => {
  try {
    const data = await settingsService.getReminderSettings(req.user!.pgId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// PATCH /settings/reminders [Admin]
router.patch('/settings/reminders', authorize('admin'), validate(updateRemindersSchema), async (req: Request, res: Response) => {
  try {
    const data = await settingsService.updateReminderSettings(req.user!.pgId, req.body, { id: req.user!.id, email: req.user!.email });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// --- Billing Settings (Electricity Rate & Maintenance) ---
// GET /settings/billing [Admin/Tenant]
router.get('/settings/billing', async (req: Request, res: Response) => {
  try {
    const data = await settingsService.getBillingSettings(req.user!.pgId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// PATCH /settings/billing [Admin]
router.patch('/settings/billing', authorize('admin'), async (req: Request, res: Response) => {
  try {
    const data = await settingsService.updateBillingSettings(req.user!.pgId, req.body, { id: req.user!.id, email: req.user!.email });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// --- Banking & Payment QR ---
// GET /settings/banking [Admin/Tenant]
router.get('/settings/banking', async (req: Request, res: Response) => {
  try {
    const data = await settingsService.getBankingSettings(req.user!.pgId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// PATCH /settings/banking [Admin]
router.patch('/settings/banking', authorize('admin'), validate(updateBankingSchema), async (req: Request, res: Response) => {
  try {
    const data = await settingsService.updateBankingSettings(req.user!.pgId, req.body, { id: req.user!.id, email: req.user!.email });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// POST /settings/banking [Admin] (alias for PATCH)
router.post('/settings/banking', authorize('admin'), validate(updateBankingSchema), async (req: Request, res: Response) => {
  try {
    const data = await settingsService.updateBankingSettings(req.user!.pgId, req.body, { id: req.user!.id, email: req.user!.email });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

export default router;


