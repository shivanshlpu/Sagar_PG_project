import React from 'react';

export interface Column<T> {
  key: string;
  label?: string;
  header?: string;
  render?: (item: T) => React.ReactNode;
  primary?: boolean; // Highlighted title in card view
  hideOnMobile?: boolean;
  sortable?: boolean;
}

export type ResponsiveColumn<T> = Column<T>;

export interface ResponsiveTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor?: (item: T) => string;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  isLoading?: boolean;
  renderCard?: (item: T) => React.ReactNode;
  actions?: (item: T) => React.ReactNode;
  emptyState?: React.ReactNode;
}

export function ResponsiveTable<T extends Record<string, any>>({
  columns,
  data,
  keyExtractor = (item: any) => item.id || String(Math.random()),
  emptyMessage = 'No records found',
  onRowClick,
  isLoading = false,
  renderCard,
  actions,
  emptyState,
}: ResponsiveTableProps<T>) {
  if (isLoading) {
    return (
      <div style={{
        padding: '48px 16px',
        textAlign: 'center',
        color: 'var(--color-text-muted)',
        fontSize: 'var(--font-size-sm)',
        backgroundColor: 'var(--color-bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
      }}>
        Loading...
      </div>
    );
  }

  if (data.length === 0) {
    if (emptyState) return <>{emptyState}</>;
    return (
      <div style={{
        padding: '32px 16px',
        textAlign: 'center',
        color: 'var(--color-text-muted)',
        fontSize: 'var(--font-size-sm)',
        backgroundColor: 'var(--color-bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
      }}>
        {emptyMessage}
      </div>
    );
  }

  const primaryCol = columns.find(c => c.primary) || columns[0];
  const secondaryCols = columns.filter(c => c !== primaryCol && !c.hideOnMobile);

  return (
    <>
      {/* Desktop Table View (>= 768px) */}
      <div className="desktop-table-container" style={{
        overflowX: 'auto',
        backgroundColor: 'var(--color-bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 'var(--font-size-sm)',
          textAlign: 'left',
        }}>
          <thead>
            <tr style={{
              borderBottom: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-bg-surface-alt)',
            }}>
              {columns.map(col => (
                <th
                  key={col.key}
                  style={{
                    padding: '12px 16px',
                    fontWeight: 600,
                    color: 'var(--color-text-secondary)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {col.label || col.header}
                </th>
              ))}
              {actions && (
                <th style={{
                  padding: '12px 16px',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                  textAlign: 'right',
                }}>
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <tr
                key={keyExtractor(item)}
                onClick={() => onRowClick?.(item)}
                style={{
                  borderBottom: '1px solid var(--color-border)',
                  cursor: onRowClick ? 'pointer' : 'default',
                  transition: 'background-color 150ms ease',
                }}
                className="table-row-hover"
              >
                {columns.map(col => (
                  <td
                    key={col.key}
                    style={{
                      padding: '12px 16px',
                      color: 'var(--color-text-primary)',
                      verticalAlign: 'middle',
                    }}
                  >
                    {col.render ? col.render(item) : item[col.key]}
                  </td>
                ))}
                {actions && (
                  <td style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    verticalAlign: 'middle',
                  }}>
                    {actions(item)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View (< 768px) */}
      <div className="mobile-card-container" style={{ display: 'none', flexDirection: 'column', gap: '12px' }}>
        {data.map((item) => (
          renderCard ? (
            <div
              key={keyExtractor(item)}
              onClick={() => onRowClick?.(item)}
              style={{
                backgroundColor: 'var(--color-bg-surface)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border)',
                padding: '16px',
                cursor: onRowClick ? 'pointer' : 'default',
                boxShadow: 'var(--shadow-xs)',
              }}
            >
              {renderCard(item)}
              {actions && (
                <div style={{ marginTop: '12px', borderTop: '1px solid var(--color-border)', paddingTop: '8px' }}>
                  {actions(item)}
                </div>
              )}
            </div>
          ) : (
            <div
              key={keyExtractor(item)}
              onClick={() => onRowClick?.(item)}
              style={{
                backgroundColor: 'var(--color-bg-surface)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border)',
                padding: '16px',
                cursor: onRowClick ? 'pointer' : 'default',
                boxShadow: 'var(--shadow-xs)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              {/* Card Header (Primary Column) */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                borderBottom: '1px solid var(--color-border)',
                paddingBottom: '10px',
              }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--font-size-base)', color: 'var(--color-text-primary)' }}>
                  {primaryCol.render ? primaryCol.render(item) : item[primaryCol.key]}
                </div>
              </div>

              {/* Card Body (Secondary Columns) */}
              <div className="responsive-card-grid">
                {secondaryCols.map(col => (
                  <div key={col.key} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {col.label || col.header}
                    </span>
                    <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
                      {col.render ? col.render(item) : (item[col.key] ?? '—')}
                    </div>
                  </div>
                ))}
              </div>
              {actions && (
                <div style={{ marginTop: '8px', borderTop: '1px solid var(--color-border)', paddingTop: '8px' }}>
                  {actions(item)}
                </div>
              )}
            </div>
          )
        ))}
      </div>
    </>
  );
}
