import { Router, Request, Response } from 'express';
import * as announcementsService from '../services/announcements.service';
import { authenticate, authorize, requirePg } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createAnnouncementSchema, updateAnnouncementSchema } from '../schemas';

const router = Router();

// GET /announcements - List announcements for user's PG [Admin/Tenant]
router.get('/', authenticate, requirePg, async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || (req.user!.role === 'admin' ? 'all' : 'active');
    const data = await announcementsService.listAnnouncements(req.user!.pgId!, status);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// POST /announcements - Create announcement [Admin]
router.post('/', authenticate, authorize('admin'), requirePg, validate(createAnnouncementSchema), async (req: Request, res: Response) => {
  try {
    const data = await announcementsService.createAnnouncement(req.user!.pgId!, req.body, {
      id: req.user!.id,
      email: req.user!.email,
    });
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// PATCH /announcements/:id - Update announcement [Admin]
router.patch('/:id', authenticate, authorize('admin'), requirePg, validate(updateAnnouncementSchema), async (req: Request, res: Response) => {
  try {
    const data = await announcementsService.updateAnnouncement(req.user!.pgId!, req.params.id, req.body, {
      id: req.user!.id,
      email: req.user!.email,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// DELETE /announcements/:id - Delete/Archive announcement [Admin]
router.delete('/:id', authenticate, authorize('admin'), requirePg, async (req: Request, res: Response) => {
  try {
    await announcementsService.deleteAnnouncement(req.user!.pgId!, req.params.id, {
      id: req.user!.id,
      email: req.user!.email,
    });
    res.json({ success: true, message: 'Announcement deleted' });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

export default router;
