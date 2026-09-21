import React from 'react';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  success: {
    backgroundColor: 'var(--color-success-light)',
    color: 'var(--color-success)',
  },
  warning: {
    backgroundColor: 'var(--color-warning-light)',
    color: 'var(--color-warning)',
  },
  danger: {
    backgroundColor: 'var(--color-danger-light)',
    color: 'var(--color-danger)',
  },
  info: {
    backgroundColor: 'var(--color-info-light)',
    color: 'var(--color-info)',
  },
  neutral: {
    backgroundColor: 'var(--color-bg-surface-alt)',
    color: 'var(--color-text-secondary)',
  },
};

/**
 * Status badge/pill — rounded, small, colored bg at low opacity + colored text.
 * Always pair with a text label (never color-only signals per accessibility rules).
 */
export function Badge({ variant = 'neutral', children, icon }: BadgeProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 10px',
        borderRadius: 'var(--radius-full)',
        fontSize: 'var(--font-size-xs)',
        fontWeight: 500,
        lineHeight: '20px',
        whiteSpace: 'nowrap',
        ...variantStyles[variant],
      }}
    >
      {icon}
      {children}
    </span>
  );
}

// Helper: maps common status strings to badge variants
export function getStatusBadgeVariant(status: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    paid: 'success',
    verified: 'success',
    resolved: 'success',
    connected: 'success',
    active: 'success',
    good: 'success',
    pending: 'warning',
    submitted: 'warning',
    due_soon: 'warning',
    in_progress: 'info',
    pairing: 'info',
    open: 'info',
    overdue: 'danger',
    rejected: 'danger',
    disconnected: 'danger',
    failed: 'danger',
    damaged: 'danger',
    urgent: 'danger',
  };
  return map[status.toLowerCase()] || 'neutral';
}
