import { Router, Request, Response } from 'express';
import * as complaintsService from '../services/complaints.service';
import { authenticate, authorize, requirePg } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createComplaintSchema, updateComplaintSchema, createCommentSchema } from '../schemas';

const router = Router();

router.use(authenticate, requirePg);

// GET /complaints [Admin or Tenant]
router.get('/', async (req: Request, res: Response) => {
  try {
    const filters = { ...(req.query as Record<string, string>) };
    if (req.user!.role === 'tenant') {
      filters.tenant_id = req.user!.tenantId || req.user!.id;
    }
    const data = await complaintsService.listComplaints(req.user!.pgId, filters);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// POST /complaints [Tenant]
router.post('/', authorize('tenant'), validate(createComplaintSchema), async (req: Request, res: Response) => {
  try {
    const data = await complaintsService.createComplaint(
      req.user!.pgId,
      req.user!.tenantId || req.user!.id,
      req.body
    );
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// GET /complaints/:id [Admin or Tenant self]
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.role === 'tenant' ? (req.user!.tenantId || req.user!.id) : undefined;
    const data = await complaintsService.getComplaint(req.user!.pgId, req.params.id, tenantId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(404).json({ success: false, error: (err as Error).message });
  }
});

// PATCH /complaints/:id [Admin]
router.patch('/:id', authorize('admin'), validate(updateComplaintSchema), async (req: Request, res: Response) => {
  try {
    const data = await complaintsService.updateComplaint(req.user!.pgId, req.params.id, req.body, { id: req.user!.id, email: req.user!.email });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// POST /complaints/:id/comments [Admin/Tenant]
router.post('/:id/comments', validate(createCommentSchema), async (req: Request, res: Response) => {
  try {
    const data = await complaintsService.addComment(
      req.user!.pgId,
      req.params.id,
      req.user!.id,
      req.user!.role,
      req.body.content
    );
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// Reject DELETE on complaints (preserve audit history)
router.delete('/:id', (_req: Request, res: Response) => {
  res.status(405).json({
    success: false,
    error: 'Complaints cannot be deleted. Update status to resolved instead.',
  });
});

export default router;

