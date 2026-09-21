import React from 'react';
import { ResponsiveTable, type ResponsiveColumn } from '../components/common/ResponsiveTable';
import { MetricCard } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { FormField, Input, Select, Textarea } from '../components/ui/FormField';
import { Modal, ConfirmModal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api';
import { formatDate } from '../lib/date';
import {
  Package,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

interface Asset {
  id: string;
  room_id: string;
  name: string;
  description: string | null;
  quantity: number;
  condition: 'good' | 'fair' | 'poor' | 'damaged' | 'replaced';
  notes: string | null;
  created_at: string;
  room?: {
    id: string;
    room_number: string;
    floor: number;
  };
}

interface RoomOption {
  id: string;
  room_number: string;
  floor: number;
}

export default function AdminAssets() {
  const [assets, setAssets] = React.useState<Asset[]>([]);
  const [rooms, setRooms] = React.useState<RoomOption[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [roomFilter, setRoomFilter] = React.useState('');
  const [conditionFilter, setConditionFilter] = React.useState('');

  // Modal states
  const [showModal, setShowModal] = React.useState(false);
  const [editingAsset, setEditingAsset] = React.useState<Asset | null>(null);
  const [assetToDelete, setAssetToDelete] = React.useState<Asset | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Form states
  const [formRoomId, setFormRoomId] = React.useState('');
  const [formName, setFormName] = React.useState('');
  const [formQuantity, setFormQuantity] = React.useState(1);
  const [formCondition, setFormCondition] = React.useState<'good' | 'fair' | 'poor' | 'damaged' | 'replaced'>('good');
  const [formDescription, setFormDescription] = React.useState('');
  const [formNotes, setFormNotes] = React.useState('');

  const { showToast } = useToast();

  React.useEffect(() => {
    loadRooms();
  }, []);

  React.useEffect(() => {
    loadAssets();
  }, [roomFilter, conditionFilter]);

  async function loadRooms() {
    const res = await apiGet<RoomOption[]>('/rooms');
    if (res.success && res.data) {
      setRooms(Array.isArray(res.data) ? res.data : []);
    }
  }

  async function loadAssets() {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (roomFilter) params.set('roomId', roomFilter);
    if (conditionFilter) params.set('condition', conditionFilter);

    const res = await apiGet<Asset[]>(`/assets?${params}`);
    if (res.success && res.data) {
      setAssets(Array.isArray(res.data) ? res.data : []);
    }
    setIsLoading(false);
  }

  function openCreateModal() {
    setEditingAsset(null);
    setFormRoomId(rooms[0]?.id || '');
    setFormName('');
    setFormQuantity(1);
    setFormCondition('good');
    setFormDescription('');
    setFormNotes('');
    setShowModal(true);
  }

  function openEditModal(asset: Asset) {
    setEditingAsset(asset);
    setFormRoomId(asset.room_id);
    setFormName(asset.name);
    setFormQuantity(asset.quantity);
    setFormCondition(asset.condition);
    setFormDescription(asset.description || '');
    setFormNotes(asset.notes || '');
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formRoomId) {
      showToast('Please select a room', 'error');
      return;
    }
    if (!formName.trim()) {
      showToast('Asset name is required', 'error');
      return;
    }

    setIsSubmitting(true);
    if (editingAsset) {
      const res = await apiPatch(`/assets/${editingAsset.id}`, {
        room_id: formRoomId,
        name: formName.trim(),
        quantity: Number(formQuantity),
        condition: formCondition,
        description: formDescription.trim() || null,
        notes: formNotes.trim() || null,
      });
      if (res.success) {
        showToast('Asset updated successfully');
        setShowModal(false);
        loadAssets();
      } else {
        showToast(res.error || 'Failed to update asset', 'error');
      }
    } else {
      const res = await apiPost('/assets', {
        room_id: formRoomId,
        name: formName.trim(),
        quantity: Number(formQuantity),
        condition: formCondition,
        description: formDescription.trim() || null,
        notes: formNotes.trim() || null,
      });
      if (res.success) {
        showToast('Asset created successfully');
        setShowModal(false);
        loadAssets();
      } else {
        showToast(res.error || 'Failed to create asset', 'error');
      }
    }
    setIsSubmitting(false);
  }

  async function handleDelete() {
    if (!assetToDelete) return;
    setIsSubmitting(true);
    const res = await apiDelete(`/assets/${assetToDelete.id}`);
    if (res.success) {
      showToast('Asset removed');
      setAssetToDelete(null);
      loadAssets();
    } else {
      showToast(res.error || 'Failed to delete asset', 'error');
    }
    setIsSubmitting(false);
  }

  // Metrics
  const totalCount = assets.reduce((sum, a) => sum + (a.quantity || 1), 0);
  const goodCount = assets.filter((a) => a.condition === 'good').reduce((sum, a) => sum + a.quantity, 0);
  const damagedCount = assets.filter((a) => ['poor', 'damaged'].includes(a.condition)).reduce((sum, a) => sum + a.quantity, 0);
  const replacedCount = assets.filter((a) => a.condition === 'replaced').reduce((sum, a) => sum + a.quantity, 0);

  const getConditionBadgeVariant = (cond: string) => {
    switch (cond) {
      case 'good': return 'success';
      case 'fair': return 'info';
      case 'poor': return 'warning';
      case 'damaged': return 'danger';
      case 'replaced': return 'neutral';
      default: return 'neutral';
    }
  };

  const columns: ResponsiveColumn<Asset>[] = [
    {
      key: 'name',
      header: 'Asset Name',
      render: (a) => (
        <div>
          <div style={{ fontWeight: 600 }}>{a.name}</div>
          {a.description && (
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
              {a.description}
            </div>
          )}
        </div>
      ),
      sortable: true,
    },
    {
      key: 'room',
      header: 'Room',
      render: (a) => (
        <span style={{ fontWeight: 500 }}>
          {a.room?.room_number ? `Room ${a.room.room_number}` : '—'}
        </span>
      ),
    },
    {
      key: 'quantity',
      header: 'Qty',
      render: (a) => <span className="tabular-nums" style={{ fontWeight: 600 }}>{a.quantity}</span>,
      sortable: true,
    },
    {
      key: 'condition',
      header: 'Condition',
      render: (a) => (
        <Badge variant={getConditionBadgeVariant(a.condition)}>
          {a.condition.toUpperCase()}
        </Badge>
      ),
    },
    {
      key: 'created_at',
      header: 'Recorded On',
      render: (a) => formatDate(a.created_at),
      sortable: true,
    },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: '4px' }}>Asset Inventory</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Track furniture, electronics, and room fixtures across all PG rooms
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus size={16} /> Add Asset
        </Button>
      </div>

      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <MetricCard label="Total Inventory" value={totalCount} icon={<Package size={22} />} />
        <MetricCard label="Good Condition" value={goodCount} icon={<CheckCircle2 size={22} />} />
        <MetricCard label="Damaged / Poor" value={damagedCount} icon={<AlertTriangle size={22} />} />
        <MetricCard label="Replaced" value={replacedCount} icon={<RotateCcw size={22} />} />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <Select
          options={[
            { value: '', label: 'All Rooms' },
            ...rooms.map((r) => ({ value: r.id, label: `Room ${r.room_number}` })),
          ]}
          value={roomFilter}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRoomFilter(e.target.value)}
          style={{ maxWidth: '180px' }}
        />
        <Select
          options={[
            { value: '', label: 'All Conditions' },
            { value: 'good', label: 'Good' },
            { value: 'fair', label: 'Fair' },
            { value: 'poor', label: 'Poor' },
            { value: 'damaged', label: 'Damaged' },
            { value: 'replaced', label: 'Replaced' },
          ]}
          value={conditionFilter}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setConditionFilter(e.target.value)}
          style={{ maxWidth: '180px' }}
        />
      </div>

      {/* Responsive Table */}
      <ResponsiveTable<Asset>
        columns={columns}
        data={assets}
        isLoading={isLoading}
        renderCard={(asset) => (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 600 }}>{asset.name}</h4>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                  {asset.room?.room_number ? `Room ${asset.room.room_number}` : ''} • Qty: {asset.quantity}
                </span>
              </div>
              <Badge variant={getConditionBadgeVariant(asset.condition)}>{asset.condition}</Badge>
            </div>

            {asset.description && (
              <p style={{ margin: '8px 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                {asset.description}
              </p>
            )}

            {asset.notes && (
              <p style={{ margin: '4px 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                Note: {asset.notes}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                Added: {formatDate(asset.created_at)}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button size="sm" variant="secondary" onClick={() => openEditModal(asset)}>
                  <Pencil size={14} /> Edit
                </Button>
                <Button size="sm" variant="danger" onClick={() => setAssetToDelete(asset)}>
                  <Trash2 size={14} /> Delete
                </Button>
              </div>
            </div>
          </div>
        )}
        actions={(row: Asset) => (
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => openEditModal(row)}
              style={iconBtnStyle}
              title="Edit Asset"
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={() => setAssetToDelete(row)}
              style={{ ...iconBtnStyle, color: 'var(--color-danger)' }}
              title="Delete Asset"
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}
        emptyState={
          <div style={{ textAlign: 'center', padding: '48px' }}>
            <Package size={48} style={{ color: 'var(--color-text-muted)', marginBottom: '12px' }} />
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }}>No assets found</p>
            <Button onClick={openCreateModal}>
              <Plus size={16} /> Add First Asset
            </Button>
          </div>
        }
      />

      {/* Add / Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingAsset ? 'Edit Asset' : 'Add New Asset'}
        size="md"
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} isLoading={isSubmitting}>
              {editingAsset ? 'Save Changes' : 'Create Asset'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit}>
          <FormField label="Assigned Room" required>
            <Select
              options={rooms.map((r) => ({
                value: r.id,
                label: `Room ${r.room_number} (Floor ${r.floor})`,
              }))}
              value={formRoomId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormRoomId(e.target.value)}
            />
          </FormField>

          <FormField label="Asset Name" required hint="e.g. Study Table, Ceiling Fan, Geyser, Single Mattress">
            <Input
              value={formName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormName(e.target.value)}
              placeholder="e.g. Wooden Study Table"
            />
          </FormField>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Quantity" required>
              <Input
                type="number"
                min={1}
                value={formQuantity}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormQuantity(parseInt(e.target.value, 10) || 1)}
              />
            </FormField>

            <FormField label="Condition" required>
              <Select
                options={[
                  { value: 'good', label: 'Good' },
                  { value: 'fair', label: 'Fair' },
                  { value: 'poor', label: 'Poor' },
                  { value: 'damaged', label: 'Damaged' },
                  { value: 'replaced', label: 'Replaced' },
                ]}
                value={formCondition}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormCondition(e.target.value as any)}
              />
            </FormField>
          </div>

          <FormField label="Description" hint="Brand, model, or identifying details">
            <Input
              value={formDescription}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormDescription(e.target.value)}
              placeholder="e.g. Godrej 2-door steel wardrobe"
            />
          </FormField>

          <FormField label="Maintenance / Inspection Notes">
            <Textarea
              value={formNotes}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormNotes(e.target.value)}
              placeholder="e.g. Inspected on move-in; minor scratch on right handle"
              rows={3}
            />
          </FormField>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!assetToDelete}
        onClose={() => setAssetToDelete(null)}
        onConfirm={handleDelete}
        title="Delete Asset"
        message={`Are you sure you want to delete "${assetToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        isLoading={isSubmitting}
      />
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '6px',
  borderRadius: 'var(--radius-sm)',
  display: 'flex',
  alignItems: 'center',
  color: 'var(--color-text-secondary)',
};
