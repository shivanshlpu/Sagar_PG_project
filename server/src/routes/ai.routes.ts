import { Router, Request, Response, NextFunction } from 'express';
import { queryPGAgent, getSuggestedQuestions } from '../services/ai.service';
import { authenticate, authorize, requirePg } from '../middleware/auth';

const router = Router();

router.use(authenticate, requirePg, authorize('admin'));

// POST /api/v1/ai/query
router.post('/query', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const pgId = req.user?.pgId;
    if (!pgId) {
      res.status(400).json({ success: false, error: 'No PG associated with this account' });
      return;
    }

    const { query, language = 'hinglish' } = req.body;
    if (!query || typeof query !== 'string') {
      res.status(400).json({ success: false, error: 'Query is required' });
      return;
    }

    const result = await queryPGAgent(pgId, query, language);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /api/v1/ai/suggestions
router.get('/suggestions', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const lang = (req.query.lang as 'hi' | 'en' | 'hinglish') || 'hinglish';
    const suggestions = getSuggestedQuestions(lang);
    res.json({ success: true, data: { suggestions } });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
