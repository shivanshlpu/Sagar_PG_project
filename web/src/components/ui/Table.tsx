import React from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  emptyState?: React.ReactNode;
  isLoading?: boolean;
  keyField?: string;
  actions?: (row: T) => React.ReactNode;
}

/**
 * Data table with sortable headers, row actions, loading skeletons, and designed empty state.
 * Per UIUX.md: comfortable row height (44-48px), sticky header, optional zebra striping.
 */
export function DataTable<T = any>({
  columns,
  data,
  onRowClick,
  emptyState,
  isLoading = false,
  keyField = 'id',
  actions,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedData = React.useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const aVal = (a as any)[sortKey];
      const bVal = (b as any)[sortKey];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });
  }, [data, sortKey, sortDir]);

  if (isLoading) {
    return (
      <div style={tableContainerStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} style={thStyle}>{col.header}</th>
              ))}
              {actions && <th style={thStyle}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={col.key} style={tdStyle}>
                    <div className="skeleton" style={{ height: '16px', width: '80%' }} />
                  </td>
                ))}
                {actions && <td style={tdStyle}><div className="skeleton" style={{ height: '16px', width: '60px' }} /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div style={tableContainerStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} style={thStyle}>{col.header}</th>
              ))}
              {actions && <th style={thStyle}>Actions</th>}
            </tr>
          </thead>
        </table>
        <div style={emptyStateContainerStyle}>
          {emptyState || (
            <div style={{ textAlign: 'center', padding: '48px 24px' }}>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-base)' }}>
                No data available
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={tableContainerStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  ...thStyle,
                  cursor: col.sortable ? 'pointer' : 'default',
                  userSelect: col.sortable ? 'none' : 'auto',
                  width: col.width,
                }}
                onClick={() => col.sortable && handleSort(col.key)}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  {col.header}
                  {col.sortable && sortKey === col.key && (
                    <span style={{ fontSize: '10px' }}>{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>
                  )}
                </span>
              </th>
            ))}
            {actions && <th style={thStyle}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row, idx) => (
            <tr
              key={String((row as any)[keyField] ?? idx)}
              onClick={() => onRowClick?.(row)}
              style={{
                cursor: onRowClick ? 'pointer' : 'default',
                backgroundColor: idx % 2 === 1 ? 'var(--color-bg-surface-alt)' : 'transparent',
                transition: 'background-color 150ms ease',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-bg-surface-alt)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = idx % 2 === 1 ? 'var(--color-bg-surface-alt)' : 'transparent'; }}
            >
              {columns.map((col) => (
                <td key={col.key} style={tdStyle}>
                  {col.render ? col.render(row) : String((row as any)[col.key] ?? '')}
                </td>
              ))}
              {actions && <td style={tdStyle}>{actions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// -- Styles --

const tableContainerStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-lg)',
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
  maxWidth: '100%',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 'var(--font-size-base)',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 16px',
  fontSize: 'var(--font-size-sm)',
  fontWeight: 500,
  color: 'var(--color-text-secondary)',
  backgroundColor: 'var(--color-bg-surface-alt)',
  borderBottom: '1px solid var(--color-border)',
  position: 'sticky',
  top: 0,
  zIndex: 1,
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--color-border)',
  minHeight: '48px',
  verticalAlign: 'middle',
  color: 'var(--color-text-primary)',
};

const emptyStateContainerStyle: React.CSSProperties = {
  padding: '48px 24px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
};
