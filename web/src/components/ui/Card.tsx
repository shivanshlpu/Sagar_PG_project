import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  padding?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  hoverable?: boolean;
}

const paddingMap = {
  sm: 'var(--spacing-3)',
  md: 'var(--spacing-4)',
  lg: 'var(--spacing-5)',
};

export function Card({
  children,
  className = '',
  style,
  padding = 'md',
  onClick,
  hoverable = false,
}: CardProps) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <div
      className={className}
      onClick={onClick}
      onMouseEnter={() => hoverable && setIsHovered(true)}
      onMouseLeave={() => hoverable && setIsHovered(false)}
      style={{
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: paddingMap[padding],
        boxShadow: isHovered ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transition: 'box-shadow 180ms ease',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: { value: string; isPositive: boolean };
  style?: React.CSSProperties;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

/**
 * Dashboard summary card — key metric number prominently displayed.
 * Per UIUX.md: 22-28px bold metric number, consistent grid layout.
 */
export function MetricCard({
  label,
  value,
  icon,
  trend,
  style,
  className = '',
  onClick,
  hoverable = true,
}: MetricCardProps) {
  return (
    <Card
      padding="lg"
      onClick={onClick}
      hoverable={Boolean(onClick || hoverable)}
      className={`metric-card-root ${className}`}
      style={{
        ...style,
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p
            className="metric-card-label"
            style={{
              fontSize: 'var(--font-size-sm)',
              fontWeight: 500,
              color: 'var(--color-text-secondary)',
              marginBottom: '6px',
            }}
          >
            {label}
          </p>
          <p
            className="metric-card-value"
            style={{
              fontSize: 'var(--font-size-metric)',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.2,
              wordBreak: 'break-word',
            }}
          >
            {value}
          </p>
          {trend && (
            <p
              className="metric-card-trend"
              style={{
                fontSize: 'var(--font-size-xs)',
                color: trend.isPositive ? 'var(--color-success)' : 'var(--color-danger)',
                marginTop: '4px',
              }}
            >
              {trend.isPositive ? '+' : ''}{trend.value}
            </p>
          )}
        </div>
        {icon && (
          <div
            className="metric-card-icon"
            style={{
              padding: '8px',
              backgroundColor: 'var(--color-primary-light)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-primary)',
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
