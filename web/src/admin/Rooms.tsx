import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DataTable, type Column, Badge, getStatusBadgeVariant, Button, Modal, FormField, Input, Select, ConfirmModal } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { apiGet, apiPost, apiPatch, apiDelete, formatCurrency } from '../lib/api';
import { Plus, Pencil, Trash2, BedDouble, DoorOpen, AlertCircle } from 'lucide-react';

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
  floor: z.coerce.number().int().min(0, 'Floor must be 0 or higher'),
  room_type: z.enum(['single', 'double', 'triple', 'dormitory']),
  total_beds: z.coerce.number().int().min(1, 'Must have at least 1 bed'),
  base_rent: z.coerce.number().min(0, 'Base rent must be a positive number'),
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
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedFloor, setSelectedFloor] = React.useState<string>('all');
  const [selectedStatus, setSelectedStatus] = React.useState<string>('all');
  const { showToast } = useToast();

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<RoomForm>({
    resolver: zodResolver(roomSchema),
  });

  const watchedRoomNumber = watch('room_number') || '';

  // Duplicate detection in real-time
  const duplicateRoom = React.useMemo(() => {
    if (!watchedRoomNumber.trim()) return null;
    return rooms.find(
      (r) =>
        r.room_number.trim().toLowerCase() === watchedRoomNumber.trim().toLowerCase() &&
        (!editingRoom || r.id !== editingRoom.id)
    );
  }, [watchedRoomNumber, rooms, editingRoom]);

  React.useEffect(() => {
    loadRooms();
  }, []);

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
    reset({
      room_number: '',
      floor: 1,
      room_type: 'single',
      total_beds: 1,
      base_rent: 0,
      notes: '',
    });
    setShowModal(true);
  }

  function openEdit(room: Room) {
    setEditingRoom(room);
    reset({
      room_number: room.room_number,
      floor: room.floor,
      room_type: room.room_type as 'single' | 'double' | 'triple' | 'dormitory',
      total_beds: room.total_beds,
      base_rent: (room.base_rent_paise || 0) / 100,
      notes: room.notes || '',
    });
    setShowModal(true);
  }

  async function onSubmit(data: RoomForm) {
    if (duplicateRoom) {
      showToast(
        `Room ${data.room_number} already exists on Floor ${duplicateRoom.floor}. Please use a different room number.`,
        'error'
      );
      return;
    }

    const payload = {
      room_number: data.room_number.trim(),
      floor: data.floor,
      room_type: data.room_type,
      total_beds: data.total_beds,
      base_rent_paise: Math.round(Number(data.base_rent) * 100),
      notes: data.notes || null,
    };

    if (editingRoom) {
      const res = await apiPatch(`/rooms/${editingRoom.id}`, payload);
      if (res.success) {
        showToast(`Room ${data.room_number} updated`);
        setShowModal(false);
        loadRooms();
      } else {
        showToast(res.error || 'Update failed', 'error');
      }
    } else {
      const res = await apiPost('/rooms', payload);
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

  const uniqueFloors = React.useMemo(() => {
    return Array.from(new Set(rooms.map((r) => r.floor))).sort((a, b) => a - b);
  }, [rooms]);

  const filteredRooms = React.useMemo(() => {
    return rooms.filter((room) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        room.room_number.toLowerCase().includes(q) ||
        room.room_type.toLowerCase().includes(q) ||
        (room.notes && room.notes.toLowerCase().includes(q));

      const matchesFloor = selectedFloor === 'all' || String(room.floor) === selectedFloor;
      const matchesStatus = selectedStatus === 'all' || room.status === selectedStatus;

      return matchesSearch && matchesFloor && matchesStatus;
    });
  }, [rooms, searchQuery, selectedFloor, selectedStatus]);

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: '4px' }}>Rooms & Beds</h1>
          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            Manage rooms, floors, bed assignments, and base rents.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} /> Add Room
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ flex: '1 1 200px', minWidth: '180px', position: 'relative' }}>
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search room (e.g. 101, 202)..."
          />
        </div>
        <div style={{ width: '140px' }}>
          <Select
            value={selectedFloor}
            onChange={(e) => setSelectedFloor(e.target.value)}
            options={[
              { value: 'all', label: 'All Floors' },
              ...uniqueFloors.map((f) => ({ value: String(f), label: `Floor ${f}` })),
            ]}
          />
        </div>
        <div style={{ width: '140px' }}>
          <Select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'available', label: 'Available' },
              { value: 'full', label: 'Full' },
            ]}
          />
        </div>
        {(searchQuery || selectedFloor !== 'all' || selectedStatus !== 'all') && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearchQuery('');
              setSelectedFloor('all');
              setSelectedStatus('all');
            }}
          >
            Clear Filters
          </Button>
        )}
      </div>

      <DataTable<Room>
        columns={columns}
        data={filteredRooms}
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
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
              {searchQuery || selectedFloor !== 'all' || selectedStatus !== 'all' ? 'No rooms match your search' : 'No rooms added yet'}
            </p>
            <Button onClick={openCreate}><Plus size={16} /> Add First Room</Button>
          </div>
        }
      />

      {/* Add/Edit Room Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingRoom ? `Edit Room ${editingRoom.room_number}` : 'Add New Room'}
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSubmit(onSubmit)} disabled={!!duplicateRoom}>
              {editingRoom ? 'Update Room' : 'Create Room'}
            </Button>
          </div>
        }
      >
        <FormField label="Room Number" error={errors.room_number?.message} required>
          <Input {...register('room_number')} placeholder="e.g. 101, 202, 301" error={!!errors.room_number || !!duplicateRoom} />
          {duplicateRoom && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '6px',
              padding: '6px 10px',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid var(--color-danger)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-danger)',
              fontSize: 'var(--font-size-xs)',
              lineHeight: 1.4,
            }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>
                Room <strong>{duplicateRoom.room_number}</strong> already exists on Floor {duplicateRoom.floor} ({duplicateRoom.room_type}, {duplicateRoom.total_beds} beds). Please choose a different number.
              </span>
            </div>
          )}
        </FormField>

        <FormField label="Floor" error={errors.floor?.message} required>
          <Input type="number" {...register('floor')} error={!!errors.floor} placeholder="0 for Ground, 1 for 1st..." />
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
          <Input type="number" {...register('total_beds')} error={!!errors.total_beds} placeholder="Number of beds in this room" />
        </FormField>

        <FormField label="Base Rent (₹ / month)" error={errors.base_rent?.message} required hint="Monthly rent per bed or room in Rupees">
          <Input type="number" {...register('base_rent')} placeholder="e.g. 8000" error={!!errors.base_rent} />
        </FormField>

        <FormField label="Notes">
          <Input {...register('notes')} placeholder="e.g. Balcony, AC, Attached Bathroom" />
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
