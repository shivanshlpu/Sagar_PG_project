import express, { Request, Response } from 'express';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.WHATSAPP_PORT || 3001;
const SESSIONS_DIR = path.join(__dirname, '../sessions');

if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

let sock: any = null;
let currentQr: string | null = null;
let connectionStatus: 'disconnected' | 'pairing' | 'connected' = 'disconnected';

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSIONS_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }) as any,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update: any) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQr = await QRCode.toDataURL(qr);
      connectionStatus = 'pairing';
      console.log('[WhatsApp] New QR code generated');
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
      connectionStatus = 'disconnected';
      currentQr = null;
      console.log('[WhatsApp] Connection closed. Reconnecting:', shouldReconnect);
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      connectionStatus = 'connected';
      currentQr = null;
      console.log('[WhatsApp] Connection opened successfully');
    }
  });
}

// REST Endpoints for Admin Web App
app.get('/status', (_req: Request, res: Response) => {
  res.json({
    status: connectionStatus,
    hasQr: !!currentQr,
  });
});

app.get('/qr', (_req: Request, res: Response) => {
  if (connectionStatus === 'connected') {
    return res.status(400).json({ error: 'Already connected' });
  }
  if (!currentQr) {
    return res.status(404).json({ error: 'QR not ready or already connected' });
  }
  res.json({ qr: currentQr });
});

app.post('/connect', async (_req: Request, res: Response) => {
  if (connectionStatus === 'connected') {
    return res.json({ message: 'Already connected' });
  }
  await connectToWhatsApp();
  res.json({ message: 'Connection initiated' });
});

app.post('/disconnect', async (_req: Request, res: Response) => {
  if (sock) {
    await sock.logout();
    sock = null;
  }
  connectionStatus = 'disconnected';
  currentQr = null;
  res.json({ message: 'Disconnected' });
});

app.post('/send', async (req: Request, res: Response) => {
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: 'Phone and message required' });
  }

  if (connectionStatus !== 'connected' || !sock) {
    return res.status(503).json({ error: 'WhatsApp service is not connected' });
  }

  try {
    const jid = `${phone.replace(/\D/g, '')}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: message });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[WhatsApp Service] Running on port ${PORT}`);
});
