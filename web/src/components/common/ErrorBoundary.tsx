import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught an error]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetCache = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      if ('caches' in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
      }
    } catch {}
    window.location.href = '/login';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F8FAFC',
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          padding: '24px',
          color: '#1E293B',
        }}>
          <div style={{
            maxWidth: '520px',
            width: '100%',
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
            padding: '32px',
            textAlign: 'center',
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#FEF2F2',
              color: '#DC2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              margin: '0 auto 16px auto',
            }}>
              ⚠️
            </div>

            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0', color: '#0F172A' }}>
              Something went wrong
            </h2>
            <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 24px 0', lineHeight: 1.5 }}>
              The application encountered an unexpected runtime error. We prevented a blank screen so you can easily recover.
            </p>

            {this.state.error && (
              <div style={{
                textAlign: 'left',
                backgroundColor: '#F1F5F9',
                border: '1px solid #CBD5E1',
                borderRadius: '8px',
                padding: '12px 14px',
                fontSize: '12px',
                fontFamily: 'monospace',
                color: '#334155',
                marginBottom: '24px',
                maxHeight: '120px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                <strong>Error:</strong> {this.state.error.message || 'Unknown error'}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={this.handleReload}
                style={{
                  backgroundColor: '#0F766E',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
              >
                Reload App
              </button>

              <button
                onClick={this.handleResetCache}
                style={{
                  backgroundColor: '#FFFFFF',
                  color: '#475569',
                  border: '1px solid #CBD5E1',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Clear Cache & Reset
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
