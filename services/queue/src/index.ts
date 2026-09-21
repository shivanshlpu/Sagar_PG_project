import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export interface NotificationJobData {
  type: 'whatsapp' | 'email' | 'in_app';
  recipientPhone?: string;
  recipientEmail?: string;
  tenantId?: string;
  template: string;
  params: Record<string, string | number>;
  scheduledFor?: string;
}

export const notificationQueue = new Queue<NotificationJobData>('notifications', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export function startNotificationWorker() {
  const worker = new Worker<NotificationJobData>(
    'notifications',
    async (job: Job<NotificationJobData>) => {
      console.log(`[Queue Worker] Processing job ${job.id} (${job.data.type}):`, job.data.template);

      if (job.data.type === 'whatsapp') {
        // Dispatched to WhatsApp microservice or handled via webhook
        console.log(`[Queue Worker] Dispatched WhatsApp to ${job.data.recipientPhone}`);
      }

      return { processedAt: new Date().toISOString() };
    },
    { connection: redisConnection }
  );

  worker.on('completed', (job: Job) => {
    console.log(`[Queue Worker] Job ${job.id} completed.`);
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(`[Queue Worker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

if (require.main === module) {
  console.log('[Queue Worker] Starting BullMQ notification worker...');
  startNotificationWorker();
}
