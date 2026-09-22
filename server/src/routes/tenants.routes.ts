import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as tenantsService from '../services/tenants.service';
import * as rentService from '../services/rent.service';
import * as electricityService from '../services/electricity.service';
import { authenticate, authorize, requirePg, tenantSelfOnly } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { joinLimiter } from '../middleware/rateLimit';
import { createTenantSchema, updateTenantSchema } from '../schemas';

const router = Router();
// Strict 2MB memory limit for uploads
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// GET /tenants [Admin]
router.get('/', authenticate, requirePg, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const data = await tenantsService.listTenants(req.user!.pgId, {
      status: req.query.status as string | undefined,
      room_id: req.query.room_id as string | undefined,
      search: req.query.search as string | undefined,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// POST /tenants [Admin]
router.post('/', authenticate, requirePg, authorize('admin'), validate(createTenantSchema), async (req: Request, res: Response) => {
  try {
    const data = await tenantsService.createTenant(req.user!.pgId, req.body, { id: req.user!.id, email: req.user!.email });
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// GET /tenants/:id [Admin or Tenant self]
router.get('/:id', authenticate, requirePg, tenantSelfOnly, async (req: Request, res: Response) => {
  try {
    const data = await tenantsService.getTenant(req.user!.pgId, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(404).json({ success: false, error: (err as Error).message });
  }
});

// PATCH /tenants/:id [Admin or Tenant self (limited)]
router.patch('/:id', authenticate, requirePg, tenantSelfOnly, validate(updateTenantSchema), async (req: Request, res: Response) => {
  try {
    // Tenants can only update limited fields
    let updates = req.body;
    if (req.user!.role === 'tenant') {
      const { phone, emergency_contact_name, emergency_contact_phone } = updates;
      updates = { phone, emergency_contact_name, emergency_contact_phone };
    }
    const data = await tenantsService.updateTenant(req.user!.pgId, req.params.id, updates, { id: req.user!.id, email: req.user!.email });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// DELETE /tenants/:id [Admin]
router.delete('/:id', authenticate, requirePg, authorize('admin'), async (req: Request, res: Response) => {
  try {
    await tenantsService.deleteTenant(req.user!.pgId, req.params.id, { id: req.user!.id, email: req.user!.email });
    res.json({ success: true, message: 'Tenant deleted' });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// POST /tenants/vacate [Tenant self-marking as leaving or Admin specifying tenant]
router.post('/vacate', authenticate, requirePg, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.role === 'tenant' ? req.user!.tenantId : req.body.tenant_id;
    if (!tenantId) {
      res.status(400).json({ success: false, error: 'Tenant ID is required' });
      return;
    }
    const data = await tenantsService.vacateTenant(
      req.user!.pgId,
      tenantId,
      req.body,
      { id: req.user!.id, email: req.user!.email }
    );
    res.json({ success: true, message: 'Vacated successfully', data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// POST /tenants/:id/vacate [Admin or Tenant self]
router.post('/:id/vacate', authenticate, requirePg, tenantSelfOnly, async (req: Request, res: Response) => {
  try {
    const data = await tenantsService.vacateTenant(
      req.user!.pgId,
      req.params.id,
      req.body,
      { id: req.user!.id, email: req.user!.email }
    );
    res.json({ success: true, message: 'Vacated successfully', data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// POST /tenants/self-onboarding [Authenticated tenant completing their onboarding]
router.post(
  '/self-onboarding',
  authenticate,
  requirePg,
  upload.fields([
    { name: 'aadhaar_card', maxCount: 1 },
    { name: 'college_id', maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      if (!tenantId) {
        res.status(403).json({ success: false, error: 'Only tenants can complete self-onboarding' });
        return;
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      const aadhaar_card = files?.['aadhaar_card']?.[0];
      const college_id = files?.['college_id']?.[0];

      if (!aadhaar_card || !college_id) {
        res.status(400).json({
          success: false,
          error: 'Both Aadhaar Card and College ID images are mandatory for verification',
        });
        return;
      }

      const data = await tenantsService.completeTenantOnboarding(
        req.user!.pgId,
        tenantId,
        req.body,
        { aadhaar_card, college_id },
        { id: req.user!.id, email: req.user!.email }
      );

      res.json({ success: true, data });
    } catch (err) {
      res.status(400).json({ success: false, error: (err as Error).message });
    }
  }
);

// POST /tenants/:id/documents [Admin or Tenant self]
router.post('/:id/documents', authenticate, requirePg, tenantSelfOnly, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'File is required' });
      return;
    }
    const data = await tenantsService.uploadDocument(req.user!.pgId, req.params.id, req.file, { id: req.user!.id, email: req.user!.email });
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// GET /tenants/:id/documents/:docId [signed URL]
router.get('/:id/documents/:docId', authenticate, requirePg, tenantSelfOnly, async (req: Request, res: Response) => {
  try {
    const url = await tenantsService.getDocumentSignedUrl(req.user!.pgId, req.params.id, req.params.docId);
    res.json({ success: true, data: { url } });
  } catch (err) {
    res.status(404).json({ success: false, error: (err as Error).message });
  }
});

// GET /tenants/:id/rent-history [Admin or Tenant self]
router.get('/:id/rent-history', authenticate, requirePg, tenantSelfOnly, async (req: Request, res: Response) => {
  try {
    const data = await rentService.getTenantRentHistory(req.user!.pgId, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// GET /tenants/:id/electricity-bills [Admin or Tenant self]
router.get('/:id/electricity-bills', authenticate, requirePg, tenantSelfOnly, async (req: Request, res: Response) => {
  try {
    const data = await electricityService.listElectricityBills(req.user!.pgId, { tenant_id: req.params.id });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// GET /tenants/:id/billing-summary [Admin or Tenant self]
router.get('/:id/billing-summary', authenticate, requirePg, tenantSelfOnly, async (req: Request, res: Response) => {
  try {
    const data = await rentService.getTenantBillingSummary(req.user!.pgId, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// POST /tenants/registration-link [Admin]
router.post('/registration-link', authenticate, requirePg, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const data = await tenantsService.generateRegistrationLink(req.user!.pgId, { id: req.user!.id, email: req.user!.email });
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// GET /tenants/join-info/:code [public, rate-limited]
router.get('/join-info/:code', joinLimiter, async (req: Request, res: Response) => {
  try {
    const data = await tenantsService.getInviteInfo(req.params.code);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// POST /tenants/join/:code [public, rate-limited]
router.post('/join/:code', joinLimiter, async (req: Request, res: Response) => {
  try {
    const data = await tenantsService.selfRegister(req.params.code, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// POST /tenants/self-register/:token [public, backwards-compatible]
router.post('/self-register/:token', joinLimiter, async (req: Request, res: Response) => {
  try {
    const data = await tenantsService.selfRegister(req.params.token, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

export default router;

