import React from 'react';

interface ToastData {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

type ToastType = 'success' | 'error' | 'info';

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
  addToast: {
    (type: ToastType, message: string): void;
    (message: string, type?: ToastType): void;
  };
}

const ToastContext = React.createContext<ToastContextType>({
  showToast: () => {},
  addToast: () => {},
});

export function useToast() {
  return React.useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastData[]>([]);

  const showToast = React.useCallback((message: string, type: ToastType = 'success') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const addToast = React.useCallback((first: string, second?: string) => {
    if (second !== undefined) {
      if (first === 'success' || first === 'error' || first === 'info') {
        showToast(second, first);
        return;
      }
      showToast(first, second as ToastType);
      return;
    }
    showToast(first);
  }, [showToast]) as ToastContextType['addToast'];

  return (
    <ToastContext.Provider value={{ showToast, addToast }}>
      {children}
      {/* Toast container */}
      <div style={containerStyle} aria-live="polite" role="status">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="toast-enter"
            style={{
              ...toastStyle,
              borderLeftColor: toast.type === 'success'
                ? 'var(--color-success)'
                : toast.type === 'error'
                ? 'var(--color-danger)'
                : 'var(--color-info)',
            }}
          >
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
              {toast.message}
            </p>
            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              style={dismissStyle}
              aria-label="Dismiss notification"
            >
              x
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  top: '16px',
  right: '16px',
  zIndex: 2000,
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  maxWidth: '400px',
};

const toastStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-surface)',
  border: '1px solid var(--color-border)',
  borderLeft: '3px solid',
  borderRadius: 'var(--radius-md)',
  padding: '12px 16px',
  boxShadow: 'var(--shadow-md)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
};

const dismissStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--color-text-muted)',
  fontSize: 'var(--font-size-sm)',
  padding: '4px',
};
