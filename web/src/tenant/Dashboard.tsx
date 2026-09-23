import React from 'react';
import { Card } from '../components/ui/Card';
import { Badge, getStatusBadgeVariant } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { FormField, Input, Select, Textarea } from '../components/ui/FormField';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../hooks/useAuth';
import { apiGet, apiPost, formatCurrency, formatMonth, extractReferenceId } from '../lib/api';
import {
  Zap,
  Home,
  ShieldCheck,
  History,
  AlertCircle,
  Info,
  CreditCard,
  QrCode,
  Copy,
  Check,
  Clock,
  Landmark,
  CheckCircle2,
  DoorOpen,
} from 'lucide-react';

interface TenantBillingSummary {
  tenant: {
    id: string;
    full_name: string;
    phone: string;
    email: string;
    room_number: string;
    floor: number;
    room_type: string;
    base_rent_paise: number;
    status?: string;
    move_out_date?: string | null;
  };
  billingSettings: {
    electricity_rate_per_unit_paise: number;
    maintenance_charge_paise: number;
  };
  currentDue: {
    rent_record_id: string | null;
    month: string;
    base_rent_paise: number;
    maintenance_paise: number;
    electricity_units: number;
    electricity_rate_per_unit_paise: number;
    electricity_amount_paise: number;
    late_fee_paise: number;
    total_due_paise: number;
    status: string;
    due_date: string;
  };
  rentRecords: Array<{
    id: string;
    month: string;
    rent_amount_paise: number;
    late_fee_paise: number;
    total_due_paise: number;
    status: string;
    due_date: string;
    paid_date: string | null;
    notes: string | null;
  }>;
  electricityBills: Array<{
    id: string;
    month: string;
    previous_reading: number;
    current_reading: number;
    units_consumed: number;
    rate_per_unit_paise: number;
    total_amount_paise: number;
    status: string;
  }>;
  payments: Array<{
    id: string;
    amount_paise: number;
    payment_method: string;
    status: string;
    notes?: string | null;
    created_at: string;
    verified_at: string | null;
    rejection_reason: string | null;
  }>;
}

export default function TenantDashboard() {
  const { user } = useAuth();
  const [data, setData] = React.useState<TenantBillingSummary | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    if (user?.tenantId) {
      loadBillingSummary();
    }
  }, [user]);

  async function loadBillingSummary() {
    setIsLoading(true);
    const res = await apiGet<TenantBillingSummary>(`/tenants/${user!.tenantId}/billing-summary`);
    if (res.success && res.data) {
      setData(res.data);
    }
    setIsLoading(false);
  }

  const { showToast } = useToast();
  const [showPaymentModal, setShowPaymentModal] = React.useState(false);
  const [bankingDetails, setBankingDetails] = React.useState<{
    upi_id: string;
    bank_name: string;
    account_number: string;
    ifsc_code: string;
    account_holder_name: string;
    payment_qr: string | null;
  } | null>(null);
  const [isLoadingBanking, setIsLoadingBanking] = React.useState(false);
  const [copiedField, setCopiedField] = React.useState<string | null>(null);

  const [utrId, setUtrId] = React.useState('');
  const [paymentMethod, setPaymentMethod] = React.useState<'upi' | 'bank_transfer' | 'cash'>('upi');
  const [paymentAmount, setPaymentAmount] = React.useState<number | string>('');
  const [paymentNotes, setPaymentNotes] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function openPaymentModal() {
    setShowPaymentModal(true);
    setPaymentAmount(data?.currentDue ? (data.currentDue.total_due_paise / 100).toString() : '0');
    if (!bankingDetails) {
      setIsLoadingBanking(true);
      const res = await apiGet<{
        upi_id: string;
        bank_name: string;
        account_number: string;
        ifsc_code: string;
        account_holder_name: string;
        payment_qr: string | null;
      }>('/settings/banking');
      if (res.success && res.data) {
        setBankingDetails(res.data);
      } else {
        // Graceful fallback to /pg if /settings/banking not found
        try {
          const pgRes = await apiGet<{
            upi_id?: string | null;
            bank_name?: string | null;
            account_number?: string | null;
            ifsc_code?: string | null;
            account_holder_name?: string | null;
          }>('/pg');
          if (pgRes.success && pgRes.data) {
            setBankingDetails({
              upi_id: pgRes.data.upi_id || '',
              bank_name: pgRes.data.bank_name || '',
              account_number: pgRes.data.account_number || '',
              ifsc_code: pgRes.data.ifsc_code || '',
              account_holder_name: pgRes.data.account_holder_name || '',
              payment_qr: null,
            });
          }
        } catch (e) {
          console.warn('[Tenant] Fallback to /pg failed:', e);
        }
      }
      setIsLoadingBanking(false);
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    showToast(`Copied ${label} to clipboard!`);
    setTimeout(() => setCopiedField(null), 2000);
  }

  async function handleSubmitPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!utrId.trim()) {
      showToast('Please enter your 12-digit UTR or Reference ID', 'error');
      return;
    }
    const numAmt = Number(paymentAmount);
    if (isNaN(numAmt) || numAmt <= 0) {
      showToast('Please enter a valid amount paid', 'error');
      return;
    }

    setIsSubmitting(true);
    const res = await apiPost('/payments', {
      rent_record_id: data?.currentDue?.rent_record_id || null,
      amount_paise: Math.round(numAmt * 100),
      payment_method: paymentMethod,
      utr_id: utrId.trim(),
      notes: paymentNotes.trim() || null,
    });

    if (res.success) {
      showToast('Payment submitted successfully! Admin will verify and mark as paid.');
      setShowPaymentModal(false);
      setUtrId('');
      setPaymentNotes('');
      await loadBillingSummary();
    } else {
      showToast(res.error || 'Failed to submit payment', 'error');
    }
    setIsSubmitting(false);
  }

  // Vacate / Leaving notice state
  const [showVacateModal, setShowVacateModal] = React.useState(false);
  const [leavingDate, setLeavingDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [leavingReason, setLeavingReason] = React.useState('');
  const [isVacating, setIsVacating] = React.useState(false);

  async function handleVacateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.tenantId) return;

    setIsVacating(true);
    const res = await apiPost(`/tenants/${user.tenantId}/vacate`, {
      leaving_date: leavingDate,
      reason: leavingReason.trim() || undefined,
    });

    if (res.success) {
      showToast('You have marked yourself as leaving. Your bed is now marked vacant for other residents.');
      setShowVacateModal(false);
      await loadBillingSummary();
    } else {
      showToast(res.error || 'Failed to submit vacate notice', 'error');
    }
    setIsVacating(false);
  }

  if (isLoading) {
    return (
      <div className="page-container">
        <h1 className="page-title">Tenant Portal</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: '140px', borderRadius: 'var(--radius-lg)' }} />
          ))}
        </div>
      </div>
    );
  }

  const current = data?.currentDue;
  const isPaid = current?.status === 'paid';
  const pendingPayment = data?.payments?.find((p) => p.status === 'submitted');

  return (
    <div className="page-container" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header Profile & Assigned Room Info */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '16px',
        padding: '20px 24px',
        backgroundColor: 'var(--color-bg-surface-alt)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-primary-light)',
            color: 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Home size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, margin: 0 }}>
              Welcome, {data?.tenant.full_name}
            </h1>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', margin: '2px 0 0' }}>
              Room {data?.tenant.room_number} • Floor {data?.tenant.floor} • {data?.tenant.room_type.toUpperCase()}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {data?.tenant.status === 'moved_out' ? (
            <Badge variant="neutral">Moved Out / Vacated</Badge>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowVacateModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                color: 'var(--color-danger)',
                borderColor: 'var(--color-danger)',
                fontWeight: 600,
              }}
            >
              <DoorOpen size={15} /> Mark as Leaving
            </Button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={18} style={{ color: 'var(--color-success)' }} />
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
              Read-Only Verified Statement
            </span>
          </div>
        </div>
      </div>

      {data?.tenant.status === 'moved_out' && (
        <div style={{
          marginBottom: '20px',
          padding: '14px 18px',
          backgroundColor: 'var(--color-bg-surface-alt)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          <DoorOpen size={22} style={{ color: 'var(--color-danger)', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
              Accommodation Marked as Vacated
            </div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              You have notified administration that you are leaving. Your bed is now marked vacant for other incoming residents. Past payment records remain accessible below.
            </div>
          </div>
        </div>
      )}

      {/* Itemized Dues Card for Current Month */}
      <Card padding="lg" style={{ marginBottom: '24px', borderLeft: `5px solid ${isPaid ? 'var(--color-success)' : 'var(--color-primary)'}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, margin: 0 }}>
                {formatMonth(current?.month || new Date().toISOString().slice(0, 7))} Statement
              </h2>
              <Badge variant={getStatusBadgeVariant(current?.status || 'pending')}>
                {(current?.status || 'PENDING').toUpperCase()}
              </Badge>
            </div>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)', marginTop: '4px' }}>
              Due by: {current?.due_date ? new Date(current.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '5th of the month'}
            </p>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Total Amount Payable
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: isPaid ? 'var(--color-success)' : 'var(--color-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {formatCurrency(current?.total_due_paise || 0)}
            </div>
          </div>
        </div>

        {/* Itemized Calculation Breakdown */}
        <div style={{
          backgroundColor: 'var(--color-bg-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-surface-alt)', fontWeight: 600, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
            Itemized Cost Breakdown
          </div>

          <div style={{ display: 'grid', gap: '0' }}>
            {/* Row 1: Base Rent */}
            <div style={breakdownRowStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Home size={16} style={{ color: 'var(--color-text-muted)' }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>Room Base Rent</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                    Fixed monthly rent for Room {data?.tenant.room_number}
                  </div>
                </div>
              </div>
              <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(current?.base_rent_paise || 0)}
              </div>
            </div>

            {/* Row 2: Fixed Maintenance */}
            <div style={breakdownRowStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ShieldCheck size={16} style={{ color: 'var(--color-text-muted)' }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>Maintenance Charge</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                    Fixed property maintenance & cleaning services
                  </div>
                </div>
              </div>
              <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(current?.maintenance_paise || 0)}
              </div>
            </div>

            {/* Row 3: Electricity */}
            <div style={breakdownRowStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Zap size={16} style={{ color: '#F59E0B' }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                    Electricity Consumption ({current?.electricity_units || 0} units)
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                    {current?.electricity_units || 0} units @ ₹{((current?.electricity_rate_per_unit_paise || 1200) / 100).toFixed(2)} / unit
                  </div>
                </div>
              </div>
              <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(current?.electricity_amount_paise || 0)}
              </div>
            </div>

            {/* Row 4: Total Summary */}
            <div style={{ ...breakdownRowStyle, backgroundColor: 'var(--color-bg-surface-alt)', borderTop: '2px solid var(--color-border)' }}>
              <div style={{ fontWeight: 700, fontSize: 'var(--font-size-base)' }}>Total Balance Due</div>
              <div style={{ fontWeight: 800, fontSize: 'var(--font-size-md)', color: isPaid ? 'var(--color-success)' : 'var(--color-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(current?.total_due_paise || 0)}
              </div>
            </div>
          </div>
        </div>

        {/* Payment Action Banner */}
        {!isPaid && (
          <div style={{ marginTop: '18px' }}>
            {pendingPayment ? (
              <div style={{
                padding: '16px 20px',
                backgroundColor: '#FEF3C7',
                border: '1px solid #FCD34D',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    backgroundColor: '#FDE68A',
                    color: '#B45309',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Clock size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: '#92400E' }}>
                      Payment Submitted (Pending Admin Verification)
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: '#78350F', marginTop: '2px' }}>
                      Amount: {formatCurrency(pendingPayment.amount_paise)} •{' '}
                      {(() => {
                        const { refId, extraNotes } = extractReferenceId(pendingPayment.notes);
                        if (refId) {
                          return <span style={{ fontWeight: 700, backgroundColor: '#FDE68A', padding: '2px 6px', borderRadius: '4px' }}>Ref: {refId}</span>;
                        }
                        return extraNotes || `Submitted on ${new Date(pendingPayment.created_at).toLocaleDateString('en-IN')}`;
                      })()}
                    </div>
                  </div>
                </div>

                <Button size="sm" variant="secondary" onClick={openPaymentModal}>
                  Submit Another Proof
                </Button>
              </div>
            ) : (
              <div style={{
                padding: '16px 20px',
                backgroundColor: 'var(--color-primary-light)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '14px',
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-primary)' }}>
                    Payment Due for {formatMonth(current?.month || '')}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                    Pay via UPI / QR Code or Netbanking and submit your UTR ID for verification.
                  </div>
                </div>

                <Button
                  size="md"
                  onClick={openPaymentModal}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                >
                  <CreditCard size={18} /> Pay Rent / Submit UTR
                </Button>
              </div>
            )}
          </div>
        )}

        {isPaid && (
          <div style={{
            marginTop: '16px',
            padding: '12px 18px',
            backgroundColor: 'var(--color-success-light)',
            color: 'var(--color-success)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 600,
          }}>
            <CheckCircle2 size={18} />
            <span>Rent for this month is fully settled and verified by administration.</span>
          </div>
        )}

        <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
          <Info size={14} style={{ flexShrink: 0 }} />
          <span>Note: Rent and electricity figures are recorded directly by property administration and cannot be altered.</span>
        </div>
      </Card>

      {/* Electricity Consumption History */}
      <Card padding="lg" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Zap size={20} style={{ color: '#F59E0B' }} />
          <div>
            <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: 0 }}>
              Monthly Electricity Consumption History
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)', margin: '2px 0 0' }}>
              Meter readings, units consumed, and cost calculation history
            </p>
          </div>
        </div>

        {data?.electricityBills && data.electricityBills.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Billing Month</th>
                  <th style={thStyle}>Previous Reading</th>
                  <th style={thStyle}>Current Reading</th>
                  <th style={thStyle}>Units Consumed</th>
                  <th style={thStyle}>Rate / Unit</th>
                  <th style={thStyle}>Total Amount</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.electricityBills.map((b) => (
                  <tr key={b.id}>
                    <td style={tdStyle}>{formatMonth(b.month)}</td>
                    <td style={tdStyle}>{b.previous_reading}</td>
                    <td style={tdStyle}>{b.current_reading}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{b.units_consumed} units</td>
                    <td style={tdStyle}>₹{(b.rate_per_unit_paise / 100).toFixed(2)}</td>
                    <td style={{ ...tdStyle, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(b.total_amount_paise)}
                    </td>
                    <td style={tdStyle}>
                      <Badge variant={getStatusBadgeVariant(b.status)}>{b.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            No electricity reading history found for this account.
          </div>
        )}
      </Card>

      {/* Payment & Rent History */}
      <Card padding="lg">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <History size={20} style={{ color: 'var(--color-primary)' }} />
          <div>
            <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: 0 }}>
              Payment & Dues History
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)', margin: '2px 0 0' }}>
              History of all payments made and monthly dues statements
            </p>
          </div>
        </div>

        {data?.payments && data.payments.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Payment Date</th>
                  <th style={thStyle}>Amount Paid</th>
                  <th style={thStyle}>Payment Method</th>
                  <th style={thStyle}>UTR / Reference ID</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Verification / Details</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => {
                  const { refId, extraNotes } = extractReferenceId(p.notes);
                  return (
                    <tr key={p.id}>
                      <td style={tdStyle}>{new Date(p.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td style={{ ...tdStyle, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(p.amount_paise)}
                      </td>
                      <td style={{ ...tdStyle, textTransform: 'uppercase' }}>{p.payment_method}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 'var(--font-size-xs)' }}>
                        {refId ? (
                          <div>
                            <span style={{ backgroundColor: 'var(--color-bg-surface-alt)', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--color-border)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                              {refId}
                            </span>
                            {extraNotes && (
                              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                {extraNotes}
                              </div>
                            )}
                          </div>
                        ) : extraNotes ? (
                          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{extraNotes}</span>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)' }}>-</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <Badge variant={getStatusBadgeVariant(p.status)}>{p.status}</Badge>
                      </td>
                      <td style={{ ...tdStyle, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                        {p.status === 'verified'
                          ? `Verified on ${p.verified_at ? new Date(p.verified_at).toLocaleDateString('en-IN') : '-'}`
                          : p.status === 'rejected'
                          ? `Rejected: ${p.rejection_reason || 'See administration'}`
                          : 'Awaiting admin verification'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            No payments recorded yet.
          </div>
        )}
      </Card>

      {/* Payment & UTR Submission Modal */}
      {showPaymentModal && (
        <Modal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          title={`Pay Rent — ${formatMonth(current?.month || '')}`}
          size="lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header: Amount Due Banner */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 20px',
              backgroundColor: 'var(--color-bg-surface-alt)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
            }}>
              <div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                  Total Balance Due
                </span>
                <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-primary)' }}>
                  {formatCurrency(current?.total_due_paise || 0)}
                </div>
              </div>
              <Badge variant={getStatusBadgeVariant(current?.status || 'pending')}>
                {(current?.status || 'pending').toUpperCase()}
              </Badge>
            </div>

            {/* Step 1: PG Banking Details & QR Code */}
            <div>
              <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-secondary)', letterSpacing: '0.5px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <QrCode size={16} style={{ color: 'var(--color-primary)' }} />
                <span>Step 1: Scan QR or Transfer via UPI / Bank</span>
              </h3>

              {isLoadingBanking ? (
                <div className="skeleton" style={{ height: '140px', borderRadius: 'var(--radius-md)' }} />
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: bankingDetails?.payment_qr ? 'auto 1fr' : '1fr',
                  gap: '16px',
                  padding: '16px',
                  backgroundColor: 'var(--color-bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  alignItems: 'center',
                }}>
                  {bankingDetails?.payment_qr && (
                    <div style={{ textAlign: 'center', padding: '8px', backgroundColor: '#ffffff', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                      <img
                        src={bankingDetails.payment_qr}
                        alt="Payment QR Code"
                        style={{ width: '160px', height: '160px', objectFit: 'contain', display: 'block' }}
                      />
                      <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 600, display: 'block', marginTop: '4px' }}>
                        Scan via GPay / PhonePe / Paytm
                      </span>
                    </div>
                  )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {bankingDetails?.upi_id && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: 'var(--color-bg-surface-alt)', borderRadius: 'var(--radius-sm)' }}>
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'block' }}>UPI ID</span>
                        <code style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-primary)' }}>
                          {bankingDetails.upi_id}
                        </code>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => copyToClipboard(bankingDetails.upi_id, 'UPI ID')}
                        style={{ padding: '4px 10px' }}
                      >
                        {copiedField === 'UPI ID' ? <Check size={14} style={{ color: 'var(--color-success)' }} /> : <Copy size={14} />}
                        <span>{copiedField === 'UPI ID' ? 'Copied' : 'Copy'}</span>
                      </Button>
                    </div>
                  )}

                  {bankingDetails?.account_number && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: 'var(--color-bg-surface-alt)', borderRadius: 'var(--radius-sm)' }}>
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Landmark size={12} /> Bank Account ({bankingDetails.bank_name || 'Bank'})
                        </span>
                        <code style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700 }}>
                          {bankingDetails.account_number}
                        </code>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => copyToClipboard(bankingDetails.account_number, 'Account Number')}
                        style={{ padding: '4px 10px' }}
                      >
                        {copiedField === 'Account Number' ? <Check size={14} style={{ color: 'var(--color-success)' }} /> : <Copy size={14} />}
                        <span>{copiedField === 'Account Number' ? 'Copied' : 'Copy'}</span>
                      </Button>
                    </div>
                  )}

                  {bankingDetails?.ifsc_code && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: 'var(--color-bg-surface-alt)', borderRadius: 'var(--radius-sm)' }}>
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'block' }}>IFSC Code</span>
                        <code style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700 }}>
                          {bankingDetails.ifsc_code}
                        </code>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => copyToClipboard(bankingDetails.ifsc_code, 'IFSC Code')}
                        style={{ padding: '4px 10px' }}
                      >
                        {copiedField === 'IFSC Code' ? <Check size={14} style={{ color: 'var(--color-success)' }} /> : <Copy size={14} />}
                        <span>{copiedField === 'IFSC Code' ? 'Copied' : 'Copy'}</span>
                      </Button>
                    </div>
                  )}

                  {bankingDetails?.account_holder_name && (
                    <div style={{ padding: '6px 12px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                      Beneficiary: <strong>{bankingDetails.account_holder_name}</strong>
                    </div>
                  )}

                  {!bankingDetails?.upi_id && !bankingDetails?.account_number && !bankingDetails?.payment_qr && (
                    <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', padding: '8px' }}>
                      Contact administration for direct payment instructions.
                    </div>
                  )}
                </div>
              </div>
            )}
            </div>

            {/* Step 2: Enter UTR & Submit */}
            <form onSubmit={handleSubmitPayment} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-secondary)', letterSpacing: '0.5px', margin: '4px 0 0' }}>
                Step 2: Enter UTR / Reference ID & Submit
              </h3>

              <FormField label="UTR / Transaction Reference ID" required>
                <Input
                  placeholder="e.g. 12-digit UPI reference (e.g. 425189012345)"
                  value={utrId}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUtrId(e.target.value)}
                  required
                  autoFocus
                />
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                  You will find this 12-digit reference number in Google Pay, PhonePe, Paytm, or your bank transaction receipt.
                </span>
              </FormField>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <FormField label="Payment Method">
                  <Select
                    options={[
                      { value: 'upi', label: 'UPI (GPay / PhonePe / Paytm)' },
                      { value: 'bank_transfer', label: 'Bank Transfer (IMPS / NEFT)' },
                      { value: 'cash', label: 'Cash' },
                    ]}
                    value={paymentMethod}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPaymentMethod(e.target.value as any)}
                  />
                </FormField>

                <FormField label="Amount Paid (₹)" required>
                  <Input
                    type="number"
                    value={paymentAmount}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPaymentAmount(e.target.value)}
                    required
                  />
                </FormField>
              </div>

              <FormField label="Notes / Remarks (Optional)">
                <Input
                  placeholder="e.g. Paid from HDFC account ending in 4102"
                  value={paymentNotes}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPaymentNotes(e.target.value)}
                />
              </FormField>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <Button variant="secondary" onClick={() => setShowPaymentModal(false)} type="button">
                  Cancel
                </Button>
                <Button variant="primary" type="submit" isLoading={isSubmitting}>
                  <Check size={16} /> Submit Payment for Verification
                </Button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* Vacate / Leaving Notice Modal */}
      {showVacateModal && (
        <Modal
          isOpen={showVacateModal}
          onClose={() => setShowVacateModal(false)}
          title="Mark as Leaving / Vacate Room"
          size="md"
        >
          <form onSubmit={handleVacateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{
              padding: '14px 16px',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
            }}>
              <AlertCircle size={20} style={{ color: '#DC2626', flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: 'var(--font-size-xs)', color: '#991B1B' }}>
                <strong style={{ display: 'block', marginBottom: '4px' }}>Confirm Room Move-Out</strong>
                By marking that you are leaving, your bed in <strong>Room {data?.tenant.room_number}</strong> will immediately be released and marked as <strong>vacant</strong> for other incoming residents, and the PG administration will be notified.
              </div>
            </div>

            <FormField label="Move-Out / Leaving Date" required>
              <Input
                type="date"
                value={leavingDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLeavingDate(e.target.value)}
                required
              />
            </FormField>

            <FormField label="Reason for Leaving / Feedback (Optional)">
              <Textarea
                placeholder="e.g. Completed college course / relocation / personal reasons..."
                value={leavingReason}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setLeavingReason(e.target.value)}
                rows={3}
              />
            </FormField>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '12px',
              borderTop: '1px solid var(--color-border)',
              paddingTop: '16px',
            }}>
              <Button type="button" variant="secondary" onClick={() => setShowVacateModal(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="danger"
                isLoading={isVacating}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <DoorOpen size={16} /> Confirm Move-Out & Vacate Bed
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

const breakdownRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 16px',
  borderBottom: '1px solid var(--color-border)',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 14px',
  fontSize: 'var(--font-size-xs)',
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  backgroundColor: 'var(--color-bg-surface-alt)',
  borderBottom: '1px solid var(--color-border)',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderBottom: '1px solid var(--color-border)',
};

