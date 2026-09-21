import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DataTable, type Column, Badge, getStatusBadgeVariant, Button, Modal, FormField, Input, Select, ConfirmModal } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { apiGet, apiPost, apiPatch, apiDelete, formatCurrency } from '../lib/api';
import { Plus, Pencil, Trash2, BedDouble, DoorOpen } from 'lucide-react';

interface Room {
  id: string;
  room_number: string;
  floor: number;
  room_type: string;
  total_beds: number;
  occupied_beds: number;
  base_rent_paise: number;
  status: string;
  notes: string | null;
  beds?: Array<{ id: string; bed_number: string; status: string; tenant: { full_name: string } | null }>;
}

const roomSchema = z.object({
  room_number: z.string().min(1, 'Room number is required'),
  floor: z.coerce.number().int().min(0),
  room_type: z.enum(['single', 'double', 'triple', 'dormitory']),
  total_beds: z.coerce.number().int().min(1),
  base_rent_paise: z.coerce.number().int().min(0),
  notes: z.string().optional(),
});

type RoomForm = z.infer<typeof roomSchema>;

export default function AdminRooms() {
  const [rooms, setRooms] = React.useState<Room[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [showModal, setShowModal] = React.useState(false);
  const [editingRoom, setEditingRoom] = React.useState<Room | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Room | null>(null);
  const [showBeds, setShowBeds] = React.useState<Room | null>(null);
  const { showToast } = useToast();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<RoomForm>({
    resolver: zodResolver(roomSchema),
  });

  React.useEffect(() => { loadRooms(); }, []);

  async function loadRooms() {
    setIsLoading(true);
    const res = await apiGet<Room[]>('/rooms');
    if (res.success && res.data) {
      setRooms(res.data);
    }
    setIsLoading(false);
  }

  function openCreate() {
    setEditingRoom(null);
    reset({ room_number: '', floor: 0, room_type: 'single', total_beds: 1, base_rent_paise: 0, notes: '' });
    setShowModal(true);
  }

  function openEdit(room: Room) {
    setEditingRoom(room);
    reset({
      room_number: room.room_number,
      floor: room.floor,
      room_type: room.room_type as 'single' | 'double' | 'triple' | 'dormitory',
      total_beds: room.total_beds,
      base_rent_paise: room.base_rent_paise,
      notes: room.notes || '',
    });
    setShowModal(true);
  }

  async function onSubmit(data: RoomForm) {
    if (editingRoom) {
      const res = await apiPatch(`/rooms/${editingRoom.id}`, data);
      if (res.success) {
        showToast(`Room ${data.room_number} updated`);
        setShowModal(false);
        loadRooms();
      } else {
        showToast(res.error || 'Update failed', 'error');
      }
    } else {
      const res = await apiPost('/rooms', data);
      if (res.success) {
        showToast(`Room ${data.room_number} created`);
        setShowModal(false);
        loadRooms();
      } else {
        showToast(res.error || 'Creation failed', 'error');
      }
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await apiDelete(`/rooms/${deleteTarget.id}`);
    if (res.success) {
      showToast(`Room ${deleteTarget.room_number} deleted`);
      setDeleteTarget(null);
      loadRooms();
    } else {
      showToast(res.error || 'Delete failed', 'error');
    }
  }

  const columns: Column<Room>[] = [
    { key: 'room_number', header: 'Room No.', sortable: true },
    { key: 'floor', header: 'Floor', sortable: true },
    { key: 'room_type', header: 'Type', render: (row: Room) => <span style={{ textTransform: 'capitalize' }}>{row.room_type}</span> },
    {
      key: 'occupancy',
      header: 'Occupancy',
      render: (row: Room) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {row.occupied_beds} / {row.total_beds}
        </span>
      ),
    },
    {
      key: 'base_rent_paise',
      header: 'Base Rent',
      sortable: true,
      render: (row: Room) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(row.base_rent_paise)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: Room) => <Badge variant={getStatusBadgeVariant(row.status)}>{row.status}</Badge>,
    },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Rooms</h1>
        <Button onClick={openCreate}>
          <Plus size={16} /> Add Room
        </Button>
      </div>

      <DataTable<Room>
        columns={columns}
        data={rooms}
        isLoading={isLoading}
        onRowClick={(room: Room) => setShowBeds(room)}
        actions={(row: Room) => (
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={(e) => { e.stopPropagation(); setShowBeds(row); }} style={iconBtnStyle} title="View beds">
              <BedDouble size={16} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); openEdit(row); }} style={iconBtnStyle} title="Edit room">
              <Pencil size={16} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }} style={{ ...iconBtnStyle, color: 'var(--color-danger)' }} title="Delete room">
              <Trash2 size={16} />
            </button>
          </div>
        )}
        emptyState={
          <div style={{ textAlign: 'center', padding: '48px' }}>
            <DoorOpen size={48} style={{ color: 'var(--color-text-muted)', marginBottom: '12px' }} />
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }}>No rooms added yet</p>
            <Button onClick={openCreate}><Plus size={16} /> Add First Room</Button>
          </div>
        }
      />

      {/* Add/Edit Room Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingRoom ? 'Edit Room' : 'Add Room'}
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSubmit(onSubmit)}>{editingRoom ? 'Update' : 'Create'}</Button>
          </div>
        }
      >
        <FormField label="Room Number" error={errors.room_number?.message} required>
          <Input {...register('room_number')} placeholder="e.g. 101, A1" error={!!errors.room_number} />
        </FormField>
        <FormField label="Floor" error={errors.floor?.message} required>
          <Input type="number" {...register('floor')} error={!!errors.floor} />
        </FormField>
        <FormField label="Room Type" error={errors.room_type?.message} required>
          <Select
            options={[
              { value: 'single', label: 'Single' },
              { value: 'double', label: 'Double' },
              { value: 'triple', label: 'Triple' },
              { value: 'dormitory', label: 'Dormitory' },
            ]}
            error={!!errors.room_type}
            {...register('room_type')}
          />
        </FormField>
        <FormField label="Total Beds" error={errors.total_beds?.message} required>
          <Input type="number" {...register('total_beds')} error={!!errors.total_beds} />
        </FormField>
        <FormField label="Base Rent (in paise)" error={errors.base_rent_paise?.message} required hint="Enter amount in paise. 1000000 = Rs. 10,000">
          <Input type="number" {...register('base_rent_paise')} error={!!errors.base_rent_paise} />
        </FormField>
        <FormField label="Notes">
          <Input {...register('notes')} placeholder="Optional notes" />
        </FormField>
      </Modal>

      {/* Beds Modal */}
      <Modal
        isOpen={!!showBeds}
        onClose={() => setShowBeds(null)}
        title={`Beds - Room ${showBeds?.room_number || ''}`}
        size="lg"
      >
        {showBeds?.beds && showBeds.beds.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
            {showBeds.beds.map((bed) => (
              <div key={bed.id} style={{
                padding: '12px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: bed.status === 'occupied' ? 'var(--color-primary-light)' : 'var(--color-bg-surface-alt)',
              }}>
                <p style={{ fontWeight: 500, fontSize: 'var(--font-size-sm)' }}>{bed.bed_number}</p>
                <Badge variant={getStatusBadgeVariant(bed.status)}>{bed.status}</Badge>
                {bed.tenant && (
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                    {bed.tenant.full_name}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: '24px' }}>
            No bed data available. Beds are created automatically when a room is added.
          </p>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Room"
        message={`Are you sure you want to delete Room ${deleteTarget?.room_number}? This action cannot be undone. All beds in this room will also be deleted.`}
        confirmLabel="Delete Room"
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
  color: 'var(--color-text-secondary)',
  display: 'flex',
};
