import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';

const SESSIONS_DIR = path.resolve(__dirname, '../../sessions');

if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

export interface WhatsAppState {
  status: 'disconnected' | 'pairing' | 'connected';
  hasQr: boolean;
  qr: string | null;
  pairingCode: string | null;
  phoneNumber?: string | null;
  connectedAt?: string | null;
  lastError?: string | null;
}

let sock: any = null;
let currentQr: string | null = null;
let pairingCode: string | null = null;
let connectionStatus: 'disconnected' | 'pairing' | 'connected' = 'disconnected';
let connectedPhone: string | null = null;
let connectedAt: string | null = null;
let lastError: string | null = null;
let isInitializing = false;
let isSocketReadyForPairing = false;

// Callbacks waiting for socket ready / QR
let qrResolvers: Array<(qr: string) => void> = [];
let readyResolvers: Array<() => void> = [];

export function hasExistingSession(): boolean {
  try {
    const credsPath = path.join(SESSIONS_DIR, 'creds.json');
    return fs.existsSync(credsPath);
  } catch {
    return false;
  }
}

export function getSavedPhone(): string | null {
  try {
    const credsPath = path.join(SESSIONS_DIR, 'creds.json');
    if (fs.existsSync(credsPath)) {
      const data = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
      if (data?.me?.id) {
        return data.me.id.split(':')[0].replace(/\D/g, '');
      }
    }
  } catch {}
  return null;
}

export function initWhatsAppIfSessionExists(): void {
  if (hasExistingSession()) {
    console.log('[WhatsApp] Existing session found on disk. Connecting automatically...');
    connectWhatsApp().catch((err) => console.error('[WhatsApp Auto-Init Error]:', err.message));
  }
}

export function getWhatsAppStatus(): WhatsAppState {
  // If disconnected but a saved session exists on disk, trigger automatic reconnection in the background
  if (connectionStatus === 'disconnected' && !isInitializing && hasExistingSession()) {
    console.log('[WhatsApp] Auto-connecting saved session on status check...');
    connectWhatsApp().catch((err) => console.error('[WhatsApp Auto-Connect Error]:', err.message));
  }

  const phone = connectedPhone || (connectionStatus === 'connected' ? getSavedPhone() : null);

  return {
    status: connectionStatus,
    hasQr: !!currentQr,
    qr: currentQr,
    pairingCode,
    phoneNumber: phone,
    connectedAt,
    lastError,
  };
}

export async function connectWhatsApp(): Promise<WhatsAppState> {
  if (connectionStatus === 'connected' && sock) {
    return getWhatsAppStatus();
  }

  // If already initializing and we have a QR code, return immediately
  if (isInitializing && currentQr) {
    return getWhatsAppStatus();
  }

  if (!isInitializing) {
    isInitializing = true;
    lastError = null;
    if (connectionStatus !== 'connected') {
      connectionStatus = 'pairing';
    }
    isSocketReadyForPairing = false;

    try {
      const { state, saveCreds } = await useMultiFileAuthState(SESSIONS_DIR);
      const { version } = await fetchLatestBaileysVersion();

      sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
      });

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            currentQr = await QRCode.toDataURL(qr, { margin: 2, scale: 8 });
            connectionStatus = 'pairing';
            isSocketReadyForPairing = true;
            console.log('[WhatsApp] New QR code generated');

            // Notify all waiters
            qrResolvers.forEach((r) => r(currentQr!));
            qrResolvers = [];
            readyResolvers.forEach((r) => r());
            readyResolvers = [];
          } catch (qrErr: any) {
            console.error('[WhatsApp] Failed to generate QR data URL:', qrErr.message);
          }
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          connectionStatus = 'disconnected';
          currentQr = null;
          pairingCode = null;
          connectedPhone = null;
          connectedAt = null;
          isSocketReadyForPairing = false;
          lastError = lastDisconnect?.error?.message || 'Connection closed';
          console.log(`[WhatsApp] Closed (${statusCode}). Reconnecting: ${shouldReconnect}`);

          if (shouldReconnect && statusCode !== 401) {
            setTimeout(() => {
              connectWhatsApp().catch((err) => console.error('[WhatsApp Reconnect Error]:', err.message));
            }, 5000);
          }
        } else if (connection === 'open') {
          connectionStatus = 'connected';
          currentQr = null;
          pairingCode = null;
          isSocketReadyForPairing = true;
          connectedAt = new Date().toISOString();
          connectedPhone = sock?.user?.id?.split(':')[0] || getSavedPhone() || null;
          lastError = null;
          console.log(`[WhatsApp] Connected successfully as ${connectedPhone}`);

          readyResolvers.forEach((r) => r());
          readyResolvers = [];
        }
      });
    } catch (err: any) {
      lastError = err.message;
      connectionStatus = 'disconnected';
      isInitializing = false;
      console.error('[WhatsApp Init Error]:', err.message);
      throw err;
    } finally {
      isInitializing = false;
    }
  }

  // If QR is already generated or already connected, return right away
  if (currentQr || connectionStatus === 'connected') {
    return getWhatsAppStatus();
  }

  // Otherwise wait up to 6 seconds for the initial connection / QR
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), 6000);
    qrResolvers.push(() => {
      clearTimeout(timer);
      resolve();
    });
    readyResolvers.push(() => {
      clearTimeout(timer);
      resolve();
    });
  });

  return getWhatsAppStatus();
}

export async function requestPairingCode(phoneNumber: string): Promise<string> {
  const cleanNumber = phoneNumber.replace(/\D/g, '');
  if (cleanNumber.length < 10) {
    throw new Error('Please provide a valid 10-15 digit phone number with country code (e.g. 919876543210)');
  }

  // Ensure socket is created
  if (!sock) {
    await connectWhatsApp();
  }

  // If socket is not yet ready to receive pairing code, wait for it
  if (!isSocketReadyForPairing && connectionStatus !== 'connected') {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), 7000);
      readyResolvers.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  try {
    const code = await sock.requestPairingCode(cleanNumber);
    pairingCode = code;
    connectionStatus = 'pairing';
    console.log(`[WhatsApp] Pairing code generated: ${code} for ${cleanNumber}`);
    return code;
  } catch (err: any) {
    console.error('[WhatsApp Pairing Code Error]:', err.message);
    throw new Error(`Failed to request pairing code: ${err.message}`);
  }
}

export async function disconnectWhatsApp(): Promise<void> {
  if (sock) {
    try {
      await sock.logout();
    } catch {
      // Ignore logout errors if socket is already closed
    }
    sock = null;
  }

  connectionStatus = 'disconnected';
  currentQr = null;
  pairingCode = null;
  connectedPhone = null;
  connectedAt = null;
  isSocketReadyForPairing = false;

  // Clean sessions dir so fresh credentials / QR are generated on next connect
  if (fs.existsSync(SESSIONS_DIR)) {
    try {
      fs.rmSync(SESSIONS_DIR, { recursive: true, force: true });
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    } catch (e: any) {
      console.warn('[WhatsApp] Could not clean sessions dir:', e.message);
    }
  }
}

/**
 * Normalizes phone numbers to standard international format (without + or spaces).
 * Automatically prefixes 10-digit Indian numbers with country code 91.
 */
export function normalizePhoneNumber(phone: string): string {
  let clean = phone.replace(/\D/g, '');
  if (clean.length === 10) {
    clean = `91${clean}`;
  } else if (clean.length === 11 && clean.startsWith('0')) {
    clean = `91${clean.slice(1)}`;
  }
  return clean;
}

interface QueuedMessage {
  id: string;
  jid: string;
  text: string;
  resolve: () => void;
  reject: (err: Error) => void;
  enqueuedAt: number;
}

const messageQueue: QueuedMessage[] = [];
let isProcessingQueue = false;

// Max 3 messages per second = 350ms minimum gap between consecutive messages
const MESSAGE_INTERVAL_MS = 350;

async function processMessageQueue(): Promise<void> {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (messageQueue.length > 0) {
    const item = messageQueue.shift();
    if (!item) break;

    try {
      if (connectionStatus !== 'connected' || !sock) {
        throw new Error('WhatsApp service is not connected');
      }

      console.log(`[WhatsApp Queue] Sending to ${item.jid} (${messageQueue.length} pending in queue)`);
      await sock.sendMessage(item.jid, { text: item.text });
      console.log(`[WhatsApp Queue] Successfully sent to ${item.jid}`);
      item.resolve();
    } catch (err: any) {
      console.error(`[WhatsApp Queue Error] Failed to send to ${item.jid}:`, err.message);
      item.reject(err);
    }

    // Enforce rate limit (max 3 messages per second)
    if (messageQueue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, MESSAGE_INTERVAL_MS));
    }
  }

  isProcessingQueue = false;
}

export async function sendWhatsAppMessage(phone: string, text: string): Promise<void> {
  if (connectionStatus !== 'connected' || !sock) {
    throw new Error('WhatsApp service is not connected. Please ensure WhatsApp is connected in Settings.');
  }

  const cleanPhone = normalizePhoneNumber(phone);
  const jid = `${cleanPhone}@s.whatsapp.net`;

  return new Promise<void>((resolve, reject) => {
    messageQueue.push({
      id: Math.random().toString(36).substring(2, 9),
      jid,
      text,
      resolve,
      reject,
      enqueuedAt: Date.now(),
    });

    processMessageQueue().catch((err) => {
      console.error('[WhatsApp Queue Error]:', err);
    });
  });
}
