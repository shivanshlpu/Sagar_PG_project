import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { env } from '../config/env';

const router = Router();

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

router.get('/', async (_req: Request, res: Response) => {
  const startTime = Date.now();
  let dbStatus: 'connected' | 'disconnected' = 'disconnected';
  let dbLatencyMs = 0;
  let dbError: string | null = null;

  try {
    const dbCheckStart = Date.now();
    // Lightweight count query to verify DB connectivity
    const { error } = await supabaseAdmin
      .from('pgs')
      .select('id', { count: 'exact', head: true })
      .limit(1);

    dbLatencyMs = Date.now() - dbCheckStart;

    if (error) {
      dbStatus = 'disconnected';
      dbError = error.message;
    } else {
      dbStatus = 'connected';
    }
  } catch (err: any) {
    dbStatus = 'disconnected';
    dbError = err.message || 'Unknown database error';
  }

  const memory = process.memoryUsage();
  const uptimeSeconds = process.uptime();

  const isHealthy = dbStatus === 'connected';
  const statusCode = isHealthy ? 200 : 503;

  res.status(statusCode).json({
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    uptime: {
      seconds: Math.floor(uptimeSeconds),
      formatted: formatUptime(uptimeSeconds),
    },
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
      ...(dbError ? { error: dbError } : {}),
    },
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      memory: {
        heapUsedMB: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
        heapTotalMB: Math.round((memory.heapTotal / 1024 / 1024) * 100) / 100,
        rssMB: Math.round((memory.rss / 1024 / 1024) * 100) / 100,
      },
    },
    responseTimeMs: Date.now() - startTime,
  });
});

export default router;
