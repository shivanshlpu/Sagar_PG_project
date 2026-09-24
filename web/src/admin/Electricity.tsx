import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ResponsiveTable, type ResponsiveColumn } from '../components/common/ResponsiveTable';
import { Badge, getStatusBadgeVariant, Button, Modal, FormField, Input, Select } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { apiGet, apiPost, apiPatch, formatCurrency, formatMonth } from '../lib/api';
import { Zap, Plus, Calculator, Info, Pencil, FileText, Lock, AlertCircle } from 'lucide-react';

interface ElBill {
  id: string;
  month: string;
  tenant_id?: string;
  tenant?: { full_name: string };
  room?: { room_number: string };
  previous_reading: number;
  current_reading: number;
  units_consumed: number;
  rate_per_unit_paise: number;
  total_amount_paise: number;
  status: string;
  notes?: string | null;
}

const billSchema = z.object({
  tenant_id: z.string().min(1, 'Select a tenant'),
  room_id: z.string().min(1, 'Select a room'),
  month: z.string().min(1, 'Month is required'),
  previous_reading: z.coerce.number().min(0),
  current_reading: z.coerce.number().min(0),
  rate_per_unit: z.coerce.number().min(0, 'Rate per unit is required'),
});

type BillForm = z.infer<typeof billSchema>;

export default function AdminElectricity() {
  const [bills, setBills] = React.useState<ElBill[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [showModal, setShowModal] = React.useState(false);
  const [tenants, setTenants] = React.useState<Array<{ id: string; full_name: string; room_id: string }>>([]);
  const [rooms, setRooms] = React.useState<Array<{ id: string; room_number: string }>>([]);
  const [defaultRatePaise, setDefaultRatePaise] = React.useState(1200);
  const { showToast } = useToast();

  // Edit & View Details state
  const [editingBill, setEditingBill] = React.useState<ElBill | null>(null);
  const [viewingBill, setViewingBill] = React.useState<ElBill | null>(null);
  const [editMonth, setEditMonth] = React.useState('');
  const [editPrevReading, setEditPrevReading] = React.useState<number>(0);
  const [editCurrReading, setEditCurrReading] = React.useState<number>(0);
  const [editRateRupees, setEditRateRupees] = React.useState<number>(12);
  const [editNotes, setEditNotes] = React.useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = React.useState(false);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<BillForm>({
    resolver: zodResolver(billSchema) as any,
  });

  const watchedTenantId = watch('tenant_id');
  const watchedPrevReading = watch('previous_reading') || 0;
  const watchedCurrReading = watch('current_reading') || 0;
  const watchedRateRupees = watch('rate_per_unit') !== undefined ? Number(watch('rate_per_unit')) : (defaultRatePaise / 100);

  const unitsConsumed = Math.max(0, watchedCurrReading - watchedPrevReading);
  const calculatedCostPaise = Math.round(unitsConsumed * (watchedRateRupees * 100));

  React.useEffect(() => {
    loadBills();
    loadFilters();
  }, []);

  async function loadBills() {
    setIsLoading(true);
    const res = await apiGet<ElBill[]>('/electricity/bills');
    if (res.success && res.data) setBills(res.data);
    setIsLoading(false);
  }

  async function loadFilters() {
    const [t, r, s] = await Promise.all([
      apiGet<Array<{ id: string; full_name: string; room_id: string }>>('/tenants?status=active'),
      apiGet<Array<{ id: string; room_number: string }>>('/rooms'),
      apiGet<{ electricity_rate_per_unit_paise: number }>('/settings/billing'),
    ]);
    if (t.data) setTenants(t.data);
    if (r.data) setRooms(r.data);
    if (s.data?.electricity_rate_per_unit_paise) {
      setDefaultRatePaise(s.data.electricity_rate_per_unit_paise);
    }
  }

  // When tenant changes in modal, auto-assign room and fetch last reading
  async function handleTenantChange(tenantId: string) {
    setValue('tenant_id', tenantId);
    const selectedTenant = tenants.find((t) => t.id === tenantId);
    const roomId = selectedTenant?.room_id || '';
    setValue('room_id', roomId);

    if (tenantId) {
      const res = await apiGet<{ previous_reading: number }>(`/electricity/latest-reading?tenant_id=${tenantId}&room_id=${roomId}`);
      if (res.success && res.data) {
        setValue('previous_reading', res.data.previous_reading || 0);
      }
    }
  }

  function openCreateModal() {
    reset({
      tenant_id: '',
      room_id: '',
      month: new Date().toISOString().slice(0, 7),
      previous_reading: 0,
      current_reading: 0,
      rate_per_unit: defaultRatePaise / 100,
    });
    setShowModal(true);
  }

  function openEditModal(bill: ElBill) {
    if (bill.status === 'paid') {
      showToast('Completed financial records are locked. A paid electricity bill cannot be modified.', 'error');
      return;
    }
    setEditingBill(bill);
    setEditMonth(bill.month);
    setEditPrevReading(bill.previous_reading);
    setEditCurrReading(bill.current_reading);
    setEditRateRupees(bill.rate_per_unit_paise ? bill.rate_per_unit_paise / 100 : defaultRatePaise / 100);
    setEditNotes(bill.notes || '');
  }

  async function handleSaveEdit() {
    if (!editingBill) return;
    if (editCurrReading < editPrevReading) {
      showToast('Current reading must be greater than or equal to previous reading', 'error');
      return;
    }
    setIsSavingEdit(true);
    const units = Math.max(0, editCurrReading - editPrevReading);
    const totalAmountPaise = Math.round(units * editRateRupees * 100);

    const res = await apiPatch(`/electricity/bills/${editingBill.id}`, {
      month: editMonth,
      previous_reading: editPrevReading,
      current_reading: editCurrReading,
      rate_per_unit_paise: Math.round(editRateRupees * 100),
      total_amount_paise: totalAmountPaise,
      notes: editNotes.trim() || null,
    });

    if (res.success) {
      showToast('Electricity bill updated & rent dues recalculated successfully');
      setEditingBill(null);
      loadBills();
    } else {
      showToast(res.error || 'Failed to update electricity bill', 'error');
    }
    setIsSavingEdit(false);
  }

  async function onSubmit(data: BillForm) {
    const payload = {
      tenant_id: data.tenant_id,
      room_id: data.room_id,
      month: data.month,
      previous_reading: data.previous_reading,
      current_reading: data.current_reading,
      rate_per_unit_paise: Math.round(Number(data.rate_per_unit) * 100),
    };
    const res = await apiPost('/electricity/bills', payload);
    if (res.success) {
      showToast('Electricity bill recorded & synchronized with rent record');
      setShowModal(false);
      loadBills();
    } else {
      showToast(res.error || 'Failed to record bill', 'error');
    }
  }

  const columns: ResponsiveColumn<ElBill>[] = [
    { key: 'month', header: 'Month', render: (r: ElBill) => formatMonth(r.month), sortable: true },
    { key: 'tenant', header: 'Tenant', render: (r: ElBill) => r.tenant?.full_name || '-' },
    { key: 'room', header: 'Room', render: (r: ElBill) => r.room?.room_number || '-' },
    { key: 'previous_reading', header: 'Prev Reading' },
    { key: 'current_reading', header: 'Curr Reading' },
    { key: 'units_consumed', header: 'Units', render: (r: ElBill) => <span style={{ fontWeight: 600 }}>{r.units_consumed}</span>, sortable: true },
    { key: 'rate', header: 'Rate (₹/u)', render: (r: ElBill) => `₹${(r.rate_per_unit_paise / 100).toFixed(2)}` },
    { key: 'total_amount_paise', header: 'Amount', render: (r: ElBill) => <span className="tabular-nums" style={{ fontWeight: 600 }}>{formatCurrency(r.total_amount_paise)}</span>, sortable: true },
    { key: 'status', header: 'Status', render: (r: ElBill) => <Badge variant={getStatusBadgeVariant(r.status)}>{r.status}</Badge> },
    {
      key: 'actions',
      header: 'Actions',
      render: (r: ElBill) => (
        <div style={{ display: 'flex', gap: '6px' }}>
          {r.status === 'paid' ? (
            <Button size="sm" variant="secondary" onClick={() => setViewingBill(r)}>
              <FileText size={14} /> View Details
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => openEditModal(r)}>
              <Pencil size={14} /> Edit Bill
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: '4px' }}>Electricity Billing</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Record meter readings. Costs are auto-calculated at ₹{(defaultRatePaise / 100).toFixed(2)}/unit and reflected directly on tenant bills.
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus size={16} /> Record Reading
        </Button>
      </div>

      <ResponsiveTable<ElBill>
        columns={columns}
        data={bills}
        isLoading={isLoading}
        renderCard={(bill: ElBill) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Upfront Header: Tenant, Room, Month, Status */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-base)', color: 'var(--color-text-primary)' }}>
                    {bill.tenant?.full_name || 'Tenant'}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                    {bill.room?.room_number ? `Room ${bill.room.room_number}` : 'No room assigned'} • {formatMonth(bill.month)}
                  </div>
                </div>
                <Badge variant={getStatusBadgeVariant(bill.status)}>{bill.status}</Badge>
              </div>

              {/* Upfront Important Metrics: Units & Amount */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                backgroundColor: 'var(--color-bg-surface-alt)',
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
              }}>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Units Consumed</span>
                  <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    {bill.units_consumed} <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--color-text-muted)' }}>units</span>
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Cost</span>
                  <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-primary)' }} className="tabular-nums">
                    {formatCurrency(bill.total_amount_paise)}
                  </span>
                </div>
              </div>

              {/* Meter Readings & Rate Compact Strip (Eliminating line-type vertical reading) */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '6px',
                padding: '8px 10px',
                backgroundColor: 'var(--color-bg-base)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                textAlign: 'center',
                fontSize: 'var(--font-size-xs)',
              }}>
                <div>
                  <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', display: 'block' }}>Prev Reading</span>
                  <strong style={{ color: 'var(--color-text-primary)' }}>{bill.previous_reading}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', display: 'block' }}>Curr Reading</span>
                  <strong style={{ color: 'var(--color-text-primary)' }}>{bill.current_reading}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', display: 'block' }}>Rate / Unit</span>
                  <strong style={{ color: 'var(--color-text-primary)' }}>₹{(bill.rate_per_unit_paise / 100).toFixed(2)}</strong>
                </div>
              </div>

              {/* Bottom Actions: Edit Bill (if pending) / View Details (if paid) */}
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: '8px',
                marginTop: '6px',
                paddingTop: '10px',
                borderTop: '1px solid var(--color-border)',
              }}>
                {bill.status === 'paid' ? (
                  <Button size="sm" variant="secondary" onClick={() => setViewingBill(bill)}>
                    <Lock size={13} style={{ color: 'var(--color-success)' }} /> View Details
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => openEditModal(bill)}>
                    <Pencil size={13} /> Edit Bill
                  </Button>
                )}
              </div>
            </div>
        )}
        emptyState={
          <div style={{ textAlign: 'center', padding: '48px' }}>
            <Zap size={48} style={{ color: 'var(--color-text-muted)', marginBottom: '12px' }} />
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }}>No electricity bills found</p>
            <Button onClick={openCreateModal}><Plus size={16} /> Record First Reading</Button>
          </div>
        }
      />

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Record Meter Reading"
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSubmit(onSubmit)}>Save Bill & Sync Rent</Button>
          </div>
        }
      >
        <FormField label="Tenant" error={errors.tenant_id?.message} required>
          <Select
            options={tenants.map(t => ({ value: t.id, label: t.full_name }))}
            placeholder="Select tenant"
            error={!!errors.tenant_id}
            value={watchedTenantId || ''}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleTenantChange(e.target.value)}
          />
        </FormField>

        <FormField label="Room" error={errors.room_id?.message} required>
          <Select
            options={rooms.map(r => ({ value: r.id, label: `Room ${r.room_number}` }))}
            placeholder="Select room"
            error={!!errors.room_id}
            {...register('room_id')}
          />
        </FormField>

        <FormField label="Billing Month" error={errors.month?.message} required>
          <Input type="month" error={!!errors.month} {...register('month')} />
        </FormField>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <FormField label="Previous Reading" error={errors.previous_reading?.message} required hint="Auto-fetched from last bill">
            <Input type="number" step="1" error={!!errors.previous_reading} {...register('previous_reading')} />
          </FormField>

          <FormField label="Current Reading" error={errors.current_reading?.message} required hint="Latest meter number">
            <Input type="number" step="1" error={!!errors.current_reading} {...register('current_reading')} />
          </FormField>
        </div>

        <FormField
          label="Rate per Unit (₹)"
          error={errors.rate_per_unit?.message}
          required
          hint={`Pre-configured default: ₹${(defaultRatePaise / 100).toFixed(2)}/unit`}
        >
          <Input
            type="number"
            step="0.5"
            error={!!errors.rate_per_unit}
            {...register('rate_per_unit')}
            placeholder="e.g. 12"
          />
        </FormField>

        {/* Live Calculation Preview Card */}
        <div style={{
          marginTop: '16px',
          padding: '14px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--color-bg-surface-alt)',
          border: '1px solid var(--color-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Calculator size={16} style={{ color: 'var(--color-primary)' }} />
            <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>Auto-Calculation Preview</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: 'var(--font-size-xs)' }}>
            <div>
              <span style={{ color: 'var(--color-text-secondary)' }}>Units Consumed: </span>
              <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>{unitsConsumed} units</strong>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-secondary)' }}>Calculated Cost: </span>
              <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-primary)' }}>{formatCurrency(calculatedCostPaise)}</strong>
            </div>
          </div>

          <div style={{ marginTop: '10px', display: 'flex', gap: '6px', alignItems: 'flex-start', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
            <Info size={13} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--color-text-muted)' }} />
            <span>This electricity bill will immediately add ₹{(calculatedCostPaise / 100).toFixed(2)} to the tenant's monthly dues breakdown alongside their room rent and fixed maintenance.</span>
          </div>
        </div>
      </Modal>

      {/* Edit Bill Modal (Allowed for Pending bills) */}
      <Modal
        isOpen={!!editingBill}
        onClose={() => setEditingBill(null)}
        title={`Edit Electricity Bill — ${editingBill?.tenant?.full_name || 'Resident'}`}
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setEditingBill(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={isSavingEdit}>
              {isSavingEdit ? 'Saving Changes...' : 'Save & Recalculate'}
            </Button>
          </div>
        }
      >
        {editingBill && (
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              backgroundColor: 'var(--color-bg-surface-alt)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '16px',
            }}>
              <div>
                <strong style={{ display: 'block', fontSize: 'var(--font-size-sm)' }}>
                  {editingBill.tenant?.full_name || 'Resident'}
                </strong>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                  {editingBill.room?.room_number ? `Room ${editingBill.room.room_number}` : 'No room'}
                </span>
              </div>
              <Badge variant={getStatusBadgeVariant(editingBill.status)}>{editingBill.status}</Badge>
            </div>

            <FormField label="Billing Month" required>
              <Input
                type="month"
                value={editMonth}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditMonth(e.target.value)}
              />
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <FormField label="Previous Reading" required>
                <Input
                  type="number"
                  step="1"
                  value={editPrevReading}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditPrevReading(Number(e.target.value))}
                />
              </FormField>

              <FormField label="Current Reading" required>
                <Input
                  type="number"
                  step="1"
                  value={editCurrReading}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditCurrReading(Number(e.target.value))}
                />
              </FormField>
            </div>

            <FormField label="Rate per Unit (₹)" required>
              <Input
                type="number"
                step="0.5"
                value={editRateRupees}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditRateRupees(Number(e.target.value))}
              />
            </FormField>

            <FormField label="Notes / Remarks (Optional)">
              <Input
                type="text"
                placeholder="e.g. Corrected meter reading error"
                value={editNotes}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditNotes(e.target.value)}
              />
            </FormField>

            {/* Live Recalculation Preview */}
            <div style={{
              marginTop: '16px',
              padding: '14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg-surface-alt)',
              border: '1px solid var(--color-border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Calculator size={16} style={{ color: 'var(--color-primary)' }} />
                <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>Live Recalculation</span>
              </div>

              {editCurrReading < editPrevReading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-error)', fontSize: 'var(--font-size-xs)' }}>
                  <AlertCircle size={14} />
                  <span>Current reading ({editCurrReading}) cannot be less than previous reading ({editPrevReading})</span>
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: 'var(--font-size-xs)' }}>
                    <div>
                      <span style={{ color: 'var(--color-text-secondary)' }}>Units Consumed: </span>
                      <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
                        {Math.max(0, editCurrReading - editPrevReading)} units
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--color-text-secondary)' }}>New Total Cost: </span>
                      <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-primary)' }}>
                        {formatCurrency(Math.round(Math.max(0, editCurrReading - editPrevReading) * editRateRupees * 100))}
                      </strong>
                    </div>
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                    Formula: ({editCurrReading} - {editPrevReading}) × ₹{editRateRupees.toFixed(2)}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* View Details Modal (Read-only for Paid bills to preserve audit trail) */}
      <Modal
        isOpen={!!viewingBill}
        onClose={() => setViewingBill(null)}
        title="Electricity Bill Details"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setViewingBill(null)}>Close</Button>
          </div>
        }
      >
        {viewingBill && (
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 14px',
              backgroundColor: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '16px',
            }}>
              <Lock size={18} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-primary)' }}>
                <strong>Completed Financial Record</strong>
                <p style={{ margin: '2px 0 0', color: 'var(--color-text-secondary)' }}>
                  This bill is marked as <strong>Paid</strong>. Normal editing is permanently disabled to preserve financial audit trail.
                </p>
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              fontSize: 'var(--font-size-sm)',
              marginBottom: '16px',
            }}>
              <div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Resident</span>
                <p style={{ margin: '2px 0 0', fontWeight: 600 }}>{viewingBill.tenant?.full_name || 'Resident'}</p>
              </div>
              <div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Room</span>
                <p style={{ margin: '2px 0 0', fontWeight: 600 }}>{viewingBill.room?.room_number ? `Room ${viewingBill.room.room_number}` : 'Unassigned'}</p>
              </div>
              <div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Billing Month</span>
                <p style={{ margin: '2px 0 0', fontWeight: 600 }}>{formatMonth(viewingBill.month)}</p>
              </div>
              <div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Status</span>
                <div style={{ marginTop: '2px' }}><Badge variant="success">Paid</Badge></div>
              </div>
            </div>

            <div style={{
              padding: '14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg-surface-alt)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontSize: 'var(--font-size-xs)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Previous Meter Reading:</span>
                <strong>{viewingBill.previous_reading}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Current Meter Reading:</span>
                <strong>{viewingBill.current_reading}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Units Consumed:</span>
                <strong style={{ color: 'var(--color-text-primary)' }}>{viewingBill.units_consumed} units</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Rate per Unit:</span>
                <strong>₹{(viewingBill.rate_per_unit_paise / 100).toFixed(2)} / unit</strong>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                borderTop: '1px dashed var(--color-border)',
                paddingTop: '8px',
                marginTop: '4px',
                fontSize: 'var(--font-size-sm)',
              }}>
                <span style={{ fontWeight: 600 }}>Total Paid Amount:</span>
                <strong style={{ color: 'var(--color-primary)' }} className="tabular-nums">
                  {formatCurrency(viewingBill.total_amount_paise)}
                </strong>
              </div>
            </div>

            {viewingBill.notes && (
              <div style={{ marginTop: '12px', fontSize: 'var(--font-size-xs)' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Notes: </span>
                <span>{viewingBill.notes}</span>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

