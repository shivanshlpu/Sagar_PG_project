/**
 * In-memory OTP service for password reset via WhatsApp.
 *
 * Each OTP is bound to a phone number, expires after 5 minutes,
 * and is rate-limited to 3 requests per phone per 15-minute window.
 */

interface OTPEntry {
  code: string;
  expiresAt: number;
  attempts: number; // failed verify attempts
}

interface RateEntry {
  count: number;
  windowStart: number;
}

const otpStore = new Map<string, OTPEntry>();
const rateStore = new Map<string, RateEntry>();

const OTP_EXPIRY_MS = 5 * 60 * 1000;        // 5 minutes
const RATE_WINDOW_MS = 15 * 60 * 1000;       // 15 minutes
const MAX_REQUESTS_PER_WINDOW = 3;
const MAX_VERIFY_ATTEMPTS = 5;

/** Generate a 6-digit numeric OTP */
function randomOTP(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Clean up expired entries periodically */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of otpStore) {
    if (entry.expiresAt < now) otpStore.delete(key);
  }
  for (const [key, entry] of rateStore) {
    if (entry.windowStart + RATE_WINDOW_MS < now) rateStore.delete(key);
  }
}, 60_000); // every 60 seconds

/**
 * Generate and store an OTP for the given phone number.
 * Throws if rate limit is exceeded.
 */
export function generateOTP(phone: string): string {
  const now = Date.now();

  // Rate limiting
  const rate = rateStore.get(phone);
  if (rate && rate.windowStart + RATE_WINDOW_MS > now) {
    if (rate.count >= MAX_REQUESTS_PER_WINDOW) {
      throw new Error('Too many OTP requests. Please try again after 15 minutes.');
    }
    rate.count++;
  } else {
    rateStore.set(phone, { count: 1, windowStart: now });
  }

  const code = randomOTP();
  otpStore.set(phone, {
    code,
    expiresAt: now + OTP_EXPIRY_MS,
    attempts: 0,
  });

  return code;
}

/**
 * Verify an OTP for the given phone number.
 * Returns true on success (and deletes the OTP), false on mismatch.
 * Throws if OTP expired or too many failed attempts.
 */
export function verifyOTP(phone: string, code: string): boolean {
  const entry = otpStore.get(phone);

  if (!entry) {
    throw new Error('No OTP found. Please request a new one.');
  }

  if (entry.expiresAt < Date.now()) {
    otpStore.delete(phone);
    throw new Error('OTP has expired. Please request a new one.');
  }

  if (entry.attempts >= MAX_VERIFY_ATTEMPTS) {
    otpStore.delete(phone);
    throw new Error('Too many failed attempts. Please request a new OTP.');
  }

  if (entry.code !== code) {
    entry.attempts++;
    return false;
  }

  // Success — remove from store
  otpStore.delete(phone);
  return true;
}
