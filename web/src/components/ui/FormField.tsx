import React from 'react';

interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}

/**
 * Form field wrapper — label above input, inline validation error below.
 * Per UIUX.md: label above input (not placeholder-as-label),
 * inline validation error in --danger, required field indication.
 */
export function FormField({ label, error, required, children, hint }: FormFieldProps) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={labelStyle}>
        {label}
        {required && <span style={{ color: 'var(--color-danger)', marginLeft: '2px' }}>*</span>}
      </label>
      {hint && <p style={hintStyle}>{hint}</p>}
      {children}
      {error && (
        <p style={errorStyle} role="alert" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ error, style, ...props }, ref) => {
    return (
      <input
        ref={ref}
        style={{
          ...inputBaseStyle,
          borderColor: error ? 'var(--color-danger)' : 'var(--color-border)',
          ...style,
        }}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ error, options, placeholder, style, ...props }, ref) => {
    return (
      <select
        ref={ref}
        style={{
          ...inputBaseStyle,
          borderColor: error ? 'var(--color-danger)' : 'var(--color-border)',
          appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%235C6370' d='M3 4.5L6 7.5L9 4.5'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 12px center',
          paddingRight: '32px',
          ...style,
        }}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    );
  }
);

Select.displayName = 'Select';

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ error, style, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        style={{
          ...inputBaseStyle,
          borderColor: error ? 'var(--color-danger)' : 'var(--color-border)',
          minHeight: '80px',
          resize: 'vertical',
          ...style,
        }}
        {...props}
      />
    );
  }
);

TextArea.displayName = 'TextArea';

export const Textarea = TextArea;

// -- Styles --

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--font-size-sm)',
  fontWeight: 500,
  color: 'var(--color-text-primary)',
  marginBottom: '6px',
};

const hintStyle: React.CSSProperties = {
  fontSize: 'var(--font-size-xs)',
  color: 'var(--color-text-muted)',
  marginBottom: '4px',
};

const errorStyle: React.CSSProperties = {
  fontSize: 'var(--font-size-xs)',
  color: 'var(--color-danger)',
  marginTop: '4px',
};

const inputBaseStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: 'var(--font-size-base)',
  color: 'var(--color-text-primary)',
  backgroundColor: 'var(--color-bg-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  outline: 'none',
  transition: 'border-color 180ms ease',
  lineHeight: 1.5,
  fontFamily: 'inherit',
};
