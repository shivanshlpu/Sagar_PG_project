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

