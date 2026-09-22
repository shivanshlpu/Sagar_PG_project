import { Router, Request, Response } from 'express';
import multer from 'multer';
import { supabaseAdmin } from '../config/supabase';
import { logAudit } from '../services/auditLog.service';
import * as paymentsService from '../services/payments.service';
import { authenticate, authorize, requirePg } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { submitPaymentSchema, verifyPaymentSchema } from '../schemas';
import { paymentLimiter } from '../middleware/rateLimit';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(authenticate, requirePg);

// POST /payments/record [Admin only - manually record payment]
router.post('/record', authorize('admin'), async (req: Request, res: Response) => {
  try {
    const { tenant_id, rent_record_id, electricity_bill_id, amount_paise, payment_method, utr_id, notes } = req.body;
    if (!tenant_id || !amount_paise) {
      res.status(400).json({ success: false, error: 'Tenant ID and amount are required' });
      return;
    }

    const noteParts = [];
    if (utr_id) noteParts.push(`UTR: ${utr_id}`);
    if (notes) noteParts.push(notes);
    noteParts.push(`Direct entry by Admin (${req.user!.email})`);
    const noteText = noteParts.join(' | ');

    // 1. Insert verified payment
    const { data: payment, error } = await supabaseAdmin
      .from('payments')
      .insert({
        pg_id: req.user!.pgId,
        tenant_id,
        rent_record_id: rent_record_id || null,
        electricity_bill_id: electricity_bill_id || null,
        amount_paise: Number(amount_paise),
        payment_method: payment_method || 'CASH',
        notes: noteText || null,
        status: 'verified',
        verified_by: req.user!.id,
        verified_at: new Date().toISOString(),
      })
      .select('*, tenant:tenants(full_name, phone, email)')
      .single();

    if (error) throw new Error(error.message);

    // 2. Mark linked rent record as paid
    if (rent_record_id) {
      await supabaseAdmin
        .from('rent_records')
        .update({ status: 'paid', paid_date: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', rent_record_id)
        .eq('pg_id', req.user!.pgId);
    } else {
      // Find latest pending rent record for tenant
      const { data: pendingRent } = await supabaseAdmin
        .from('rent_records')
        .select('id')
        .eq('pg_id', req.user!.pgId)
        .eq('tenant_id', tenant_id)
        .in('status', ['pending', 'overdue'])
        .order('month', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pendingRent) {
        await supabaseAdmin
          .from('rent_records')
          .update({ status: 'paid', paid_date: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', pendingRent.id)
          .eq('pg_id', req.user!.pgId);

        await supabaseAdmin
          .from('payments')
          .update({ rent_record_id: pendingRent.id })
          .eq('id', payment.id);
      }
    }

    // 3. Mark linked electricity bill as paid if provided
    if (electricity_bill_id) {
      await supabaseAdmin
        .from('electricity_bills')
        .update({ status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', electricity_bill_id)
        .eq('pg_id', req.user!.pgId);
    }

    // 4. Audit log
    await logAudit({
      pgId: req.user!.pgId,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'RECORD_PAYMENT',
      entityType: 'payment',
      entityId: payment.id,
      details: { tenant_id, amount_paise, payment_method },
    });

    res.status(201).json({ success: true, data: payment });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// GET /payments [Admin or Tenant]
router.get('/', async (req: Request, res: Response) => {
  try {
    const filters: Record<string, any> = { ...req.query };
    // Tenants can only view their own payments
    if (req.user!.role === 'tenant') {
      filters.tenant_id = req.user!.tenantId;
    }
    const result = await paymentsService.listPayments(req.user!.pgId, filters);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// POST /payments [Tenant]
router.post('/', authorize('tenant'), paymentLimiter, upload.single('screenshot'), async (req: Request, res: Response) => {
  try {
    // Parse the JSON fields from form data or direct JSON body
    let rawData = req.body;
    if (typeof req.body.data === 'string') {
      try {
        rawData = JSON.parse(req.body.data);
      } catch {
        rawData = {};
      }
    }
    const paymentData = submitPaymentSchema.parse(rawData);
    let screenshotPath: string | null = null;

    if (req.file) {
      screenshotPath = await paymentsService.uploadPaymentScreenshot(
        req.user!.pgId,
        req.user!.tenantId || req.user!.id,
        req.file
      );
    }

    const data = await paymentsService.submitPayment(
      req.user!.pgId,
      req.user!.tenantId || req.user!.id,
      paymentData,
      screenshotPath
    );
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// PATCH /payments/:id/verify [Admin only]
router.patch('/:id/verify', authorize('admin'), validate(verifyPaymentSchema), async (req: Request, res: Response) => {
  try {
    const { status, rejection_reason } = req.body;
    const data = await paymentsService.verifyPayment(
      req.user!.pgId,
      req.params.id,
      status,
      { id: req.user!.id, email: req.user!.email },
      rejection_reason
    );
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// POST /payments/:id/send-receipt [Admin only]
router.post('/:id/send-receipt', authorize('admin'), async (req: Request, res: Response) => {
  try {
    const result = await paymentsService.sendPaymentReceiptWhatsApp(req.user!.pgId, req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// GET /payments/:id [Admin or Tenant self]
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.role === 'tenant' ? req.user!.tenantId : undefined;
    const data = await paymentsService.getPayment(req.user!.pgId, req.params.id, tenantId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(404).json({ success: false, error: (err as Error).message });
  }
});

// IMMUTABILITY: Reject PUT, general PATCH, and DELETE on payments
router.put('/:id', (_req: Request, res: Response) => {
  res.status(405).json({
    success: false,
    error: 'Financial records are immutable. Payment details cannot be edited.',
  });
});

router.patch('/:id', (_req: Request, res: Response) => {
  res.status(405).json({
    success: false,
    error: 'Financial records are immutable. Payments can only be verified or rejected via /payments/:id/verify.',
  });
});

router.delete('/:id', (_req: Request, res: Response) => {
  res.status(405).json({
    success: false,
    error: 'Financial records are immutable. Payment records cannot be deleted.',
  });
});

export default router;

