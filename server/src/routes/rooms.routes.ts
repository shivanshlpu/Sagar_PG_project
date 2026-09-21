import { Router, Request, Response } from 'express';
import * as roomsService from '../services/rooms.service';
import { authenticate, authorize, requirePg } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createRoomSchema, updateRoomSchema, assignBedSchema } from '../schemas';

const router = Router();

// GET /rooms/available [Authenticated tenants & admins in PG]
router.get('/available', authenticate, requirePg, async (req: Request, res: Response) => {
  try {
    const data = await roomsService.listRooms(req.user!.pgId);
    // Filter to rooms with vacant beds
    const available = (data || []).map((r: any) => ({
      ...r,
      beds: (r.beds || []).filter((b: any) => b.status === 'vacant'),
    })).filter((r: any) => r.beds.length > 0);
    res.json({ success: true, data: available });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

router.use(authenticate, requirePg, authorize('admin'));

// GET /rooms
router.get('/', async (req: Request, res: Response) => {
  try {
    const data = await roomsService.listRooms(req.user!.pgId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// POST /rooms
router.post('/', validate(createRoomSchema), async (req: Request, res: Response) => {
  try {
    const data = await roomsService.createRoom(req.user!.pgId, req.body, { id: req.user!.id, email: req.user!.email });
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// GET /rooms/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const data = await roomsService.getRoom(req.user!.pgId, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(404).json({ success: false, error: (err as Error).message });
  }
});

// PATCH /rooms/:id
router.patch('/:id', validate(updateRoomSchema), async (req: Request, res: Response) => {
  try {
    const data = await roomsService.updateRoom(req.user!.pgId, req.params.id, req.body, { id: req.user!.id, email: req.user!.email });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// DELETE /rooms/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await roomsService.deleteRoom(req.user!.pgId, req.params.id, { id: req.user!.id, email: req.user!.email });
    res.json({ success: true, message: 'Room deleted' });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// GET /rooms/:id/beds
router.get('/:id/beds', async (req: Request, res: Response) => {
  try {
    const data = await roomsService.getRoomBeds(req.user!.pgId, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// PATCH /rooms/:id/beds/:bedId
router.patch('/:id/beds/:bedId', validate(assignBedSchema), async (req: Request, res: Response) => {
  try {
    const data = await roomsService.updateBed(req.user!.pgId, req.params.id, req.params.bedId, req.body, { id: req.user!.id, email: req.user!.email });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

export default router;
