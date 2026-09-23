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
  pgId?: string;
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

export interface WhatsAppSession {
  pgId: string;
  sock: any | null;
  status: 'disconnected' | 'pairing' | 'connected';
  currentQr: string | null;
  pairingCode: string | null;
  connectedPhone: string | null;
  connectedAt: string | null;
  lastError: string | null;
  isInitializing: boolean;
  isSocketReadyForPairing: boolean;
  reconnectAttempts: number;
  reconnectTimer: NodeJS.Timeout | null;
  qrResolvers: Array<(qr: string) => void>;
  readyResolvers: Array<() => void>;
  saveDbTimer: NodeJS.Timeout | null;
  messageQueue: QueuedMessage[];
  isProcessingQueue: boolean;
}

const MAX_RECONNECT_ATTEMPTS = 5;

// In-Memory Multi-Session Registry: Map<pgId, WhatsAppSession>
const sessions = new Map<string, WhatsAppSession>();

/**
 * Resolves the directory on disk for a specific PG's session files.
 * Preserves legacy 'server/sessions/' root when 'default' creds are present.
 */
export function getSessionDir(pgId: string = 'default'): string {
  // If 'default' session and creds.json exists directly in SESSIONS_DIR, preserve it to prevent re-pairing
  if (pgId === 'default' && fs.existsSync(path.join(SESSIONS_DIR, 'creds.json'))) {
    return SESSIONS_DIR;
  }
  const dir = path.join(SESSIONS_DIR, pgId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Returns the Supabase settings table key for backing up session files.
 */
function getDbBackupKey(pgId: string = 'default'): string {
  return pgId === 'default' ? 'whatsapp_session_backup' : `whatsapp_session_${pgId}`;
}

/**
 * Retrieves or lazily creates a session state object in memory for a given pgId.
 */
export function getOrCreateSession(pgId: string = 'default'): WhatsAppSession {
  let session = sessions.get(pgId);
  if (!session) {
    session = {
      pgId,
      sock: null,
      status: 'disconnected',
      currentQr: null,
      pairingCode: null,
      connectedPhone: null,
      connectedAt: null,
      lastError: null,
      isInitializing: false,
      isSocketReadyForPairing: false,
      reconnectAttempts: 0,
      reconnectTimer: null,
      qrResolvers: [],
      readyResolvers: [],
      saveDbTimer: null,
      messageQueue: [],
      isProcessingQueue: false,
    };
    sessions.set(pgId, session);
  }
  return session;
}

export function hasExistingSession(pgId: string = 'default'): boolean {
  try {
    const sessionDir = getSessionDir(pgId);
    const credsPath = path.join(sessionDir, 'creds.json');
    return fs.existsSync(credsPath);
  } catch {
    return false;
  }
}

export function getSavedPhone(pgId: string = 'default'): string | null {
  try {
    const sessionDir = getSessionDir(pgId);
    const credsPath = path.join(sessionDir, 'creds.json');
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
 * Persists session files from local disk into Supabase database for a given pgId.
 */
async function syncSessionToDatabase(pgId: string = 'default'): Promise<void> {
  try {
    const sessionDir = getSessionDir(pgId);
    if (!fs.existsSync(sessionDir)) return;
    const files = fs.readdirSync(sessionDir);
    if (!files.includes('creds.json')) return;

    const sessionFiles: Record<string, string> = {};
    for (const file of files) {
      const filePath = path.join(sessionDir, file);
      if (fs.statSync(filePath).isFile()) {
        sessionFiles[file] = fs.readFileSync(filePath, 'utf8');
      }
    }

    const key = getDbBackupKey(pgId);
    await supabaseAdmin
      .from('settings')
      .upsert(
        {
          key,
          value: { files: sessionFiles, pgId, savedAt: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );
    console.log(`[WhatsApp ${pgId}] Persisted session (${Object.keys(sessionFiles).length} files) to database [${key}].`);
  } catch (err: any) {
    console.warn(`[WhatsApp ${pgId}] Failed to backup session to database:`, err.message);
  }
}

function debouncedSaveSessionToDatabase(session: WhatsAppSession) {
  if (session.saveDbTimer) clearTimeout(session.saveDbTimer);
  session.saveDbTimer = setTimeout(() => {
    syncSessionToDatabase(session.pgId).catch((e) =>
      console.warn(`[WhatsApp ${session.pgId} Backup Warn]:`, e.message)
    );
  }, 2000);
}

/**
 * Restores session credentials from Supabase database onto local disk for a given pgId.
 */
export async function restoreSessionFromDatabase(pgId: string = 'default'): Promise<boolean> {
  try {
    const key = getDbBackupKey(pgId);
    let { data, error } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    // If default and not found, check whatsapp_session_default as fallback
    if ((!data || error) && pgId === 'default') {
      const alt = await supabaseAdmin
        .from('settings')
        .select('value')
        .eq('key', 'whatsapp_session_default')
        .maybeSingle();
      if (alt.data) data = alt.data;
    }

    if (error || !data?.value?.files) return false;

    const files = data.value.files as Record<string, string>;
    if (!files['creds.json']) return false;

    const sessionDir = getSessionDir(pgId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    for (const [name, content] of Object.entries(files)) {
      if (typeof content === 'string') {
        fs.writeFileSync(path.join(sessionDir, name), content, 'utf8');
      }
    }

    console.log(`[WhatsApp ${pgId}] Restored session (${Object.keys(files).length} files) from DB backup (${key}).`);
    return true;
  } catch (err: any) {
    console.warn(`[WhatsApp ${pgId}] Could not restore session from database:`, err.message);
    return false;
  }
}

/**
 * Returns current status of a specific PG session.
 */
export function getWhatsAppStatus(pgId: string = 'default'): WhatsAppState {
  const session = getOrCreateSession(pgId);
  const phone = session.connectedPhone || (session.status === 'connected' ? getSavedPhone(pgId) : null);

  return {
    status: session.status,
    hasQr: !!session.currentQr,
    qr: session.currentQr,
    pairingCode: session.pairingCode,
    phoneNumber: phone,
    connectedAt: session.connectedAt,
    lastError: session.lastError,
    pgId: session.pgId,
  };
}

/**
 * Returns statuses of all registered sessions in the manager.
 */
export function getAllSessionsStatus(): WhatsAppState[] {
  const result: WhatsAppState[] = [];
  for (const session of sessions.values()) {
    result.push(getWhatsAppStatus(session.pgId));
  }
  return result;
}

/**
 * Connects or initializes a Baileys socket for a given pgId.
 */
export async function connectWhatsApp(pgId: string = 'default'): Promise<WhatsAppState> {
  const session = getOrCreateSession(pgId);

  // Already connected with an active socket? Don't create another!
  if (session.status === 'connected' && session.sock) {
    return getWhatsAppStatus(pgId);
  }

  // If already initializing and waiting for QR or open connection, avoid duplicate calls
  if (session.isInitializing) {
    return getWhatsAppStatus(pgId);
  }

  // Check if session can be restored from DB before starting pairing from scratch
  if (!hasExistingSession(pgId)) {
    try {
      await restoreSessionFromDatabase(pgId);
    } catch {}
  }

  session.isInitializing = true;
  session.lastError = null;
  if (session.status !== 'connected') {
    session.status = 'pairing';
  }
  session.isSocketReadyForPairing = false;

  // Clean up any stale/zombie socket before opening a new one
  if (session.sock) {
    try {
      session.sock.ev.removeAllListeners('connection.update');
      session.sock.ev.removeAllListeners('creds.update');
      session.sock.end(undefined);
    } catch {}
    session.sock = null;
  }

  const sessionDir = getSessionDir(pgId);

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
    });

    session.sock = sock;

    sock.ev.on('creds.update', async () => {
      await saveCreds();
      debouncedSaveSessionToDatabase(session);
    });

    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          session.currentQr = await QRCode.toDataURL(qr, { margin: 2, scale: 8 });
          session.status = 'pairing';
          session.isSocketReadyForPairing = true;
          console.log(`[WhatsApp ${pgId}] New QR code generated`);

          // Notify all waiters
          session.qrResolvers.forEach((r) => r(session.currentQr!));
          session.qrResolvers = [];
          session.readyResolvers.forEach((r) => r());
          session.readyResolvers = [];
        } catch (qrErr: any) {
          console.error(`[WhatsApp ${pgId}] Failed to generate QR data URL:`, qrErr.message);
        }
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const isRestartRequired = statusCode === DisconnectReason.restartRequired;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const shouldReconnect = isRestartRequired || (!isLoggedOut && statusCode !== 440);

        session.status = 'disconnected';
        session.currentQr = null;
        session.pairingCode = null;
        session.isSocketReadyForPairing = false;
        session.lastError = lastDisconnect?.error?.message || 'Connection closed';
        console.log(`[WhatsApp ${pgId}] Closed (${statusCode}). Reconnecting: ${shouldReconnect} (attempt ${session.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

        if (session.reconnectTimer) {
          clearTimeout(session.reconnectTimer);
          session.reconnectTimer = null;
        }

        if (isLoggedOut) {
          session.reconnectAttempts = 0;
          console.log(`[WhatsApp ${pgId}] Session logged out. Discontinuing reconnection.`);
          return;
        }

        if (shouldReconnect || hasExistingSession(pgId)) {
          if (session.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            session.reconnectAttempts++;
            const delay = isRestartRequired ? 1500 : Math.min(2000 * Math.pow(2, session.reconnectAttempts), 30000);
            console.log(`[WhatsApp ${pgId}] Scheduling reconnection attempt ${session.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms...`);
            session.reconnectTimer = setTimeout(() => {
              connectWhatsApp(pgId).catch((err) =>
                console.error(`[WhatsApp ${pgId} Reconnect Error]:`, err.message)
              );
            }, delay);
          } else {
            console.warn(`[WhatsApp ${pgId}] Max reconnection attempts reached. Pausing auto-reconnect until manual retry.`);
          }
        }
      } else if (connection === 'open') {
        session.reconnectAttempts = 0;
        if (session.reconnectTimer) {
          clearTimeout(session.reconnectTimer);
          session.reconnectTimer = null;
        }
        session.status = 'connected';
        session.currentQr = null;
        session.pairingCode = null;
        session.isSocketReadyForPairing = true;
        session.connectedAt = new Date().toISOString();
        session.connectedPhone = session.sock?.user?.id?.split(':')[0] || getSavedPhone(pgId) || null;
        session.lastError = null;
        console.log(`[WhatsApp ${pgId}] Connected successfully as +${session.connectedPhone}`);

        // Persist fresh verified session to database
        debouncedSaveSessionToDatabase(session);

        session.readyResolvers.forEach((r) => r());
        session.readyResolvers = [];
      }
    });
  } catch (err: any) {
    session.lastError = err.message;
    session.status = 'disconnected';
    session.isInitializing = false;
    console.error(`[WhatsApp ${pgId} Init Error]:`, err.message);
    throw err;
  } finally {
    session.isInitializing = false;
  }

  // If QR is already generated or already connected, return right away
  if (session.currentQr || session.status === 'connected') {
    return getWhatsAppStatus(pgId);
  }

  // Otherwise wait up to 6 seconds for initial QR or open connection
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), 6000);
    session.qrResolvers.push(() => {
      clearTimeout(timer);
      resolve();
    });
    session.readyResolvers.push(() => {
      clearTimeout(timer);
      resolve();
    });
  });

  return getWhatsAppStatus(pgId);
}

/**
 * Requests an 8-character pairing code for phone-number linking.
 */
export async function requestPairingCode(phoneNumber: string, pgId: string = 'default'): Promise<string> {
  const cleanNumber = phoneNumber.replace(/\D/g, '');
  if (cleanNumber.length < 10) {
    throw new Error('Please provide a valid 10-15 digit phone number with country code (e.g. 919876543210)');
  }

  const session = getOrCreateSession(pgId);

  // Ensure socket is created
  if (!session.sock) {
    await connectWhatsApp(pgId);
  }

  // If socket is not yet ready to receive pairing code, wait for it
  if (!session.isSocketReadyForPairing && session.status !== 'connected') {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), 7000);
      session.readyResolvers.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  try {
    const code = await session.sock.requestPairingCode(cleanNumber);
    session.pairingCode = code;
    session.status = 'pairing';
    console.log(`[WhatsApp ${pgId}] Pairing code generated: ${code} for ${cleanNumber}`);
    return code;
  } catch (err: any) {
    console.error(`[WhatsApp ${pgId} Pairing Code Error]:`, err.message);
    throw new Error(`Failed to request pairing code: ${err.message}`);
  }
}

/**
 * Disconnects and removes session data for a given pgId.
 */
export async function disconnectWhatsApp(pgId: string = 'default'): Promise<void> {
  const session = getOrCreateSession(pgId);

  if (session.sock) {
    try {
      await session.sock.logout();
    } catch {}
    session.sock = null;
  }

  session.status = 'disconnected';
  session.currentQr = null;
  session.pairingCode = null;
  session.connectedPhone = null;
  session.connectedAt = null;
  session.isSocketReadyForPairing = false;
  if (session.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }

  // Clean session folder on disk
  const sessionDir = getSessionDir(pgId);
  if (fs.existsSync(sessionDir)) {
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      fs.mkdirSync(sessionDir, { recursive: true });
    } catch (e: any) {
      console.warn(`[WhatsApp ${pgId}] Could not clean session dir:`, e.message);
    }
  }

  // Clean DB backup
  const key = getDbBackupKey(pgId);
  try {
    await supabaseAdmin.from('settings').delete().eq('key', key);
    if (pgId === 'default') {
      await supabaseAdmin.from('settings').delete().eq('key', 'whatsapp_session_default');
    }
  } catch (e: any) {
    console.warn(`[WhatsApp ${pgId}] Could not clean DB backup:`, e.message);
  }
}

/**
 * Scans local storage and Supabase DB to automatically boot all available WhatsApp sessions.
 */
export async function initAllWhatsAppSessions(): Promise<void> {
  console.log('[WhatsApp Manager] Initializing all WhatsApp sessions...');

  // 1. Collect all known session IDs from disk and Supabase settings
  const knownPgIds = new Set<string>(['default']);

  // Check disk subdirectories
  try {
    if (fs.existsSync(SESSIONS_DIR)) {
      const entries = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          knownPgIds.add(entry.name);
        }
      }
    }
  } catch (e: any) {
    console.warn('[WhatsApp Manager] Error reading sessions dir:', e.message);
  }

  // Check Supabase backup keys
  try {
    const { data } = await supabaseAdmin
      .from('settings')
      .select('key')
      .like('key', 'whatsapp_session_%');

    if (data) {
      for (const row of data) {
        if (row.key === 'whatsapp_session_backup' || row.key === 'whatsapp_session_default') {
          knownPgIds.add('default');
        } else if (row.key.startsWith('whatsapp_session_')) {
          const pgId = row.key.replace('whatsapp_session_', '');
          if (pgId) knownPgIds.add(pgId);
        }
      }
    }
  } catch (e: any) {
    console.warn('[WhatsApp Manager] Error querying DB session backups:', e.message);
  }

  // 2. Restore and connect each session
  for (const pgId of knownPgIds) {
    if (!hasExistingSession(pgId)) {
      try {
        await restoreSessionFromDatabase(pgId);
      } catch (e: any) {
        console.warn(`[WhatsApp Manager] Could not restore session for ${pgId}:`, e.message);
      }
    }

    if (hasExistingSession(pgId)) {
      console.log(`[WhatsApp Manager] Booting session for PG [${pgId}]...`);
      connectWhatsApp(pgId).catch((err) =>
        console.error(`[WhatsApp Manager] Failed auto-connect for [${pgId}]:`, err.message)
      );
    }
  }
}

// Backward-compatible alias for single-session callers
export async function initWhatsAppIfSessionExists(): Promise<void> {
  return initAllWhatsAppSessions();
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

/**
 * Decodes a base64 Data URL or raw base64 string into a Buffer.
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

/**
 * Processes the FIFO message queue for a specific session with human anti-ban delays.
 */
async function processSessionQueue(session: WhatsAppSession): Promise<void> {
  if (session.isProcessingQueue) return;
  session.isProcessingQueue = true;

  while (session.messageQueue.length > 0) {
    const item = session.messageQueue.shift();
    if (!item) break;

    try {
      if (session.status !== 'connected' || !session.sock) {
        throw new Error(`WhatsApp service for [${session.pgId}] is not connected`);
      }

      // Anti-Spam: Simulate natural human typing presence before dispatching
      try {
        await session.sock.sendPresenceUpdate('composing', item.jid);
        await new Promise((r) => setTimeout(r, 1000 + Math.floor(Math.random() * 800)));
        await session.sock.sendPresenceUpdate('paused', item.jid);
      } catch {}

      console.log(`[WhatsApp Queue ${session.pgId}] Sending to ${item.jid} (${session.messageQueue.length} pending, hasImage: ${Boolean(item.imageBuffer)})`);
      if (item.imageBuffer) {
        try {
          await session.sock.sendMessage(item.jid, {
            image: item.imageBuffer,
            caption: item.text,
          });
        } catch (imgErr: any) {
          console.warn(`[WhatsApp Queue ${session.pgId}] Image failed, falling back to text:`, imgErr.message);
          await session.sock.sendMessage(item.jid, { text: item.text });
        }
      } else {
        await session.sock.sendMessage(item.jid, { text: item.text });
      }

      console.log(`[WhatsApp Queue ${session.pgId}] Successfully sent to ${item.jid}`);
      item.resolve();
    } catch (err: any) {
      console.error(`[WhatsApp Queue Error ${session.pgId}] Failed to send to ${item.jid}:`, err.message);
      item.reject(err);
    }

    // Anti-Ban & Anti-Spam: Enforce natural human-like jitter delay (2.5s – 4.5s) between consecutive messages
    if (session.messageQueue.length > 0) {
      const naturalDelay = 2500 + Math.floor(Math.random() * 2000);
      await new Promise((resolve) => setTimeout(resolve, naturalDelay));
    }
  }

  session.isProcessingQueue = false;
}

export interface SendWhatsAppOptions {
  pgId: string; // MANDATORY: Cross-tenant isolation requires strict PG binding
  purpose?: string; // e.g. 'PASSWORD_RESET_OTP', 'RENT_REMINDER', 'INVOICE'
  imageBuffer?: Buffer | null;
}

/**
 * Dispatches an outbound WhatsApp message.
 * STRICT MULTI-TENANT ISOLATION:
 * 1. options.pgId is strictly mandatory. If missing or empty, rejects immediately.
 * 2. Routes ONLY to the session bound to options.pgId.
 * 3. NEVER falls back to 'default' or another PG's session.
 * 4. If target PG session is not connected, fails safely with controlled error.
 */
export async function sendWhatsAppMessage(
  phone: string,
  text: string,
  options: SendWhatsAppOptions
): Promise<void> {
  if (!options || !options.pgId || typeof options.pgId !== 'string' || !options.pgId.trim()) {
    throw new Error('[WhatsApp Security] Cross-tenant isolation violation: pgId is mandatory for all outbound messages.');
  }

  const targetPgId = options.pgId.trim();
  let session = sessions.get(targetPgId);

  // If session is registered but not connected, attempt auto-reconnect if session files exist
  if (!session || session.status !== 'connected' || !session.sock) {
    if (hasExistingSession(targetPgId)) {
      try {
        console.log(`[WhatsApp ${targetPgId}] Attempting auto-reconnect for outbound message (${options.purpose || 'general'})...`);
        await connectWhatsApp(targetPgId);
        session = sessions.get(targetPgId);
      } catch (reconnErr: any) {
        console.warn(`[WhatsApp ${targetPgId}] Reconnect failed:`, reconnErr.message);
      }
    }
  }

  // Strict Fail-Safe: If session is still not connected, DO NOT FALL BACK to any other session!
  if (!session || session.status !== 'connected' || !session.sock) {
    const errorMsg = `WhatsApp service is not connected for PG [${targetPgId}]. Please connect WhatsApp in Settings.`;
    console.error(`[WhatsApp Routing Error] ${errorMsg} (Recipient: ${normalizePhoneNumber(phone).slice(0, 4)}****)`);
    throw new Error(errorMsg);
  }

  const cleanPhone = normalizePhoneNumber(phone);
  const jid = `${cleanPhone}@s.whatsapp.net`;

  // Audit log dispatch (no sensitive message content logged)
  console.log(`[WhatsApp Dispatch Audit] PG: [${targetPgId}] | Recipient: ${cleanPhone.slice(0, 4)}****${cleanPhone.slice(-4)} | Purpose: ${options.purpose || 'DIRECT_MESSAGE'} | Time: ${new Date().toISOString()}`);

  return new Promise<void>((resolve, reject) => {
    session!.messageQueue.push({
      id: Math.random().toString(36).substring(2, 9),
      jid,
      text,
      imageBuffer: options.imageBuffer || null,
      resolve,
      reject,
      enqueuedAt: Date.now(),
    });

    processSessionQueue(session!).catch((err) => {
      console.error(`[WhatsApp Queue Error ${session!.pgId}]:`, err);
    });
  });
}
