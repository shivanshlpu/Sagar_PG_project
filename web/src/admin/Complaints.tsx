import React from 'react';
import { DataTable, type Column, Badge, getStatusBadgeVariant, Select } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { apiGet, apiPatch, formatDate } from '../lib/api';
import { MessageSquareWarning } from 'lucide-react';

interface Complaint { id: string; title: string; category: string; priority: string; status: string; tenant?: { full_name: string }; room?: { room_number: string }; created_at: string; }

export default function AdminComplaints() {
  const [complaints, setComplaints] = React.useState<Complaint[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState('');
  const { showToast } = useToast();

  React.useEffect(() => { loadComplaints(); }, [statusFilter]);

  async function loadComplaints() {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    const res = await apiGet<Complaint[]>(`/complaints?${params}`);
    if (res.success && res.data) setComplaints(res.data);
    setIsLoading(false);
  }

  async function updateStatus(id: string, status: string) {
    const res = await apiPatch(`/complaints/${id}`, { status });
    if (res.success) { showToast('Complaint updated'); loadComplaints(); }
    else showToast(res.error || 'Failed', 'error');
  }

  const columns: Column<Complaint>[] = [
    { key: 'title', header: 'Title', sortable: true },
    { key: 'category', header: 'Category', render: (r: Complaint) => <span style={{ textTransform: 'capitalize' }}>{r.category}</span> },
    { key: 'tenant', header: 'Tenant', render: (r: Complaint) => r.tenant?.full_name || '-' },
    { key: 'room', header: 'Room', render: (r: Complaint) => r.room?.room_number || '-' },
    { key: 'priority', header: 'Priority', render: (r: Complaint) => <Badge variant={getStatusBadgeVariant(r.priority)}>{r.priority}</Badge> },
    { key: 'status', header: 'Status', render: (r: Complaint) => <Badge variant={getStatusBadgeVariant(r.status)}>{r.status}</Badge> },
    { key: 'created_at', header: 'Date', render: (r: Complaint) => formatDate(r.created_at), sortable: true },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Complaints</h1>
      </div>
      <div style={{ marginBottom: '16px' }}>
        <Select options={[{ value: '', label: 'All Statuses' }, { value: 'open', label: 'Open' }, { value: 'in_progress', label: 'In Progress' }, { value: 'resolved', label: 'Resolved' }, { value: 'closed', label: 'Closed' }]} value={statusFilter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value)} style={{ maxWidth: '180px' }} />
      </div>
      <DataTable<Complaint> columns={columns} data={complaints} isLoading={isLoading} actions={(row: Complaint) => row.status !== 'closed' ? (
        <Select options={[{ value: '', label: 'Change...' }, { value: 'in_progress', label: 'In Progress' }, { value: 'resolved', label: 'Resolved' }, { value: 'closed', label: 'Closed' }]} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { if (e.target.value) updateStatus(row.id, e.target.value); }} style={{ fontSize: 'var(--font-size-xs)', padding: '4px 8px', maxWidth: '120px' }} />
      ) : null} emptyState={
        <div style={{ textAlign: 'center', padding: '48px' }}>
          <MessageSquareWarning size={48} style={{ color: 'var(--color-text-muted)', marginBottom: '12px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>No complaints found</p>
        </div>
      } />
    </div>
  );
}
