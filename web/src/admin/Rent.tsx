import React from 'react';
import { ResponsiveTable, type ResponsiveColumn } from '../components/common/ResponsiveTable';
import { Badge, getStatusBadgeVariant, Button, Modal, FormField, Input, Select } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../hooks/useAuth';
import { apiGet, apiPost, apiPatch, formatCurrency, formatMonth } from '../lib/api';
import { formatDate } from '../lib/date';
import { Banknote, Plus, Printer, FileText } from 'lucide-react';

interface RentRecord {
  id: string;
  month: string;
  rent_amount_paise: number;
  late_fee_paise: number;
  total_due_paise: number;
  status: string;
  due_date: string;
  tenant?: { full_name: string; phone: string };
  room?: { room_number: string };
}

export default function AdminRent() {
  const { pg, pgName } = useAuth();
  const [records, setRecords] = React.useState<RentRecord[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [showGenerate, setShowGenerate] = React.useState(false);
  const [month, setMonth] = React.useState(new Date().toISOString().slice(0, 7));
  const [monthFilter, setMonthFilter] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [selectedBill, setSelectedBill] = React.useState<RentRecord | null>(null);
  const { showToast } = useToast();

  React.useEffect(() => { loadRecords(); }, [monthFilter, statusFilter]);

  async function loadRecords() {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (monthFilter) params.set('month', monthFilter);
    if (statusFilter) params.set('status', statusFilter);
    const res = await apiGet<RentRecord[]>(`/rent?${params}`);
    if (res.success && res.data) {
      const d = res.data;
      setRecords(Array.isArray(d) ? d : (d as any)?.data || []);
    }
    setIsLoading(false);
  }

  async function generateRecords() {
    const res = await apiPost('/rent/generate', { month });
    if (res.success) {
      showToast(`Rent records generated for ${month}`);
      setShowGenerate(false);
      loadRecords();
    } else {
      showToast(res.error || 'Failed to generate', 'error');
    }
  }

  async function updateStatus(id: string, status: string) {
    const res = await apiPatch(`/rent/${id}/status`, { status });
    if (res.success) { showToast('Status updated'); loadRecords(); }
    else showToast(res.error || 'Update failed', 'error');
  }

  const columns: ResponsiveColumn<RentRecord>[] = [
    { key: 'month', header: 'Month', render: (r: RentRecord) => formatMonth(r.month), sortable: true },
    { key: 'tenant', header: 'Tenant', render: (r: RentRecord) => (
      <div>
        <div style={{ fontWeight: 500 }}>{r.tenant?.full_name || '-'}</div>
        {r.tenant?.phone && <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>{r.tenant.phone}</div>}
      </div>
    )},
    { key: 'room', header: 'Room', render: (r: RentRecord) => r.room?.room_number ? `Room ${r.room.room_number}` : '-' },
    { key: 'rent_amount_paise', header: 'Rent', render: (r: RentRecord) => <span className="tabular-nums">{formatCurrency(r.rent_amount_paise)}</span> },
    { key: 'late_fee_paise', header: 'Late Fee', render: (r: RentRecord) => r.late_fee_paise > 0 ? <span className="tabular-nums">{formatCurrency(r.late_fee_paise)}</span> : '-' },
    { key: 'total_due_paise', header: 'Total Due', render: (r: RentRecord) => <span className="tabular-nums" style={{ fontWeight: 600 }}>{formatCurrency(r.total_due_paise)}</span>, sortable: true },
    { key: 'due_date', header: 'Due Date', render: (r: RentRecord) => formatDate(r.due_date) },
    { key: 'status', header: 'Status', render: (r: RentRecord) => <Badge variant={getStatusBadgeVariant(r.status)}>{r.status}</Badge> },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: '4px' }}>Rent Records</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Track monthly rents, itemized dues, and generate invoices
          </p>
        </div>
        <Button onClick={() => setShowGenerate(true)}><Plus size={16} /> Generate Rent</Button>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <Input type="month" value={monthFilter} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMonthFilter(e.target.value)} style={{ maxWidth: '200px' }} />
        <Select options={[
          { value: '', label: 'All Statuses' },
          { value: 'pending', label: 'Pending' },
          { value: 'paid', label: 'Paid' },
          { value: 'overdue', label: 'Overdue' },
          { value: 'waived', label: 'Waived' },
        ]} value={statusFilter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value)} style={{ maxWidth: '180px' }} />
      </div>

      <ResponsiveTable<RentRecord>
        columns={columns}
        data={records}
        isLoading={isLoading}
        renderCard={(record: RentRecord) => (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 600 }}>{record.tenant?.full_name || 'Tenant'}</h4>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                  {record.room?.room_number ? `Room ${record.room.room_number}` : ''} • {formatMonth(record.month)}
                </span>
              </div>
              <Badge variant={getStatusBadgeVariant(record.status)}>{record.status}</Badge>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', margin: '12px 0', fontSize: 'var(--font-size-sm)' }}>
              <div>
                <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: 'var(--font-size-xs)' }}>Rent + Late Fee</span>
                <span className="tabular-nums">{formatCurrency(record.rent_amount_paise)} {record.late_fee_paise > 0 ? `+ ${formatCurrency(record.late_fee_paise)}` : ''}</span>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: 'var(--font-size-xs)' }}>Total Due</span>
                <span className="tabular-nums" style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{formatCurrency(record.total_due_paise)}</span>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: 'var(--font-size-xs)' }}>Due Date</span>
                <span>{formatDate(record.due_date)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--color-border)', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
              <Button size="sm" variant="secondary" onClick={() => setSelectedBill(record)}>
                <FileText size={14} /> View Bill
              </Button>
              {record.status !== 'paid' && (
                <Select
                  options={[
                    { value: '', label: 'Status...' },
                    { value: 'paid', label: 'Mark Paid' },
                    { value: 'overdue', label: 'Mark Overdue' },
                    { value: 'waived', label: 'Waive' },
                  ]}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { if (e.target.value) updateStatus(record.id, e.target.value); }}
                  style={{ fontSize: 'var(--font-size-xs)', padding: '4px 8px', maxWidth: '120px' }}
                />
              )}
            </div>
          </div>
        )}
        actions={(row: RentRecord) => (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setSelectedBill(row)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--font-size-xs)', padding: '4px 8px', borderRadius: 'var(--radius-sm)' }}
              title="View & Print Bill"
            >
              <FileText size={15} /> Bill
            </button>
            {row.status !== 'paid' ? (
              <Select
                options={[
                  { value: '', label: 'Change...' },
                  { value: 'paid', label: 'Mark Paid' },
                  { value: 'overdue', label: 'Mark Overdue' },
                  { value: 'waived', label: 'Waive' },
                ]}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { if (e.target.value) updateStatus(row.id, e.target.value); }}
                style={{ fontSize: 'var(--font-size-xs)', padding: '4px 8px', maxWidth: '120px' }}
              />
            ) : null}
          </div>
        )}
        emptyState={
          <div style={{ textAlign: 'center', padding: '48px' }}>
            <Banknote size={48} style={{ color: 'var(--color-text-muted)', marginBottom: '12px' }} />
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }}>No rent records found</p>
            <Button onClick={() => setShowGenerate(true)}><Plus size={16} /> Generate Rent Records</Button>
          </div>
        }
      />

      {/* Generate Rent Modal */}
      <Modal isOpen={showGenerate} onClose={() => setShowGenerate(false)} title="Generate Rent Records" size="sm" footer={
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={() => setShowGenerate(false)}>Cancel</Button>
          <Button onClick={generateRecords}>Generate</Button>
        </div>
      }>
        <FormField label="Month" required hint="Generates rent records for all active tenants with room assignments">
          <Input type="month" value={month} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMonth(e.target.value)} />
        </FormField>
      </Modal>

      {/* Itemized Bill / Invoice Modal */}
      {selectedBill && (
        <Modal
          isOpen={!!selectedBill}
          onClose={() => setSelectedBill(null)}
          title="Rent Invoice & Bill"
          size="md"
          footer={
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', width: '100%' }}>
              <Button variant="secondary" onClick={() => setSelectedBill(null)}>Close</Button>
              <Button onClick={() => window.print()}>
                <Printer size={16} /> Print Invoice
              </Button>
            </div>
          }
        >
          <div id="printable-rent-bill" style={{ padding: '8px 4px' }}>
            {/* Header / PG details */}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid var(--color-border)', paddingBottom: '16px', marginBottom: '16px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-primary)' }}>
                  {pg?.name || pgName || 'PG Management'}
                </h2>
                {pg?.address && <p style={{ margin: '4px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>{pg.address}</p>}
                {pg?.phone && <p style={{ margin: '2px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Phone: {pg.phone}</p>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', fontWeight: 600 }}>INVOICE</span>
                <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, fontFamily: 'monospace', marginTop: '2px' }}>
                  INV-{selectedBill.month.replace('-', '')}-{selectedBill.id.slice(0, 6).toUpperCase()}
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                  Date: {formatDate(new Date().toISOString())}
                </div>
              </div>
            </div>

            {/* Bill To & Details */}
            <div className="form-grid-2" style={{ marginBottom: '20px', backgroundColor: 'var(--color-bg-surface-alt)', padding: '12px 16px', borderRadius: 'var(--radius-md)' }}>
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>Billed To</div>
                <div style={{ fontWeight: 600, fontSize: 'var(--font-size-base)' }}>{selectedBill.tenant?.full_name || 'Resident'}</div>
                {selectedBill.tenant?.phone && <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Contact: {selectedBill.tenant.phone}</div>}
                {selectedBill.room?.room_number && <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Room: {selectedBill.room.room_number}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>Billing Period</div>
                <div style={{ fontWeight: 600, fontSize: 'var(--font-size-base)' }}>{formatMonth(selectedBill.month)}</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Due Date: <strong>{formatDate(selectedBill.due_date)}</strong></div>
                <div style={{ marginTop: '6px' }}>
                  <Badge variant={getStatusBadgeVariant(selectedBill.status)}>{selectedBill.status.toUpperCase()}</Badge>
                </div>
              </div>
            </div>

            {/* Itemized Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-surface-alt)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>Item Description</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '12px' }}>
                    <div style={{ fontWeight: 500 }}>Monthly Room Rent</div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Period: {formatMonth(selectedBill.month)}</div>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                    {formatCurrency(selectedBill.rent_amount_paise)}
                  </td>
                </tr>
                {selectedBill.late_fee_paise > 0 && (
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--color-danger)' }}>Late Payment Fee</div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Applied for overdue payment</div>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500, color: 'var(--color-danger)' }}>
                      {formatCurrency(selectedBill.late_fee_paise)}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ padding: '12px', fontWeight: 700, fontSize: 'var(--font-size-base)' }}>Total Amount Due</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--font-size-lg)', color: 'var(--color-primary)' }}>
                    {formatCurrency(selectedBill.total_due_paise)}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Note */}
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', textAlign: 'center', borderTop: '1px dashed var(--color-border)', paddingTop: '12px' }}>
              This is a computer-generated invoice from {pg?.name || pgName || 'PG Management'}. All dates are in DD/MM/YYYY format.
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
