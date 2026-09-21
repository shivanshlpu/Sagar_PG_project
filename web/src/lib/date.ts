/**
 * Format a date string or Date object to strict DD/MM/YYYY format.
 * E.g. "2026-09-21" -> "21/09/2026"
 * E.g. "2026-09-21T10:30:00Z" -> "21/09/2026"
 */
export function formatDate(dateInput?: string | Date | null): string {
  if (!dateInput) return '—';

  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) {
      // If it's a YYYY-MM string
      if (typeof dateInput === 'string' && /^\d{4}-\d{2}$/.test(dateInput)) {
        const [year, month] = dateInput.split('-');
        return `${month}/${year}`;
      }
      return String(dateInput);
    }

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();

    return `${day}/${month}/${year}`;
  } catch {
    return String(dateInput);
  }
}

/**
 * Format date and time to DD/MM/YYYY, hh:mm A
 */
export function formatDateTime(dateInput?: string | Date | null): string {
  if (!dateInput) return '—';

  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return String(dateInput);

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();

    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 becomes 12

    return `${day}/${month}/${year}, ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
  } catch {
    return String(dateInput);
  }
}
