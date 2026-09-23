// Allow local self-signed CA certificates on Windows/dev environments (e.g. Lenovo Vantage / antivirus proxying Baileys WebSockets)
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { apiLimiter } from './middleware/rateLimit';

// Route imports
import authRoutes from './routes/auth.routes';
import pgRoutes from './routes/pg.routes';
import announcementsRoutes from './routes/announcements.routes';
import roomsRoutes from './routes/rooms.routes';
import tenantsRoutes from './routes/tenants.routes';
import rentRoutes from './routes/rent.routes';
import electricityRoutes from './routes/electricity.routes';
import paymentsRoutes from './routes/payments.routes';
import complaintsRoutes from './routes/complaints.routes';
import settingsRoutes from './routes/settings.routes';
import reportsRoutes from './routes/reports.routes';
import moveInOutRoutes from './routes/moveInOut.routes';
import notificationsRoutes, { auditLogRouter } from './routes/notifications.routes';
import whatsappRoutes from './routes/whatsapp.routes';
import assetsRoutes from './routes/assets.routes';
import aiRoutes from './routes/ai.routes';
import healthRoutes from './routes/health.routes';

const app = express();

// Global middleware
app.use(helmet());
app.use(cors({
  origin: env.NODE_ENV === 'production'
    ? [
        'https://sagar-pg-project.pages.dev',
        ...(process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || []),
      ]
    : [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:5175',
        'http://localhost:3000',
        /^http:\/\/localhost:\d+$/,
      ],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Anti-Slowloris / Hanging connection timeout (15 seconds)
app.use((_req, res, next) => {
  res.setTimeout(15000, () => {
    if (!res.headersSent) {
      res.status(408).json({ success: false, error: 'Request timeout: server took too long to respond' });
    }
  });
  next();
});

app.use(morgan('dev'));

// Health Monitor Endpoints (mounted before rate limiter for uptime monitors)
app.use('/health', healthRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/v1/health', healthRoutes);

app.use(apiLimiter);

// API v1 routes — matches Section 6 endpoint spec
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/pg', pgRoutes);
app.use('/api/v1/announcements', announcementsRoutes);
app.use('/api/v1/rooms', roomsRoutes);
app.use('/api/v1/tenants', tenantsRoutes);
app.use('/api/v1/rent', rentRoutes);
app.use('/api/v1/electricity', electricityRoutes);
app.use('/api/v1/payments', paymentsRoutes);
app.use('/api/v1/complaints', complaintsRoutes);
app.use('/api/v1/reports', reportsRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
app.use('/api/v1/audit-log', auditLogRouter);
app.use('/api/v1', settingsRoutes); // Mounts /contacts and /settings/* routes
app.use('/api/v1/whatsapp', whatsappRoutes); // Mounts /api/v1/whatsapp/*
app.use('/api/v1/assets', assetsRoutes); // Mounts /api/v1/assets
app.use('/api/v1/ai', aiRoutes); // Mounts /api/v1/ai
app.use('/api/v1/tenants', moveInOutRoutes); // Mounts /tenants/:id/move-in and /tenants/:id/move-out

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({
    success: false,
    error: env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

import { initWhatsAppIfSessionExists } from './services/whatsapp.service';
import { startReminderCron } from './services/reminders.service';

// Keep-Alive Worker for free-tier hosting (e.g. Render / Railway)
function startKeepAlive() {
  const url = process.env.RENDER_EXTERNAL_URL || process.env.KEEP_ALIVE_URL;
  if (!url) return;

  const PING_INTERVAL = 10 * 60 * 1000; // Ping every 10 minutes (Render sleeps after 15m)
  console.log(`[Keep-Alive] Configured for ${url}/api/health (every 10m)`);

  setInterval(async () => {
    try {
      const pingUrl = `${url.replace(/\/$/, '')}/api/health`;
      await fetch(pingUrl);
    } catch (e: any) {
      console.warn(`[Keep-Alive] Ping failed:`, e.message);
    }
  }, PING_INTERVAL);
}

app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT}`);
  console.log(`Environment: ${env.NODE_ENV}`);
  initWhatsAppIfSessionExists().catch((err) => console.error('[WhatsApp Startup Error]:', err.message));
  startKeepAlive();
  startReminderCron();
});

export default app;
