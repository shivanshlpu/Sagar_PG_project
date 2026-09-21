import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DataTable, type Column, Badge, getStatusBadgeVariant, Button, Modal, FormField, Input, Select, TextArea } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../hooks/useAuth';
import { apiGet, apiPost, formatDate } from '../lib/api';
import { MessageSquareWarning, Plus } from 'lucide-react';

interface Complaint { id: string; title: string; category: string; priority: string; status: string; created_at: string; description: string; }

const complaintSchema = z.object({
  category: z.enum(['maintenance', 'noise', 'cleanliness', 'security', 'billing', 'other']),
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
});

type ComplaintForm = z.input<typeof complaintSchema>;

export default function TenantComplaints() {
  const { user } = useAuth();
  const [complaints, setComplaints] = React.useState<Complaint[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [showModal, setShowModal] = React.useState(false);
  const { showToast } = useToast();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ComplaintForm>({ resolver: zodResolver(complaintSchema) as any });

  React.useEffect(() => { loadComplaints(); }, []);

  async function loadComplaints() {
    setIsLoading(true);
    const res = await apiGet<Complaint[]>(`/complaints?tenant_id=${user?.tenantId || ''}`);
    if (res.success && res.data) setComplaints(res.data);
    setIsLoading(false);
  }

  async function onSubmit(data: ComplaintForm) {
    const res = await apiPost('/complaints', data);
    if (res.success) { showToast('Complaint submitted'); setShowModal(false); reset(); loadComplaints(); }
    else showToast(res.error || 'Failed', 'error');
  }

  const columns: Column<Complaint>[] = [
    { key: 'title', header: 'Title' },
    { key: 'category', header: 'Category', render: (r: Complaint) => <span style={{ textTransform: 'capitalize' }}>{r.category}</span> },
    { key: 'priority', header: 'Priority', render: (r: Complaint) => <Badge variant={getStatusBadgeVariant(r.priority)}>{r.priority}</Badge> },
    { key: 'status', header: 'Status', render: (r: Complaint) => <Badge variant={getStatusBadgeVariant(r.status)}>{r.status}</Badge> },
    { key: 'created_at', header: 'Date', render: (r: Complaint) => formatDate(r.created_at) },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>My Complaints</h1>
        <Button onClick={() => { reset(); setShowModal(true); }}><Plus size={16} /> New Complaint</Button>
      </div>

      <DataTable<Complaint> columns={columns} data={complaints} isLoading={isLoading} emptyState={
        <div style={{ textAlign: 'center', padding: '48px' }}>
          <MessageSquareWarning size={48} style={{ color: 'var(--color-text-muted)', marginBottom: '12px' }} />
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }}>No complaints filed</p>
          <Button onClick={() => setShowModal(true)}><Plus size={16} /> File a Complaint</Button>
        </div>
      } />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="New Complaint" footer={
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button onClick={handleSubmit(onSubmit)}>Submit</Button>
        </div>
      }>
        <FormField label="Category" error={errors.category?.message} required>
          <Select options={[{ value: 'maintenance', label: 'Maintenance' }, { value: 'noise', label: 'Noise' }, { value: 'cleanliness', label: 'Cleanliness' }, { value: 'security', label: 'Security' }, { value: 'billing', label: 'Billing' }, { value: 'other', label: 'Other' }]} placeholder="Select category" error={!!errors.category} {...register('category')} />
        </FormField>
        <FormField label="Title" error={errors.title?.message} required>
          <Input {...register('title')} error={!!errors.title} placeholder="Brief description" />
        </FormField>
        <FormField label="Description" error={errors.description?.message} required>
          <TextArea {...register('description')} error={!!errors.description} placeholder="Describe the issue in detail" />
        </FormField>
        <FormField label="Priority" error={errors.priority?.message}>
          <Select options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' }]} error={!!errors.priority} {...register('priority')} />
        </FormField>
      </Modal>
    </div>
  );
}
