import React from 'react';
import { Loader2 } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    background-color: var(--color-primary);
    color: #FFFFFF;
    border: 1px solid var(--color-primary);
  `,
  secondary: `
    background-color: transparent;
    color: var(--color-text-primary);
    border: 1px solid var(--color-border);
  `,
  danger: `
    background-color: var(--color-danger);
    color: #FFFFFF;
    border: 1px solid var(--color-danger);
  `,
  outline: `
    background-color: transparent;
    color: var(--color-primary);
    border: 1px solid var(--color-primary);
  `,
  ghost: `
    background-color: transparent;
    color: var(--color-text-primary);
    border: 1px solid transparent;
  `,
};

const variantHoverStyles: Record<ButtonVariant, string> = {
  primary: `background-color: var(--color-primary-hover); border-color: var(--color-primary-hover);`,
  secondary: `background-color: var(--color-bg-surface-alt); border-color: var(--color-text-muted);`,
  danger: `background-color: #A83232; border-color: #A83232;`,
  outline: `background-color: rgba(29, 78, 216, 0.08); border-color: var(--color-primary);`,
  ghost: `background-color: var(--color-bg-surface-alt); border-color: transparent;`,
};

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: '6px 12px', fontSize: 'var(--font-size-sm)' },
  md: { padding: '8px 16px', fontSize: 'var(--font-size-base)' },
  lg: { padding: '10px 24px', fontSize: 'var(--font-size-md)' },
};

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  children,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const [isHovered, setIsHovered] = React.useState(false);

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    borderRadius: 'var(--radius-md)',
    fontWeight: 500,
    cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
    opacity: disabled || isLoading ? 0.6 : 1,
    transition: 'all 180ms ease',
    width: fullWidth ? '100%' : 'auto',
    minHeight: '36px',
    lineHeight: 1,
    ...sizeStyles[size],
    ...style,
  };

  return (
    <button
      {...props}
      disabled={disabled || isLoading}
      style={baseStyle}
      onMouseEnter={(e) => { setIsHovered(true); props.onMouseEnter?.(e); }}
      onMouseLeave={(e) => { setIsHovered(false); props.onMouseLeave?.(e); }}
      // Apply variant styles via CSS custom properties
      ref={(el) => {
        if (el) {
          el.style.cssText += variantStyles[variant];
          if (isHovered && !disabled && !isLoading) {
            el.style.cssText += variantHoverStyles[variant];
          }
        }
      }}
    >
      {isLoading && (
        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
      )}
      {children}
    </button>
  );
}
