import React from 'react';
import { DataTable, type Column, Badge } from '../components/ui';
import { apiGet, formatDateTime } from '../lib/api';
import { ScrollText } from 'lucide-react';

interface AuditEntry { id: string; actor_email: string; action: string; entity_type: string; entity_id: string; created_at: string; }

export default function AdminAuditLog() {
  const [entries, setEntries] = React.useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => { loadAuditLog(); }, []);

  async function loadAuditLog() {
    setIsLoading(true);
    const res = await apiGet<{ data: AuditEntry[] }>('/audit-log');
    const d = res.data;
    setEntries(Array.isArray(d) ? d : (d as unknown as { data: AuditEntry[] })?.data || []);
    setIsLoading(false);
  }

  const columns: Column<AuditEntry>[] = [
    { key: 'created_at', header: 'Time', render: (r: AuditEntry) => <span className="text-muted">{formatDateTime(r.created_at)}</span>, sortable: true },
    { key: 'actor_email', header: 'Actor' },
    { key: 'action', header: 'Action', render: (r: AuditEntry) => <Badge variant="neutral">{r.action}</Badge> },
    { key: 'entity_type', header: 'Entity', render: (r: AuditEntry) => <span style={{ textTransform: 'capitalize' }}>{r.entity_type}</span> },
    { key: 'entity_id', header: 'Entity ID', render: (r: AuditEntry) => <span className="text-muted" style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.entity_id.slice(0, 8)}...</span> },
  ];

  return (
    <div className="page-container">
      <h1 className="page-title">Audit Log</h1>
      <DataTable<AuditEntry> columns={columns} data={entries} isLoading={isLoading} emptyState={
        <div style={{ textAlign: 'center', padding: '48px' }}>
          <ScrollText size={48} style={{ color: 'var(--color-text-muted)', marginBottom: '12px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>No audit log entries yet</p>
        </div>
      } />
    </div>
  );
}
