import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { supabaseAdmin } from '../config/supabase';

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
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let reconnectTimer: NodeJS.Timeout | null = null;

// Callbacks waiting for socket ready / QR
let qrResolvers: Array<(qr: string) => void> = [];
let readyResolvers: Array<() => void> = [];

// Debounced timer for persisting session files to Supabase DB
let saveDbTimer: NodeJS.Timeout | null = null;

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

/**
 * Persists all session files from disk into Supabase database.
 * This guarantees that when a new update is pushed to git or the container restarts,
 * the session is NOT lost even if the local disk is wiped.
 */
async function syncSessionToDatabase(): Promise<void> {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) return;
    const files = fs.readdirSync(SESSIONS_DIR);
    if (!files.includes('creds.json')) return;

    const sessionFiles: Record<string, string> = {};
    for (const file of files) {
      const filePath = path.join(SESSIONS_DIR, file);
      if (fs.statSync(filePath).isFile()) {
        sessionFiles[file] = fs.readFileSync(filePath, 'utf8');
      }
    }

    await supabaseAdmin
      .from('settings')
      .upsert(
        {
          key: 'whatsapp_session_backup',
          value: { files: sessionFiles, savedAt: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );
    console.log(`[WhatsApp] Persisted session (${Object.keys(sessionFiles).length} files) to database.`);
  } catch (err: any) {
    console.warn('[WhatsApp] Failed to backup session to database:', err.message);
  }
}

function debouncedSaveSessionToDatabase() {
  if (saveDbTimer) clearTimeout(saveDbTimer);
  saveDbTimer = setTimeout(() => {
    syncSessionToDatabase().catch((e) => console.warn('[WhatsApp Backup Warn]:', e.message));
  }, 2000);
}

/**
 * Restores session credentials from Supabase database onto local disk if disk session was wiped.
 */
export async function restoreSessionFromDatabase(): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'whatsapp_session_backup')
      .maybeSingle();

    if (error || !data?.value?.files) return false;

    const files = data.value.files as Record<string, string>;
    if (!files['creds.json']) return false;

    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }

    for (const [name, content] of Object.entries(files)) {
      if (typeof content === 'string') {
        fs.writeFileSync(path.join(SESSIONS_DIR, name), content, 'utf8');
      }
    }

    console.log(`[WhatsApp] Restored session (${Object.keys(files).length} files) from DB backup.`);
    return true;
  } catch (err: any) {
    console.warn('[WhatsApp] Could not restore session from database:', err.message);
    return false;
  }
}

export async function initWhatsAppIfSessionExists(): Promise<void> {
  // 1. If no session on disk, attempt to restore from Supabase DB first
  if (!hasExistingSession()) {
    try {
      await restoreSessionFromDatabase();
    } catch (e: any) {
      console.warn('[WhatsApp DB Restore Error]:', e.message);
    }
  }

  // 2. If session exists (either on disk or restored from DB), connect automatically!
  if (hasExistingSession()) {
    console.log('[WhatsApp] Existing session found. Connecting automatically...');
    connectWhatsApp().catch((err) => console.error('[WhatsApp Auto-Init Error]:', err.message));
  }
}

export function getWhatsAppStatus(): WhatsAppState {
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
  // Already connected with an active socket? Don't create another!
  if (connectionStatus === 'connected' && sock) {
    return getWhatsAppStatus();
  }

  // If already initializing and waiting for QR or open connection, don't create multiple sockets!
  if (isInitializing) {
    return getWhatsAppStatus();
  }

  // Check if session can be restored from DB before starting pairing from scratch
  if (!hasExistingSession()) {
    try {
      await restoreSessionFromDatabase();
    } catch {}
  }

  isInitializing = true;
  lastError = null;
  if (connectionStatus !== 'connected') {
    connectionStatus = 'pairing';
  }
  isSocketReadyForPairing = false;

  // Clean up any stale/zombie socket before opening a new one to prevent WhatsApp conflict
  if (sock) {
    try {
      sock.ev.removeAllListeners('connection.update');
      sock.ev.removeAllListeners('creds.update');
      sock.end(undefined);
    } catch {}
    sock = null;
  }

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

    sock.ev.on('creds.update', async () => {
      await saveCreds();
      debouncedSaveSessionToDatabase();
    });

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
        const isRestartRequired = statusCode === DisconnectReason.restartRequired;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const shouldReconnect = isRestartRequired || (!isLoggedOut && statusCode !== 440);

        connectionStatus = 'disconnected';
        currentQr = null;
        pairingCode = null;
        isSocketReadyForPairing = false;
        lastError = lastDisconnect?.error?.message || 'Connection closed';
        console.log(`[WhatsApp] Closed (${statusCode}). Reconnecting: ${shouldReconnect} (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }

        if (isLoggedOut) {
          reconnectAttempts = 0;
          console.log('[WhatsApp] Session logged out. Discontinuing reconnection.');
          return;
        }

        if (shouldReconnect || hasExistingSession()) {
          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            const delay = isRestartRequired ? 1500 : Math.min(2000 * Math.pow(2, reconnectAttempts), 30000);
            console.log(`[WhatsApp] Scheduling reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms...`);
            reconnectTimer = setTimeout(() => {
              connectWhatsApp().catch((err) => console.error('[WhatsApp Reconnect Error]:', err.message));
            }, delay);
          } else {
            console.warn('[WhatsApp] Max reconnection attempts reached. Pausing auto-reconnect until manual retry.');
          }
        }
      } else if (connection === 'open') {
        reconnectAttempts = 0;
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        connectionStatus = 'connected';
        currentQr = null;
        pairingCode = null;
        isSocketReadyForPairing = true;
        connectedAt = new Date().toISOString();
        connectedPhone = sock?.user?.id?.split(':')[0] || getSavedPhone() || null;
        lastError = null;
        console.log(`[WhatsApp] Connected successfully as ${connectedPhone}`);

        // Persist fresh verified session to database
        debouncedSaveSessionToDatabase();

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

  // Clean DB backup
  try {
    await supabaseAdmin.from('settings').delete().eq('key', 'whatsapp_session_backup');
  } catch (e: any) {
    console.warn('[WhatsApp] Could not clean DB backup:', e.message);
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
  imageBuffer?: Buffer | null;
  resolve: () => void;
  reject: (err: Error) => void;
  enqueuedAt: number;
}

const messageQueue: QueuedMessage[] = [];
let isProcessingQueue = false;

/**
 * Decodes a base64 Data URL (e.g. data:image/png;base64,...) or raw base64 string into a Buffer.
 */
export function decodeBase64Image(dataOrUrl: string): Buffer | null {
  try {
    if (!dataOrUrl || typeof dataOrUrl !== 'string') return null;
    const matches = dataOrUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      return Buffer.from(matches[2], 'base64');
    }
    return Buffer.from(dataOrUrl, 'base64');
  } catch (e: any) {
    console.warn('[WhatsApp] Failed to decode base64 image:', e?.message);
    return null;
  }
}

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

      // Anti-Spam: Simulate natural human typing presence before dispatching
      try {
        await sock.sendPresenceUpdate('composing', item.jid);
        await new Promise((r) => setTimeout(r, 1000 + Math.floor(Math.random() * 800)));
        await sock.sendPresenceUpdate('paused', item.jid);
      } catch {}

      console.log(`[WhatsApp Queue] Sending to ${item.jid} (${messageQueue.length} pending in queue, hasImage: ${Boolean(item.imageBuffer)})`);
      if (item.imageBuffer) {
        try {
          await sock.sendMessage(item.jid, {
            image: item.imageBuffer,
            caption: item.text,
          });
        } catch (imgErr: any) {
          console.warn(`[WhatsApp Queue] Failed to send image to ${item.jid}, falling back to text:`, imgErr.message);
          await sock.sendMessage(item.jid, { text: item.text });
        }
      } else {
        await sock.sendMessage(item.jid, { text: item.text });
      }

      console.log(`[WhatsApp Queue] Successfully sent to ${item.jid}`);
      item.resolve();
    } catch (err: any) {
      console.error(`[WhatsApp Queue Error] Failed to send to ${item.jid}:`, err.message);
      item.reject(err);
    }

    // Anti-Ban & Anti-Spam: Enforce natural human-like jitter delay (2.5s – 4.5s) between consecutive messages
    if (messageQueue.length > 0) {
      const naturalDelay = 2500 + Math.floor(Math.random() * 2000);
      await new Promise((resolve) => setTimeout(resolve, naturalDelay));
    }
  }

  isProcessingQueue = false;
}

export async function sendWhatsAppMessage(
  phone: string,
  text: string,
  options?: { imageBuffer?: Buffer | null }
): Promise<void> {
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
      imageBuffer: options?.imageBuffer || null,
      resolve,
      reject,
      enqueuedAt: Date.now(),
    });

    processMessageQueue().catch((err) => {
      console.error('[WhatsApp Queue Error]:', err);
    });
  });
}

