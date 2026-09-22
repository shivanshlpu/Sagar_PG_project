import React from 'react';
import { ResponsiveTable, type ResponsiveColumn } from '../components/common/ResponsiveTable';
import { Badge, getStatusBadgeVariant, Button, Modal, Select, FormField, Input } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../hooks/useAuth';
import { apiGet, apiPatch, apiPost, formatCurrency, extractReferenceId } from '../lib/api';
import { formatDate } from '../lib/date';
import { printElement } from '../lib/printHelper';
import { CreditCard, Check, X, Printer, Receipt, Send, Plus } from 'lucide-react';

interface Payment {
  id: string;
  tenant?: { full_name: string; email: string; phone?: string };
  amount_paise: number;
  payment_method: string;
  status: string;
  created_at: string;
  notes: string | null;
  rejection_reason?: string | null;
}

export default function AdminPayments() {
  const { pg, pgName } = useAuth();
  const [payments, setPayments] = React.useState<Payment[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState('');
  const [selectedReceipt, setSelectedReceipt] = React.useState<Payment | null>(null);
  const [isSendingWa, setIsSendingWa] = React.useState(false);

  // Manual payment recording modal state
  const [showRecordModal, setShowRecordModal] = React.useState(false);
  const [tenantsList, setTenantsList] = React.useState<Array<{ id: string; full_name: string; phone?: string; room?: { room_number: string } }>>([]);
  const [selectedTenantId, setSelectedTenantId] = React.useState('');
  const [recordAmount, setRecordAmount] = React.useState('');
  const [recordMethod, setRecordMethod] = React.useState<'UPI' | 'CASH' | 'BANK_TRANSFER'>('CASH');
  const [recordUtr, setRecordUtr] = React.useState('');
  const [recordNotes, setRecordNotes] = React.useState('');
  const [pendingDuesInfo, setPendingDuesInfo] = React.useState<string | null>(null);
  const [activeRentRecordId, setActiveRentRecordId] = React.useState<string | null>(null);
  const [isRecording, setIsRecording] = React.useState(false);

  const { showToast } = useToast();

  React.useEffect(() => { loadPayments(); }, [statusFilter]);

  async function loadPayments() {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    const res = await apiGet<{ data: Payment[] }>(`/payments?${params}`);
    const d = res.data;
    setPayments(Array.isArray(d) ? d : (d as unknown as { data: Payment[] })?.data || []);
    setIsLoading(false);
  }

  async function openRecordModal() {
    setShowRecordModal(true);
    setSelectedTenantId('');
    setRecordAmount('');
    setRecordUtr('');
    setRecordNotes('');
    setPendingDuesInfo(null);
    setActiveRentRecordId(null);

    // Fetch active tenants
    const res = await apiGet<any[]>('/tenants?status=active');
    if (res.success && res.data) {
      setTenantsList(Array.isArray(res.data) ? res.data : (res.data as any)?.data || []);
    }
  }

  async function handleTenantSelect(tenantId: string) {
    setSelectedTenantId(tenantId);
    if (!tenantId) {
      setPendingDuesInfo(null);
      setRecordAmount('');
      setActiveRentRecordId(null);
      return;
    }

    try {
      const res = await apiGet<any>(`/tenants/${tenantId}/billing-summary`);
      if (res.success && res.data) {
        const cur = res.data.currentDue;
        if (cur && cur.total_due_paise > 0) {
          setRecordAmount((cur.total_due_paise / 100).toString());
          setActiveRentRecordId(cur.rent_record_id || null);
          setPendingDuesInfo(`Active due: ${formatCurrency(cur.total_due_paise)} (${cur.status.toUpperCase()} for ${cur.month})`);
        } else {
          setRecordAmount('');
          setActiveRentRecordId(null);
          setPendingDuesInfo('No pending dues found for this tenant.');
        }
      }
    } catch {
      // ignore
    }
  }

  async function submitRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTenantId) {
      showToast('Please select a resident', 'error');
      return;
    }
    const numAmt = Number(recordAmount);
    if (isNaN(numAmt) || numAmt <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    setIsRecording(true);
    const res = await apiPost('/payments/record', {
      tenant_id: selectedTenantId,
      rent_record_id: activeRentRecordId,
      amount_paise: Math.round(numAmt * 100),
      payment_method: recordMethod,
      utr_id: recordUtr.trim() || undefined,
      notes: recordNotes.trim() || undefined,
    });

    if (res.success) {
      showToast('Payment recorded, verified, and rent marked as paid!');
      setShowRecordModal(false);
      loadPayments();
    } else {
      showToast(res.error || 'Failed to record payment', 'error');
    }
    setIsRecording(false);
  }

  async function verify(id: string, status: 'verified' | 'rejected') {
    const reason = status === 'rejected' ? prompt('Rejection reason:') : null;
    if (status === 'rejected' && reason === null) return; // User cancelled
    const res = await apiPatch(`/payments/${id}/verify`, { status, rejection_reason: reason });
    if (res.success) {
      showToast(status === 'verified' ? 'Payment verified & WhatsApp receipt sent!' : 'Payment rejected');
      loadPayments();
    } else {
      showToast(res.error || 'Failed', 'error');
    }
  }

  async function sendWhatsAppReceipt(paymentId: string) {
    try {
      setIsSendingWa(true);
      const res = await apiPost(`/payments/${paymentId}/send-receipt`, {});
      if (res.success) {
        showToast('Receipt sent to tenant WhatsApp successfully!');
      } else {
        showToast(res.error || 'Failed to dispatch WhatsApp receipt', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to send receipt', 'error');
    } finally {
      setIsSendingWa(false);
    }
  }

  const columns: ResponsiveColumn<Payment>[] = [
    { key: 'created_at', header: 'Date', render: (r: Payment) => formatDate(r.created_at), sortable: true },
    { key: 'tenant', header: 'Tenant', render: (r: Payment) => (
      <div>
        <div style={{ fontWeight: 500 }}>{r.tenant?.full_name || '-'}</div>
        {r.tenant?.email && <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>{r.tenant.email}</div>}
      </div>
    )},
    { key: 'amount_paise', header: 'Amount', render: (r: Payment) => <span className="tabular-nums" style={{ fontWeight: 600 }}>{formatCurrency(r.amount_paise)}</span>, sortable: true },
    { key: 'payment_method', header: 'Method', render: (r: Payment) => <span style={{ textTransform: 'uppercase', fontSize: 'var(--font-size-xs)', fontWeight: 500 }}>{r.payment_method}</span> },
    { key: 'notes', header: 'UTR / Ref ID', render: (r: Payment) => {
      const { refId, extraNotes } = extractReferenceId(r.notes);
      return (
        <div>
          {refId ? (
            <code style={{
              fontSize: 'var(--font-size-xs)',
              fontWeight: 700,
              padding: '2px 8px',
              backgroundColor: 'var(--color-bg-surface-alt)',
              borderRadius: '4px',
              border: '1px solid var(--color-border)',
              color: 'var(--color-primary)',
              display: 'inline-block',
            }}>
              {refId}
            </code>
          ) : null}
          {extraNotes ? (
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: refId ? '2px' : 0 }}>
              {extraNotes}
            </div>
          ) : !refId ? (
            <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>-</span>
          ) : null}
        </div>
      );
    }},
    { key: 'status', header: 'Status', render: (r: Payment) => <Badge variant={getStatusBadgeVariant(r.status)}>{r.status}</Badge> },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: '4px' }}>Payments</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Immutable ledger of resident payments and receipts
          </p>
        </div>
        <Button onClick={openRecordModal}><Plus size={16} /> Record Payment</Button>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <Select
          options={[
            { value: '', label: 'All Statuses' },
            { value: 'submitted', label: 'Submitted (Needs Verification)' },
            { value: 'verified', label: 'Verified' },
            { value: 'rejected', label: 'Rejected' },
          ]}
          value={statusFilter}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value)}
          style={{ maxWidth: '240px' }}
        />
      </div>

      <ResponsiveTable<Payment>
        columns={columns}
        data={payments}
        isLoading={isLoading}
        renderCard={(payment: Payment) => (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 600 }}>{payment.tenant?.full_name || 'Tenant'}</h4>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                  {formatDate(payment.created_at)} • <span style={{ textTransform: 'uppercase' }}>{payment.payment_method}</span>
                </span>
              </div>
              <Badge variant={getStatusBadgeVariant(payment.status)}>{payment.status}</Badge>
            </div>

            <div style={{ margin: '12px 0' }}>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', display: 'block' }}>Amount Paid</span>
              <span className="tabular-nums" style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-primary)' }}>
                {formatCurrency(payment.amount_paise)}
              </span>
              {payment.notes && (
                <div style={{ margin: '8px 0', padding: '8px 12px', backgroundColor: 'var(--color-bg-surface-alt)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', fontWeight: 600 }}>
                    Payment Reference / UTR
                  </span>
                  {(() => {
                    const { refId, extraNotes } = extractReferenceId(payment.notes);
                    return (
                      <div>
                        {refId && (
                          <code style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary)', display: 'block' }}>
                            {refId}
                          </code>
                        )}
                        {extraNotes && (
                          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: refId ? '2px' : 0 }}>
                            {extraNotes}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
              {payment.rejection_reason && (
                <p style={{ margin: '6px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)' }}>
                  Rejection Reason: {payment.rejection_reason}
                </p>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--color-border)', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
              <Button size="sm" variant="secondary" onClick={() => setSelectedReceipt(payment)}>
                <Receipt size={14} /> Receipt
              </Button>
              <Button size="sm" variant="secondary" onClick={() => sendWhatsAppReceipt(payment.id)} isLoading={isSendingWa} title="Send on WhatsApp">
                <Send size={14} /> Send WhatsApp
              </Button>
              {payment.status === 'submitted' && (
                <>
                  <Button size="sm" variant="primary" onClick={() => verify(payment.id, 'verified')}>
                    <Check size={14} /> Verify & Mark Paid
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => verify(payment.id, 'rejected')}>
                    <X size={14} /> Reject
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
        actions={(row: Payment) => (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              onClick={() => setSelectedReceipt(row)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--font-size-xs)', padding: '4px 8px', borderRadius: 'var(--radius-sm)' }}
              title="View & Print Receipt"
            >
              <Receipt size={15} /> Receipt
            </button>
            <button
              onClick={() => sendWhatsAppReceipt(row.id)}
              style={{ ...iconBtnStyle, color: 'var(--color-primary)' }}
              title="Send Receipt on WhatsApp"
              disabled={isSendingWa}
            >
              <Send size={15} />
            </button>
            {row.status === 'submitted' && (
              <>
                <button
                  onClick={() => verify(row.id, 'verified')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    backgroundColor: 'var(--color-success)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    padding: '4px 8px',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  title="Verify payment and mark rent as paid"
                >
                  <Check size={14} /> Mark Paid
                </button>
                <button onClick={() => verify(row.id, 'rejected')} style={{ ...iconBtnStyle, color: 'var(--color-danger)' }} title="Reject Payment">
                  <X size={16} />
                </button>
              </>
            )}
          </div>
        )}
        emptyState={
          <div style={{ textAlign: 'center', padding: '48px' }}>
            <CreditCard size={48} style={{ color: 'var(--color-text-muted)', marginBottom: '12px' }} />
            <p style={{ color: 'var(--color-text-secondary)' }}>No payments found</p>
          </div>
        }
      />

      {/* Printable Receipt Modal */}
      {selectedReceipt && (
        <Modal
          isOpen={!!selectedReceipt}
          onClose={() => setSelectedReceipt(null)}
          title="Payment Receipt"
          size="md"
          footer={
            <div className="modal-footer-responsive" style={{ width: '100%', display: 'flex', gap: '8px', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <Button variant="secondary" onClick={() => setSelectedReceipt(null)}>Close</Button>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Button
                  variant="secondary"
                  onClick={() => sendWhatsAppReceipt(selectedReceipt.id)}
                  isLoading={isSendingWa}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Send size={15} /> Send on WhatsApp
                </Button>
                <Button onClick={() => printElement('printable-payment-receipt', `Receipt-REC-${selectedReceipt.id.slice(0, 8).toUpperCase()}`)}>
                  <Printer size={16} /> Print Receipt
                </Button>
              </div>
            </div>
          }
        >
          <div id="printable-payment-receipt" style={{ padding: '8px 4px' }}>
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
                <span style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', fontWeight: 600 }}>RECEIPT</span>
                <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, fontFamily: 'monospace', marginTop: '2px' }}>
                  REC-{selectedReceipt.id.slice(0, 8).toUpperCase()}
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                  Date: {formatDate(selectedReceipt.created_at)}
                </div>
              </div>
            </div>

            {/* Receipt Summary Card */}
            <div style={{ backgroundColor: 'var(--color-bg-surface-alt)', padding: '16px', borderRadius: 'var(--radius-md)', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Received From</span>
                <Badge variant={getStatusBadgeVariant(selectedReceipt.status)}>{selectedReceipt.status.toUpperCase()}</Badge>
              </div>
              <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>{selectedReceipt.tenant?.full_name || 'Resident'}</div>
              {selectedReceipt.tenant?.email && <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>{selectedReceipt.tenant.email}</div>}
              {selectedReceipt.tenant?.phone && <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Phone: {selectedReceipt.tenant.phone}</div>}
            </div>

            {/* Receipt Details Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '10px 12px', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>Payment Method</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, textTransform: 'uppercase', fontSize: 'var(--font-size-sm)' }}>
                    {selectedReceipt.payment_method}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '10px 12px', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>Payment Date</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500, fontSize: 'var(--font-size-sm)' }}>
                    {formatDate(selectedReceipt.created_at)}
                  </td>
                </tr>
                {selectedReceipt.notes && (
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>Transaction Notes</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 'var(--font-size-sm)' }}>
                      {selectedReceipt.notes}
                    </td>
                  </tr>
                )}
                {selectedReceipt.rejection_reason && (
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--color-danger)', fontSize: 'var(--font-size-sm)' }}>Rejection Reason</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--color-danger)', fontSize: 'var(--font-size-sm)' }}>
                      {selectedReceipt.rejection_reason}
                    </td>
                  </tr>
                )}
                <tr style={{ backgroundColor: 'var(--color-bg-surface-alt)' }}>
                  <td style={{ padding: '14px 12px', fontWeight: 700, fontSize: 'var(--font-size-base)' }}>Total Amount Paid</td>
                  <td style={{ padding: '14px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 'var(--font-size-xl)', color: 'var(--color-primary)' }}>
                    {formatCurrency(selectedReceipt.amount_paise)}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Note & Security info */}
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', textAlign: 'center', borderTop: '1px dashed var(--color-border)', paddingTop: '12px' }}>
              This is an immutable digital receipt recorded by {pg?.name || pgName || 'PG Management'}. All dates are in DD/MM/YYYY format.
            </div>
          </div>
        </Modal>
      )}

      {/* Record Payment Modal */}
      {showRecordModal && (
        <Modal
          isOpen={showRecordModal}
          onClose={() => setShowRecordModal(false)}
          title="Record Direct Resident Payment"
          size="md"
        >
          <form onSubmit={submitRecordPayment} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <FormField label="Select Resident" required>
              <Select
                options={[
                  { value: '', label: '-- Select Resident --' },
                  ...tenantsList.map((t) => ({
                    value: t.id,
                    label: `${t.full_name}${t.room?.room_number ? ` (Room ${t.room.room_number})` : ''}`,
                  })),
                ]}
                value={selectedTenantId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleTenantSelect(e.target.value)}
                required
              />
            </FormField>

            {pendingDuesInfo && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-primary-light)',
                border: '1px solid var(--color-border)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 600,
                color: 'var(--color-primary)',
              }}>
                {pendingDuesInfo}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <FormField label="Amount Paid (₹)" required>
                <Input
                  type="number"
                  step="any"
                  placeholder="e.g. 9000"
                  value={recordAmount}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecordAmount(e.target.value)}
                  required
                />
              </FormField>

              <FormField label="Payment Method" required>
                <Select
                  options={[
                    { value: 'CASH', label: 'Cash' },
                    { value: 'UPI', label: 'UPI' },
                    { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
                  ]}
                  value={recordMethod}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRecordMethod(e.target.value as any)}
                />
              </FormField>
            </div>

            <FormField label="UTR / Reference ID (Optional)">
              <Input
                placeholder="e.g. 625519827391 or UPI/..."
                value={recordUtr}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecordUtr(e.target.value)}
              />
            </FormField>

            <FormField label="Notes / Comments (Optional)">
              <Input
                placeholder="e.g. September rent paid directly"
                value={recordNotes}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecordNotes(e.target.value)}
              />
            </FormField>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
              <Button type="button" variant="secondary" onClick={() => setShowRecordModal(false)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isRecording}>
                Confirm & Record Payment
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: 'var(--radius-sm)', display: 'flex' };
