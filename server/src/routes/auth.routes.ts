import { Router, Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';
import { registerSchema, loginSchema } from '../schemas';

const router = Router();

// POST /auth/register [public]
router.post('/register', authLimiter, validate(registerSchema), async (req: Request, res: Response) => {
  try {
    const { email, password, role, full_name, phone, pg_name } = req.body;
    const result = await authService.register(email, password, role, full_name, phone, pg_name);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// POST /auth/login [public]
router.post('/login', authLimiter, validate(loginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(401).json({ success: false, error: (err as Error).message });
  }
});

// POST /auth/refresh [public]
router.post('/refresh', authLimiter, async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ success: false, error: 'Refresh token required' });
      return;
    }
    const result = await authService.refreshAccessToken(refreshToken);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(401).json({ success: false, error: (err as Error).message });
  }
});

// POST /auth/logout
router.post('/logout', authenticate, async (_req: Request, res: Response) => {
  // JWT is stateless — client discards token; server-side invalidation
  // would require a token blacklist (deferred to Phase 2)
  res.json({ success: true, message: 'Logged out' });
});

// GET /auth/me
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const data = await authService.getMe(req.user!.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

export default router;
