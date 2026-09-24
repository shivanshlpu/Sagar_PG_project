/**
 * Formats any date string or Date object to strict DD-MM-YYYY format.
 * E.g. "2026-10-01" -> "01-10-2026"
 * E.g. "2026-10-01T00:00:00.000Z" -> "01-10-2026"
 * E.g. Date object -> "01-10-2026"
 */
export function formatDateDMY(dateInput?: string | Date | null): string {
  if (!dateInput) return 'Today';

  // Fast path for YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateInput)) {
    const [year, month, day] = dateInput.split('T')[0].split('-');
    return `${day}-${month}-${year}`;
  }

  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return String(dateInput);

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  return `${day}-${month}-${year}`;
}

/**
 * Formats YYYY-MM to strict MM-YY format.
 * E.g. "2026-09" -> "09-26"
 */
export function formatMonthMY(monthInput?: string | null): string {
  if (!monthInput) return '';
  if (/^\d{4}-\d{2}$/.test(monthInput)) {
    const [year, month] = monthInput.split('-');
    return `${month}-${year.slice(-2)}`;
  }
  return monthInput;
}

/**
 * Checks if a given ISO timestamp occurred on today's calendar date in Indian Standard Time (IST).
 * Strictly guarantees that at most 1 reminder message is dispatched per day per tenant.
 */
export function isSentToday(isoDateString?: string | null): boolean {
  if (!isoDateString) return false;
  const sentDate = new Date(isoDateString);
  if (isNaN(sentDate.getTime())) return false;
  const sentIST = sentDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
  const nowIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
  return sentIST === nowIST;
}

/**
 * Human-friendly format for last reminder sent time in IST (e.g., "Today, 10:30 AM", "Yesterday, 04:15 PM")
 */
export function formatReminderTimeIST(isoDateString?: string | null): string | null {
  if (!isoDateString) return null;
  const d = new Date(isoDateString);
  if (isNaN(d.getTime())) return null;

  const nowIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const dIST = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const timeStr = d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  });

  if (dIST === nowIST) {
    return `Today, ${timeStr}`;
  }

  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  if (dIST === yesterday) {
    return `Yesterday, ${timeStr}`;
  }

  return `${formatDateDMY(isoDateString)}, ${timeStr}`;
}


