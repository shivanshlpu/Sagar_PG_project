import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api';
import { formatDate } from '../lib/date';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { FormField, Input, Select, Textarea } from '../components/ui/FormField';
import { Badge } from '../components/ui/Badge';
import { useToast } from '../components/ui/Toast';
import { ResponsiveTable, type Column } from '../components/common/ResponsiveTable';
import { Megaphone, Plus } from 'lucide-react';

interface Announcement {
  id: string;
  pg_id: string;
  title: string;
  description: string;
  category: 'water' | 'electricity' | 'maintenance' | 'rent' | 'general';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'active' | 'expired' | 'archived';
  expires_at?: string | null;
  created_at: string;
}

const announcementSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  category: z.enum(['water', 'electricity', 'maintenance', 'rent', 'general']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  expires_at: z.string().optional(),
});

type AnnouncementForm = z.infer<typeof announcementSchema>;

export default function AdminAnnouncements() {
  const [announcements, setAnnouncements] = React.useState<Announcement[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState('active');
  const [categoryFilter, setCategoryFilter] = React.useState('');
  const { addToast } = useToast();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<AnnouncementForm>({
    resolver: zodResolver(announcementSchema),
    defaultValues: {
      category: 'general',
      priority: 'medium',
    },
  });

  const loadAnnouncements = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (categoryFilter) params.append('category', categoryFilter);

      const res = await apiGet<Announcement[]>(`/announcements?${params.toString()}`);
      if (res.success && res.data) {
        setAnnouncements(res.data);
      }
    } catch {
      addToast('error', 'Failed to load announcements');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, addToast]);

  React.useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  const onSubmit = async (data: AnnouncementForm) => {
    setIsSubmitting(true);
    try {
      const payload = {
        ...data,
        expires_at: data.expires_at ? new Date(data.expires_at).toISOString() : null,
      };
      const res = await apiPost('/announcements', payload);
      if (res.success) {
        addToast('success', 'Announcement published successfully');
        setIsModalOpen(false);
        reset();
        loadAnnouncements();
      } else {
        addToast('error', res.error || 'Failed to publish announcement');
      }
    } catch (err) {
      addToast('error', (err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchive = async (id: string) => {
    try {
      const res = await apiPatch(`/announcements/${id}`, { status: 'archived' });
      if (res.success) {
        addToast('success', 'Announcement archived');
        loadAnnouncements();
      }
    } catch {
      addToast('error', 'Failed to archive announcement');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this notice?')) return;
    try {
      const res = await apiDelete(`/announcements/${id}`);
      if (res.success) {
        addToast('success', 'Announcement deleted');
        loadAnnouncements();
      }
    } catch {
      addToast('error', 'Failed to delete announcement');
    }
  };

  const getPriorityBadgeVariant = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'danger';
      case 'high': return 'warning';
      case 'medium': return 'info';
      default: return 'neutral';
    }
  };

  const columns: Column<Announcement>[] = [
    {
      key: 'title',
      label: 'Notice Title',
      primary: true,
      render: (item) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.title}</div>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px', lineClamp: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {item.description}
          </p>
        </div>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      render: (item) => (
        <span style={{ textTransform: 'capitalize', fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>
          {item.category}
        </span>
      ),
    },
    {
      key: 'priority',
      label: 'Priority',
      render: (item) => (
        <Badge variant={getPriorityBadgeVariant(item.priority)}>
          {item.priority.toUpperCase()}
        </Badge>
      ),
    },
    {
      key: 'created_at',
      label: 'Posted On (DD/MM/YYYY)',
      render: (item) => (
        <span style={{ fontSize: 'var(--font-size-sm)' }}>
          {formatDate(item.created_at)}
        </span>
      ),
    },
    {
      key: 'expires_at',
      label: 'Expires (DD/MM/YYYY)',
      render: (item) => (
        <span style={{ fontSize: 'var(--font-size-sm)', color: item.expires_at ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
          {item.expires_at ? formatDate(item.expires_at) : 'No Expiry'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (item) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          {item.status === 'active' && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleArchive(item.id);
              }}
            >
              Archive
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            style={{ color: 'var(--color-danger)' }}
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(item.id);
            }}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="page-container">
      {/* Header */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '24px',
      }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
            <Megaphone style={{ color: 'var(--color-primary)' }} /> Announcements
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: '4px' }}>
            Broadcast notices regarding maintenance, rent reminders, water/power cuts, and house rules.
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={16} /> New Announcement
        </Button>
      </div>

      {/* Filters */}
      <Card padding="md" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>Status:</span>
            {['active', 'expired', 'archived', ''].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: statusFilter === st ? 'var(--color-primary)' : 'var(--color-bg-surface-alt)',
                  color: statusFilter === st ? '#FFFFFF' : 'var(--color-text-primary)',
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 500,
                  textTransform: 'capitalize',
                }}
              >
                {st || 'All'}
              </button>
            ))}
          </div>

          <div style={{ marginLeft: 'auto', minWidth: '180px' }}>
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              options={[
                { value: '', label: 'All Categories' },
                { value: 'water', label: 'Water Supply' },
                { value: 'electricity', label: 'Electricity' },
                { value: 'maintenance', label: 'Maintenance' },
                { value: 'rent', label: 'Rent Notice' },
                { value: 'general', label: 'General' },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Announcements Responsive List */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: '64px', borderRadius: 'var(--radius-lg)' }} />
          ))}
        </div>
      ) : (
        <ResponsiveTable
          columns={columns}
          data={announcements}
          keyExtractor={(item) => item.id}
          emptyMessage="No announcements found. Click 'New Announcement' to broadcast a notice."
        />
      )}

      {/* New Announcement Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Broadcast Announcement"
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <FormField label="Notice Title" error={errors.title?.message} required>
            <Input
              placeholder="e.g. Scheduled Water Tank Cleaning on Sunday"
              error={!!errors.title}
              {...register('title')}
            />
          </FormField>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <FormField label="Category" error={errors.category?.message} required>
              <Select
                options={[
                  { value: 'general', label: 'General' },
                  { value: 'water', label: 'Water' },
                  { value: 'electricity', label: 'Electricity' },
                  { value: 'maintenance', label: 'Maintenance' },
                  { value: 'rent', label: 'Rent Notice' },
                ]}
                error={!!errors.category}
                {...register('category')}
              />
            </FormField>

            <FormField label="Priority" error={errors.priority?.message} required>
              <Select
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                  { value: 'urgent', label: 'Urgent' },
                ]}
                error={!!errors.priority}
                {...register('priority')}
              />
            </FormField>
          </div>

          <FormField label="Description / Details" error={errors.description?.message} required>
            <Textarea
              placeholder="Provide all relevant details, times, precautions..."
              rows={4}
              error={!!errors.description}
              {...register('description')}
            />
          </FormField>

          <FormField label="Expiration Date (Optional)">
            <Input
              type="date"
              {...register('expires_at')}
            />
          </FormField>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Broadcast Notice
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
