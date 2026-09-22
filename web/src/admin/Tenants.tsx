import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Modal, FormField, Input, Select, Textarea, Badge, getStatusBadgeVariant, ConfirmModal } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api';
import { formatDate } from '../lib/date';
import { ResponsiveTable, type Column } from '../components/common/ResponsiveTable';
import { Plus, Pencil, Trash2, Link2, CheckCircle2, User, Phone, ShieldCheck, Bed, DollarSign, ArrowRight, ArrowLeft, Eye, ExternalLink, FileText } from 'lucide-react';

interface BedOption {
  id: string;
  bed_number: string;
  status: string;
}

interface RoomOption {
  id: string;
  room_number: string;
  floor: number;
  base_rent_paise: number;
  beds?: BedOption[];
}

interface Tenant {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  gender?: string | null;
  date_of_birth?: string | null;
  id_proof_type?: string | null;
  id_proof_number?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  permanent_address?: string | null;
  room_id?: string | null;
  bed_id?: string | null;
  move_in_date?: string | null;
  security_deposit_paise: number;
  status: string;
  notes?: string | null;
  room?: { room_number: string; floor?: number } | null;
  bed?: { bed_number: string } | null;
  created_at: string;
}

const wizardSchema = z.object({
  // Step 1: Personal
  full_name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email required'),
  phone: z.string().min(10, 'Valid 10-digit phone required'),
  gender: z.string().optional(),
  date_of_birth: z.string().optional(),

  // Step 2: Emergency & Address
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  permanent_address: z.string().optional(),

  // Step 3: ID Proof
  id_proof_type: z.string().optional(),
  id_proof_number: z.string().optional(),

  // Step 4: Room & Bed
  room_id: z.string().optional(),
  bed_id: z.string().optional(),

  // Step 5: Rent & Deposit
  security_deposit: z.coerce.number().min(0),
  move_in_date: z.string().optional(),
  notes: z.string().optional(),
});

type WizardFormData = z.infer<typeof wizardSchema>;

export default function AdminTenants() {
  const [tenants, setTenants] = React.useState<Tenant[]>([]);
  const [rooms, setRooms] = React.useState<RoomOption[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [showWizard, setShowWizard] = React.useState(false);
  const [currentStep, setCurrentStep] = React.useState(1);
  const [editingTenant, setEditingTenant] = React.useState<Tenant | null>(null);
  const [viewingTenant, setViewingTenant] = React.useState<any | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Tenant | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const { showToast } = useToast();

  const { register, handleSubmit, watch, reset, setValue, formState: { errors } } = useForm<WizardFormData>({
    resolver: zodResolver(wizardSchema),
    defaultValues: {
      security_deposit: 0,
      gender: 'male',
      id_proof_type: 'aadhaar',
      move_in_date: new Date().toISOString().split('T')[0],
    },
  });

  const selectedRoomId = watch('room_id');
  const watchedValues = watch();

  // For new registration: show only rooms with vacant beds.
  // When editing an existing tenant: show rooms with vacant beds OR their current assigned room.
  const selectableRooms = React.useMemo(() => {
    return rooms.filter((r) => {
      const vacantBedsCount = (r.beds || []).filter((b) => b.status === 'vacant').length;
      if (editingTenant && r.id === editingTenant.room_id) {
        return true;
      }
      return vacantBedsCount > 0;
    });
  }, [rooms, editingTenant]);

  const selectedRoom = rooms.find(r => r.id === selectedRoomId);
  const availableBeds = React.useMemo(() => {
    if (!selectedRoom) return [];
    return (selectedRoom.beds || []).filter(
      (b) => b.status === 'vacant' || (editingTenant && b.id === editingTenant.bed_id)
    );
  }, [selectedRoom, editingTenant]);

  const loadTenants = React.useCallback(async () => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (searchQuery) params.set('search', searchQuery);
    if (statusFilter) params.set('status', statusFilter);
    const res = await apiGet<Tenant[]>(`/tenants?${params}`);
    if (res.success && res.data) setTenants(res.data);
    setIsLoading(false);
  }, [searchQuery, statusFilter]);

  const loadRooms = React.useCallback(async () => {
    const res = await apiGet<RoomOption[]>('/rooms');
    if (res.success && res.data) setRooms(res.data);
  }, []);

  React.useEffect(() => {
    loadTenants();
    loadRooms();
  }, [loadTenants, loadRooms]);

  function openCreate() {
    setEditingTenant(null);
    setCurrentStep(1);
    reset({
      full_name: '',
      email: '',
      phone: '',
      gender: 'male',
      date_of_birth: '',
      emergency_contact_name: '',
      emergency_contact_phone: '',
      permanent_address: '',
      id_proof_type: 'aadhaar',
      id_proof_number: '',
      room_id: '',
      bed_id: '',
      security_deposit: 0,
      move_in_date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setShowWizard(true);
  }

  function openEdit(tenant: Tenant) {
    setEditingTenant(tenant);
    setCurrentStep(1);
    reset({
      full_name: tenant.full_name,
      email: tenant.email,
      phone: tenant.phone,
      gender: tenant.gender || 'male',
      date_of_birth: tenant.date_of_birth ? tenant.date_of_birth.split('T')[0] : '',
      emergency_contact_name: tenant.emergency_contact_name || '',
      emergency_contact_phone: tenant.emergency_contact_phone || '',
      permanent_address: tenant.permanent_address || '',
      id_proof_type: tenant.id_proof_type || 'aadhaar',
      id_proof_number: tenant.id_proof_number || '',
      room_id: tenant.room_id || '',
      bed_id: tenant.bed_id || '',
      security_deposit: (tenant.security_deposit_paise || 0) / 100,
      move_in_date: tenant.move_in_date ? tenant.move_in_date.split('T')[0] : '',
      notes: tenant.notes || '',
    });
    setShowWizard(true);
  }

  async function handleWizardSubmit(data: WizardFormData) {
    setIsSubmitting(true);
    try {
      const { security_deposit, ...cleanData } = data;
      const payload: Record<string, any> = {
        ...cleanData,
        security_deposit_paise: Math.round((security_deposit || 0) * 100),
        room_id: data.room_id || null,
        bed_id: data.bed_id || null,
        date_of_birth: data.date_of_birth || null,
        move_in_date: data.move_in_date || null,
        id_proof_type: data.id_proof_type || null,
        id_proof_number: data.id_proof_number || null,
      };

      if (editingTenant) {
        const res = await apiPatch(`/tenants/${editingTenant.id}`, payload);
        if (res.success) {
          showToast(`Tenant ${data.full_name} updated successfully`);
          setShowWizard(false);
          loadTenants();
        } else {
          showToast(res.error || 'Update failed', 'error');
        }
      } else {
        const res = await apiPost('/tenants', payload);
        if (res.success) {
          showToast(`Tenant ${data.full_name} onboarded successfully`);
          setShowWizard(false);
          loadTenants();
        } else {
          showToast(res.error || 'Onboarding failed', 'error');
        }
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function openViewDetails(tenant: Tenant) {
    setViewingTenant(tenant);
    setIsLoadingDetails(true);
    try {
      const res = await apiGet<any>(`/tenants/${tenant.id}`);
      if (res.success && res.data) {
        setViewingTenant(res.data);
      }
    } catch {
      // fallback to passed tenant
    } finally {
      setIsLoadingDetails(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await apiDelete(`/tenants/${deleteTarget.id}`);
    if (res.success) {
      showToast(`Tenant ${deleteTarget.full_name} deleted`);
      setDeleteTarget(null);
      loadTenants();
    } else {
      showToast(res.error || 'Delete failed', 'error');
    }
  }

  async function generateRegLink() {
    const res = await apiPost<{ token: string }>('/tenants/registration-link');
    if (res.success && res.data) {
      const link = `${window.location.origin}/join/${res.data.token}`;
      navigator.clipboard.writeText(link);
      showToast('Secure invite link copied to clipboard');
    } else {
      showToast(res.error || 'Failed to generate link', 'error');
    }
  }

  const columns: Column<Tenant>[] = [
    {
      key: 'full_name',
      label: 'Tenant Name',
      primary: true,
      render: (r: Tenant) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{r.full_name}</div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{r.email} • {r.phone}</div>
        </div>
      ),
    },
    {
      key: 'room',
      label: 'Room & Bed',
      render: (r: Tenant) => (
        <span>
          {r.room ? `Room ${r.room.room_number}` : 'Unassigned'}
          {r.bed ? ` (${r.bed.bed_number})` : ''}
        </span>
      ),
    },
    {
      key: 'move_in_date',
      label: 'Move-in (DD/MM/YYYY)',
      render: (r: Tenant) => (
        <span>{r.move_in_date ? formatDate(r.move_in_date) : '—'}</span>
      ),
    },
    {
      key: 'security_deposit',
      label: 'Deposit',
      render: (r: Tenant) => (
        <span style={{ fontWeight: 500 }}>₹{((r.security_deposit_paise || 0) / 100).toLocaleString('en-IN')}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (r: Tenant) => <Badge variant={getStatusBadgeVariant(r.status)}>{r.status}</Badge>,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (row: Tenant) => (
        <div style={{ display: 'flex', gap: '4px' }}>
          <button onClick={(e) => { e.stopPropagation(); openViewDetails(row); }} style={{ ...iconBtnStyle, color: 'var(--color-primary)' }} title="View Profile & Documents"><Eye size={16} /></button>
          <button onClick={(e) => { e.stopPropagation(); openEdit(row); }} style={iconBtnStyle} title="Edit"><Pencil size={16} /></button>
          <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }} style={{ ...iconBtnStyle, color: 'var(--color-danger)' }} title="Delete"><Trash2 size={16} /></button>
        </div>
      ),
    },
  ];

  const steps = [
    { num: 1, label: 'Personal', icon: User },
    { num: 2, label: 'Emergency', icon: Phone },
    { num: 3, label: 'Identity', icon: ShieldCheck },
    { num: 4, label: 'Room & Bed', icon: Bed },
    { num: 5, label: 'Rent & Deposit', icon: DollarSign },
    { num: 6, label: 'Confirm', icon: CheckCircle2 },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 0 }}>Tenants Directory</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: '4px' }}>
            Manage resident onboarding, rooms, contact details, and deposits.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="secondary" onClick={generateRegLink}><Link2 size={16} /> Invite Link</Button>
          <Button onClick={openCreate}><Plus size={16} /> Onboard Tenant</Button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <Input
          placeholder="Search by name, phone, or email..."
          value={searchQuery}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
          style={{ maxWidth: '300px' }}
        />
        <Select
          options={[
            { value: '', label: 'All Statuses' },
            { value: 'active', label: 'Active' },
            { value: 'pending', label: 'Pending' },
            { value: 'inactive', label: 'Inactive' },
            { value: 'moved_out', label: 'Moved Out' },
          ]}
          value={statusFilter}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value)}
          style={{ maxWidth: '180px' }}
        />
      </div>

      {/* Responsive Table / Card List */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '60px', borderRadius: 'var(--radius-lg)' }} />)}
        </div>
      ) : (
        <ResponsiveTable<Tenant>
          columns={columns}
          data={tenants}
          keyExtractor={(item) => item.id}
          emptyMessage="No tenants found. Click 'Onboard Tenant' to register your first resident."
        />
      )}

      {/* 6-Step Onboarding Wizard Modal */}
      <Modal
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        title={editingTenant ? `Edit Tenant — Step ${currentStep} of 6` : `Onboard New Tenant — Step ${currentStep} of 6`}
        size="lg"
      >
        {/* Step Indicator (Desktop: Tabs, Mobile: Progress Bar) */}
        <div className="stepper-desktop" style={{
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: '16px',
          overflowX: 'auto',
          gap: '8px',
        }}>
          {steps.map((step) => {
            const isCompleted = currentStep > step.num;
            const isCurrent = currentStep === step.num;
            return (
              <div
                key={step.num}
                onClick={() => setCurrentStep(step.num)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  opacity: isCurrent ? 1 : isCompleted ? 0.9 : 0.4,
                  color: isCurrent ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                  fontWeight: isCurrent ? 600 : 500,
                  fontSize: '12px',
                  whiteSpace: 'nowrap',
                }}
              >
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: isCurrent ? 'var(--color-primary)' : isCompleted ? 'var(--color-primary-light)' : 'var(--color-bg-surface-alt)',
                  color: isCurrent ? '#FFFFFF' : isCompleted ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 700,
                }}>
                  {isCompleted ? '✓' : step.num}
                </div>
                <span>{step.label}</span>
              </div>
            );
          })}
        </div>

        {/* Mobile Stepper Progress Bar */}
        <div className="stepper-mobile" style={{ marginBottom: '20px', borderBottom: '1px solid var(--color-border)', paddingBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-primary)' }}>
              Step {currentStep} of 6: {steps[currentStep - 1]?.label}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              {Math.round((currentStep / 6) * 100)}%
            </span>
          </div>
          <div style={{ height: '6px', width: '100%', backgroundColor: 'var(--color-bg-surface-alt)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${(currentStep / 6) * 100}%`,
              backgroundColor: 'var(--color-primary)',
              borderRadius: 'var(--radius-full)',
              transition: 'width 250ms ease',
            }} />
          </div>
        </div>

        <form onSubmit={handleSubmit(handleWizardSubmit)}>
          {/* STEP 1: Personal Info */}
          {currentStep === 1 && (
            <div>
              <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: '16px' }}>
                1. Personal Details
              </h3>
              <FormField label="Full Name" error={errors.full_name?.message} required>
                <Input placeholder="e.g. Rahul Sharma" {...register('full_name')} error={!!errors.full_name} />
              </FormField>
              <div className="form-grid-2">
                <FormField label="Email Address" error={errors.email?.message} required>
                  <Input type="email" placeholder="rahul@example.com" {...register('email')} error={!!errors.email} />
                </FormField>
                <FormField label="Phone Number" error={errors.phone?.message} required>
                  <Input type="tel" placeholder="10-digit mobile" {...register('phone')} error={!!errors.phone} />
                </FormField>
              </div>
              <div className="form-grid-2">
                <FormField label="Gender">
                  <Select
                    options={[
                      { value: 'male', label: 'Male' },
                      { value: 'female', label: 'Female' },
                      { value: 'other', label: 'Other' },
                    ]}
                    {...register('gender')}
                  />
                </FormField>
                <FormField label="Date of Birth">
                  <Input type="date" {...register('date_of_birth')} />
                </FormField>
              </div>
            </div>
          )}

          {/* STEP 2: Emergency & Address */}
          {currentStep === 2 && (
            <div>
              <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: '16px' }}>
                2. Emergency Contact & Permanent Address
              </h3>
              <div className="form-grid-2">
                <FormField label="Emergency Contact Name">
                  <Input placeholder="e.g. Suresh Sharma (Father)" {...register('emergency_contact_name')} />
                </FormField>
                <FormField label="Emergency Contact Phone">
                  <Input type="tel" placeholder="Emergency phone" {...register('emergency_contact_phone')} />
                </FormField>
              </div>
              <FormField label="Permanent Address">
                <Textarea rows={3} placeholder="Full address with city, state & pin" {...register('permanent_address')} />
              </FormField>
            </div>
          )}

          {/* STEP 3: Identity Verification */}
          {currentStep === 3 && (
            <div>
              <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: '16px' }}>
                3. Government Identity Proof
              </h3>
              <div className="form-grid-2">
                <FormField label="ID Proof Type">
                  <Select
                    options={[
                      { value: 'aadhaar', label: 'Aadhaar Card' },
                      { value: 'pan', label: 'PAN Card' },
                      { value: 'passport', label: 'Passport' },
                      { value: 'voter_id', label: 'Voter ID' },
                      { value: 'driving_license', label: 'Driving License' },
                    ]}
                    {...register('id_proof_type')}
                  />
                </FormField>
                <FormField label="ID Proof Number">
                  <Input placeholder="e.g. 1234 5678 9012" {...register('id_proof_number')} />
                </FormField>
              </div>
            </div>
          )}

          {/* STEP 4: Room & Bed Assignment */}
          {currentStep === 4 && (
            <div>
              <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: '16px' }}>
                4. Select Room & Bed
              </h3>
              <div className="form-grid-2">
                <FormField label="Select Room">
                  <Select
                    options={[
                      { value: '', label: selectableRooms.length > 0 ? '— Choose Room —' : 'No vacant rooms available' },
                      ...selectableRooms.map(r => {
                        const vacantCount = (r.beds || []).filter(b => b.status === 'vacant').length;
                        return {
                          value: r.id,
                          label: `Room ${r.room_number} (Floor ${r.floor}) - ₹${(r.base_rent_paise / 100).toLocaleString('en-IN')}/mo (${vacantCount} vacant bed${vacantCount !== 1 ? 's' : ''})`,
                        };
                      }),
                    ]}
                    {...register('room_id')}
                    onChange={(e) => {
                      register('room_id').onChange(e);
                      setValue('bed_id', '');
                    }}
                  />
                </FormField>

                <FormField label="Select Vacant Bed">
                  <Select
                    disabled={!selectedRoomId}
                    options={[
                      { value: '', label: availableBeds.length > 0 ? '— Choose Bed —' : 'No vacant beds' },
                      ...availableBeds.map(b => ({
                        value: b.id,
                        label: `Bed ${b.bed_number}${editingTenant && b.id === editingTenant.bed_id ? ' (Currently Assigned)' : ''}`,
                      })),
                    ]}
                    {...register('bed_id')}
                  />
                </FormField>
              </div>
            </div>
          )}

          {/* STEP 5: Rent & Deposit */}
          {currentStep === 5 && (
            <div>
              <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: '16px' }}>
                5. Rent, Deposit & Move-in Date
              </h3>
              <div className="form-grid-2">
                <FormField label="Security Deposit (₹)">
                  <Input type="number" placeholder="e.g. 5000" {...register('security_deposit')} />
                </FormField>
                <FormField label="Move-In Date">
                  <Input type="date" {...register('move_in_date')} />
                </FormField>
              </div>
              <FormField label="Internal Notes / Remarks">
                <Textarea rows={3} placeholder="Any specific requirements or remarks" {...register('notes')} />
              </FormField>
            </div>
          )}

          {/* STEP 6: Review & Confirm */}
          {currentStep === 6 && (
            <div>
              <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, marginBottom: '16px' }}>
                6. Review & Confirm Tenant Details
              </h3>
              <div className="review-grid-2" style={{
                backgroundColor: 'var(--color-bg-surface-alt)',
                borderRadius: 'var(--radius-lg)',
                padding: '16px',
                fontSize: 'var(--font-size-sm)',
              }}>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Tenant Name</span>
                  <div style={{ fontWeight: 600 }}>{watchedValues.full_name || '—'}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Contact</span>
                  <div>{watchedValues.phone} • {watchedValues.email}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Identity Document</span>
                  <div>{watchedValues.id_proof_type?.toUpperCase()}: {watchedValues.id_proof_number || 'Not provided'}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Emergency Contact</span>
                  <div>{watchedValues.emergency_contact_name || '—'} ({watchedValues.emergency_contact_phone || '—'})</div>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Assigned Room & Bed</span>
                  <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                    {selectedRoom ? `Room ${selectedRoom.room_number}` : 'Unassigned'}
                    {watchedValues.bed_id ? ` (Bed ID: ${watchedValues.bed_id})` : ''}
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Security Deposit</span>
                  <div style={{ fontWeight: 600 }}>₹{Number(watchedValues.security_deposit || 0).toLocaleString('en-IN')}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Move-In Date (DD/MM/YYYY)</span>
                  <div>{watchedValues.move_in_date ? formatDate(watchedValues.move_in_date) : 'Immediate'}</div>
                </div>
              </div>
            </div>
          )}

          {/* Wizard Footer Controls */}
          <div className="modal-footer-responsive" style={{ marginTop: '24px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
            <Button
              variant="outline"
              type="button"
              disabled={currentStep === 1}
              onClick={() => setCurrentStep(prev => Math.max(prev - 1, 1))}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <ArrowLeft size={16} /> Back
            </Button>

            {currentStep < 6 ? (
              <Button
                type="button"
                onClick={() => setCurrentStep(prev => Math.min(prev + 1, 6))}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                Next Step <ArrowRight size={16} />
              </Button>
            ) : (
              <Button type="submit" isLoading={isSubmitting} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={16} /> Confirm & Save Tenant
              </Button>
            )}
          </div>
        </form>
      </Modal>

      {/* View Tenant Details & Verification Documents Modal */}
      <Modal
        isOpen={!!viewingTenant}
        onClose={() => setViewingTenant(null)}
        title={viewingTenant ? `${viewingTenant.full_name} — Profile & Documents` : 'Tenant Details'}
        size="lg"
      >
        {isLoadingDetails ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px' }}>
            <div className="skeleton" style={{ height: '30px', width: '200px' }} />
            <div className="skeleton" style={{ height: '120px' }} />
            <div className="skeleton" style={{ height: '200px' }} />
          </div>
        ) : viewingTenant && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Top Status & Basic Info */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--color-bg-surface-alt)',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              flexWrap: 'wrap',
              gap: '8px',
            }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Resident Status</span>
                <div style={{ marginTop: '2px' }}>
                  <Badge variant={getStatusBadgeVariant(viewingTenant.status)}>{viewingTenant.status}</Badge>
                </div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Assigned Room & Bed</span>
                <div style={{ fontWeight: 600, color: 'var(--color-primary)', marginTop: '2px' }}>
                  {viewingTenant.room ? `Room ${viewingTenant.room.room_number}` : 'Unassigned'}
                  {viewingTenant.bed ? ` • Bed ${viewingTenant.bed.bed_number}` : ''}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Move-In Date</span>
                <div style={{ fontWeight: 500, marginTop: '2px' }}>
                  {viewingTenant.move_in_date ? formatDate(viewingTenant.move_in_date) : '—'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Security Deposit</span>
                <div style={{ fontWeight: 600, marginTop: '2px' }}>
                  ₹{((viewingTenant.security_deposit_paise || 0) / 100).toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            {/* Resident Profile Details */}
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px', color: 'var(--color-text-primary)' }}>
                Resident Information
              </h4>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
                backgroundColor: 'var(--color-bg-surface-alt)',
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-size-sm)',
              }}>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>Full Name</span>
                  <div style={{ fontWeight: 600 }}>{viewingTenant.full_name}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>Phone</span>
                  <div>{viewingTenant.phone || '—'}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>Email</span>
                  <div>{viewingTenant.email || '—'}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>Gender</span>
                  <div style={{ textTransform: 'capitalize' }}>{viewingTenant.gender || '—'}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>Date of Birth</span>
                  <div>{viewingTenant.date_of_birth ? formatDate(viewingTenant.date_of_birth) : '—'}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>Emergency Contact</span>
                  <div>{viewingTenant.emergency_contact_name || '—'} {viewingTenant.emergency_contact_phone ? `(${viewingTenant.emergency_contact_phone})` : ''}</div>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>Permanent Address</span>
                  <div>{viewingTenant.permanent_address || '—'}</div>
                </div>
              </div>
            </div>

            {/* Verification Documents Section (Aadhaar & College ID) */}
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px', color: 'var(--color-text-primary)' }}>
                Uploaded Verification Documents
              </h4>
              {(() => {
                const tenantDocs = viewingTenant.documents || (viewingTenant as any).tenant_documents || [];
                if (tenantDocs.length === 0) {
                  return (
                    <div style={{
                      padding: '24px',
                      textAlign: 'center',
                      backgroundColor: 'var(--color-bg-surface-alt)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--color-text-muted)',
                      fontSize: 'var(--font-size-sm)',
                    }}>
                      No identity verification documents uploaded yet.
                    </div>
                  );
                }
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                    {tenantDocs.map((doc: any) => {
                      const isImage = /\.(jpg|jpeg|png|webp)$/i.test(doc.file_name || doc.file_path || doc.file_url || '');
                      return (
                        <div
                          key={doc.id}
                          style={{
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-md)',
                            padding: '14px',
                            backgroundColor: 'var(--color-bg-surface-alt)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <FileText size={18} style={{ color: 'var(--color-primary)' }} />
                              <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-primary)' }}>
                                {doc.file_name}
                              </span>
                            </div>
                            {doc.signed_url && (
                              <a
                                href={doc.signed_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '11px',
                                  color: 'var(--color-primary)',
                                  fontWeight: 600,
                                  textDecoration: 'none',
                                }}
                              >
                                Open <ExternalLink size={12} />
                              </a>
                            )}
                          </div>

                          {/* Image Preview */}
                          {isImage && doc.signed_url ? (
                            <div style={{
                              backgroundColor: 'var(--color-bg-base)',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--color-border)',
                              overflow: 'hidden',
                              height: '180px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                              <img
                                src={doc.signed_url}
                                alt={doc.file_name}
                                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                              />
                            </div>
                          ) : (
                            <div style={{
                              padding: '30px',
                              textAlign: 'center',
                              backgroundColor: 'var(--color-bg-base)',
                              borderRadius: 'var(--radius-sm)',
                              color: 'var(--color-text-muted)',
                              fontSize: '12px',
                            }}>
                              Document available for view/download via link above.
                            </div>
                          )}

                          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Type: {doc.document_type || doc.file_type || 'ID Proof'}</span>
                            <span>{doc.created_at ? formatDate(doc.created_at) : ''}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
              <Button variant="secondary" onClick={() => setViewingTenant(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Tenant"
        message={`Are you sure you want to delete ${deleteTarget?.full_name}? Active tenants cannot be deleted without move-out.`}
        confirmLabel="Delete Tenant"
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

