import React from 'react';
import { ResponsiveTable, type ResponsiveColumn } from '../components/common/ResponsiveTable';
import { Button, Modal, FormField, Input, Select } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../hooks/useAuth';
import { apiGet, apiPost, apiPatch, formatCurrency, formatMonth } from '../lib/api';
import { formatDate } from '../lib/date';
import {
  Banknote,
  Plus,
  FileText,
  Send,
  Clock,
  Bell,
  AlertTriangle,
  CheckCircle2,
  CheckCircle,
  ShieldAlert,
  Calendar,
  Check,
  X,
  CreditCard,
  RefreshCw,
  Search,
  MessageSquare,
} from 'lucide-react';
import { RentInvoiceModal, type RentInvoiceData } from '../components/billing/RentInvoiceModal';

export interface RentTrackingItem {
  tenant_id: string;
  full_name: string;
  phone: string;
  email: string;
  room_number: string;
  room_id: string;
  floor: number;
  move_in_date: string;
  month: string;
  due_date: string;
  due_date_formatted: string;
  days_remaining: number;
  days_overdue: number;
  is_due_today: boolean;
  status: 'UPCOMING' | 'DUE_TODAY' | 'OVERDUE' | 'PAYMENT_SUBMITTED' | 'PAID';
  status_label: string;
  base_rent_paise: number;
  maintenance_paise: number;
  electricity_units: number;
  electricity_amount_paise: number;
  late_fee_paise: number;
  total_due_paise: number;
  formatted_amount: string;
  reminder_count: number;
  last_reminder_sent_at: string | null;
  next_reminder_at: string | null;
  rent_record_id: string | null;
  payment: {
    id: string;
    amount_paise: number;
    payment_method: string;
    utr_id: string | null;
    screenshot_path: string | null;
    status: string;
    created_at: string;
  } | null;
}

export interface RentTrackingSummary {
  total_active_tenants: number;
  upcoming_count: number;
  due_today_count: number;
  overdue_count: number;
  verification_pending_count: number;
  paid_count: number;
  month: string;
}

export default function AdminRent() {
  const { pg } = useAuth();
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const [monthFilter, setMonthFilter] = React.useState(currentMonthStr);
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [items, setItems] = React.useState<RentTrackingItem[]>([]);
  const [summary, setSummary] = React.useState<RentTrackingSummary>({
    total_active_tenants: 0,
    upcoming_count: 0,
    due_today_count: 0,
    overdue_count: 0,
    verification_pending_count: 0,
    paid_count: 0,
    month: currentMonthStr,
  });
  const [isLoading, setIsLoading] = React.useState(true);

  // Invoices & Reminders
  const [selectedInvoice, setSelectedInvoice] = React.useState<RentInvoiceData | null>(null);
  const [sendingWaTenantId, setSendingWaTenantId] = React.useState<string | null>(null);
  const [isTriggeringScan, setIsTriggeringScan] = React.useState(false);

  // Explicit Invoice Generation Modal
  const [showGenerateModal, setShowGenerateModal] = React.useState(false);
  const [generateMonth, setGenerateMonth] = React.useState(currentMonthStr);
  const [isGenerating, setIsGenerating] = React.useState(false);

  // Verification Modal
  const [verifyingItem, setVerifyingItem] = React.useState<RentTrackingItem | null>(null);
  const [rejectionReason, setRejectionReason] = React.useState('');
  const [showRejectInput, setShowRejectInput] = React.useState(false);
  const [isVerifying, setIsVerifying] = React.useState(false);

  // Quick Record Payment Modal
  const [recordingItem, setRecordingItem] = React.useState<RentTrackingItem | null>(null);
  const [recordAmount, setRecordAmount] = React.useState('');
  const [recordMethod, setRecordMethod] = React.useState<'UPI' | 'CASH' | 'BANK_TRANSFER'>('CASH');
  const [recordUtr, setRecordUtr] = React.useState('');
  const [recordNotes, setRecordNotes] = React.useState('');
  const [isRecording, setIsRecording] = React.useState(false);

  const { showToast } = useToast();

  React.useEffect(() => {
    loadTracking();
  }, [monthFilter]);

  async function loadTracking() {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (monthFilter) params.set('month', monthFilter);
      params.set('window', '10');

      const res = await apiGet<{ summary: RentTrackingSummary; data: RentTrackingItem[] }>(`/rent/tracking?${params}`);
      if (res.success && res.data) {
        setItems(res.data.data || []);
        if (res.data.summary) {
          setSummary(res.data.summary);
        }
      } else {
        showToast(res.error || 'Failed to load rent tracking', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to fetch rent tracking', 'error');
    } finally {
      setIsLoading(false);
    }
  }

  // Trigger manual reminder scan for all due/overdue tenants
  async function triggerDailyReminders() {
    setIsTriggeringScan(true);
    try {
      const res = await apiPost<{ message?: string }>('/rent/send-reminders', {});
      if (res.success) {
        showToast((res as any).message || 'Daily rent reminder scan completed successfully');
        loadTracking();
      } else {
        showToast(res.error || 'Failed to run reminder scan', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to process reminders', 'error');
    } finally {
      setIsTriggeringScan(false);
    }
  }

  // Send WhatsApp reminder / bill to an individual tenant
  async function sendReminderToTenant(item: RentTrackingItem) {
    try {
      setSendingWaTenantId(item.tenant_id);
      const res = await apiPost<{ reminder_count?: number; last_reminder_sent_at?: string }>('/rent/remind-tenant', {
        tenant_id: item.tenant_id,
        month: item.month,
      });

      if (res.success) {
        showToast(`WhatsApp reminder #${res.data?.reminder_count || (item.reminder_count + 1)} dispatched to ${item.full_name}!`);
        loadTracking();
      } else {
        showToast(res.error || 'Failed to send WhatsApp reminder', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to send reminder', 'error');
    } finally {
      setSendingWaTenantId(null);
    }
  }

  // Open invoice view modal
  function openInvoiceView(item: RentTrackingItem) {
    const invoiceRecord: RentInvoiceData = {
      id: item.rent_record_id || `temp-${item.tenant_id}`,
      month: item.month,
      rent_amount_paise: item.base_rent_paise,
      late_fee_paise: item.late_fee_paise,
      total_due_paise: item.total_due_paise,
      status: item.status === 'PAID' ? 'paid' : (item.status === 'OVERDUE' ? 'overdue' : 'pending'),
      due_date: item.due_date,
      paid_date: item.status === 'PAID' ? (item.payment?.created_at || new Date().toISOString()) : null,
      notes: JSON.stringify({
        base_rent_paise: item.base_rent_paise,
        maintenance_paise: item.maintenance_paise,
        electricity_units: item.electricity_units,
        electricity_amount_paise: item.electricity_amount_paise,
        reminder_count: item.reminder_count,
        last_reminder_sent_at: item.last_reminder_sent_at,
      }),
      tenant: {
        id: item.tenant_id,
        full_name: item.full_name,
        phone: item.phone,
        email: item.email,
      },
      room: {
        room_number: item.room_number,
        floor: item.floor,
      },
      pg: pg as any,
    };
    setSelectedInvoice(invoiceRecord);
  }

  // Admin verifies or rejects a submitted payment
  async function handleVerifyPayment(status: 'verified' | 'rejected') {
    if (!verifyingItem?.payment?.id) return;
    if (status === 'rejected' && !rejectionReason.trim()) {
      showToast('Please provide a reason for rejecting the payment.', 'error');
      return;
    }

    setIsVerifying(true);
    try {
      const res = await apiPatch(`/payments/${verifyingItem.payment.id}/verify`, {
        status,
        rejection_reason: status === 'rejected' ? rejectionReason.trim() : null,
      });

      if (res.success) {
        showToast(
          status === 'verified'
            ? 'Payment verified! Rent status marked as PAID and reminders permanently stopped.'
            : 'Payment rejected and tenant notified.'
        );
        setVerifyingItem(null);
        setShowRejectInput(false);
        setRejectionReason('');
        loadTracking();
      } else {
        showToast(res.error || 'Failed to update payment status', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Verification failed', 'error');
    } finally {
      setIsVerifying(false);
    }
  }

  // Explicit batch invoice generation
  async function handleGenerateInvoices() {
    setIsGenerating(true);
    try {
      const res = await apiPost('/rent/generate', { month: generateMonth });
      if (res.success) {
        showToast(`Formal invoices generated for ${formatMonth(generateMonth)}`);
        setShowGenerateModal(false);
        loadTracking();
      } else {
        showToast(res.error || 'Failed to generate rent records', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Generation error', 'error');
    } finally {
      setIsGenerating(false);
    }
  }

  // Open manual record payment modal
  function openRecordPaymentModal(item: RentTrackingItem) {
    setRecordingItem(item);
    setRecordAmount((item.total_due_paise / 100).toString());
    setRecordMethod('CASH');
    setRecordUtr('');
    setRecordNotes('');
  }

  // Submit manual recorded payment
  async function handleSubmitRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!recordingItem) return;

    const numAmt = Number(recordAmount);
    if (isNaN(numAmt) || numAmt <= 0) {
      showToast('Please enter a valid payment amount', 'error');
      return;
    }

    setIsRecording(true);
    try {
      const res = await apiPost('/payments/record', {
        tenant_id: recordingItem.tenant_id,
        rent_record_id: recordingItem.rent_record_id,
        amount_paise: Math.round(numAmt * 100),
        payment_method: recordMethod,
        utr_id: recordUtr.trim() || undefined,
        notes: recordNotes.trim() || undefined,
      });

      if (res.success) {
        showToast('Payment recorded, verified, and rent marked as PAID!');
        setRecordingItem(null);
        loadTracking();
      } else {
        showToast(res.error || 'Failed to record payment', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to record payment', 'error');
    } finally {
      setIsRecording(false);
    }
  }

  // Filter items based on active pill and search query
  const filteredItems = items.filter((item) => {
    // Status filter
    if (statusFilter === 'UPCOMING' && item.status !== 'UPCOMING') return false;
    if (statusFilter === 'DUE_TODAY' && item.status !== 'DUE_TODAY') return false;
    if (statusFilter === 'OVERDUE' && item.status !== 'OVERDUE') return false;
    if (statusFilter === 'PAYMENT_SUBMITTED' && item.status !== 'PAYMENT_SUBMITTED') return false;
    if (statusFilter === 'PAID' && item.status !== 'PAID') return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.full_name?.toLowerCase().includes(q);
      const matchRoom = item.room_number?.toLowerCase().includes(q);
      const matchPhone = item.phone?.toLowerCase().includes(q);
      if (!matchName && !matchRoom && !matchPhone) return false;
    }

    return true;
  });

  // Table Columns
  const columns: ResponsiveColumn<RentTrackingItem>[] = [
    {
      key: 'tenant',
      header: 'Resident',
      render: (r: RentTrackingItem) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{r.full_name}</div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            Room {r.room_number} {r.floor !== undefined && r.floor > 0 ? `• Fl ${r.floor}` : ''}
          </div>
          {r.phone && (
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{r.phone}</div>
          )}
        </div>
      ),
    },
    {
      key: 'due_date',
      header: 'Due Date',
      render: (r: RentTrackingItem) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.due_date_formatted || formatDate(r.due_date)}</div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
            Cycle: {r.move_in_date ? `Day ${new Date(r.move_in_date).getDate()}` : 'Monthly'}
          </div>
        </div>
      ),
    },
    {
      key: 'days_left',
      header: 'Countdown / Stage',
      render: (r: RentTrackingItem) => {
        if (r.status === 'PAID') {
          return (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 600,
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              color: '#059669',
            }}>
              <CheckCircle2 size={13} /> Paid & Settled
            </span>
          );
        }
        if (r.status === 'PAYMENT_SUBMITTED') {
          return (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 600,
              backgroundColor: 'rgba(147, 51, 234, 0.12)',
              color: '#7c3aed',
            }}>
              <ShieldAlert size={13} /> Verification Pending
            </span>
          );
        }
        if (r.status === 'DUE_TODAY') {
          return (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 700,
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              color: '#d97706',
            }}>
              <Bell size={13} /> Due Today
            </span>
          );
        }
        if (r.status === 'OVERDUE') {
          return (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 700,
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: '#dc2626',
            }}>
              <AlertTriangle size={13} /> {r.days_overdue}d overdue
            </span>
          );
        }
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 8px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 500,
            backgroundColor: 'rgba(59, 130, 246, 0.10)',
            color: '#2563eb',
          }}>
            <Clock size={13} /> In {r.days_remaining} days
          </span>
        );
      },
    },
    {
      key: 'total_due_paise',
      header: 'Total Due',
      render: (r: RentTrackingItem) => (
        <div>
          <div className="tabular-nums" style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
            {formatCurrency(r.total_due_paise)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
            Rent ₹{(r.base_rent_paise / 100).toLocaleString('en-IN')}
            {r.electricity_amount_paise > 0 ? ` + Elec ₹${(r.electricity_amount_paise / 100).toLocaleString('en-IN')}` : ''}
            {r.maintenance_paise > 0 ? ` + Maint ₹${(r.maintenance_paise / 100).toLocaleString('en-IN')}` : ''}
          </div>
        </div>
      ),
      sortable: true,
    },
    {
      key: 'reminders',
      header: 'Reminders',
      render: (r: RentTrackingItem) => (
        <div>
          {r.status === 'PAID' ? (
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              Reminders permanently stopped
            </span>
          ) : r.reminder_count > 0 ? (
            <div>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 7px',
                borderRadius: 'var(--radius-full, 9999px)',
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                color: '#b45309',
              }}>
                <MessageSquare size={11} /> Reminder #{r.reminder_count}
              </span>
              {r.last_reminder_sent_at && (
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  Sent {formatDate(r.last_reminder_sent_at)}
                </div>
              )}
            </div>
          ) : (
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              0 reminders sent
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (r: RentTrackingItem) => (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {r.status === 'PAYMENT_SUBMITTED' ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setVerifyingItem(r);
                setShowRejectInput(false);
                setRejectionReason('');
              }}
              title="Verify submitted payment"
              style={{ backgroundColor: '#7c3aed', borderColor: '#7c3aed' }}
            >
              <ShieldAlert size={14} /> Verify Payment
            </Button>
          ) : (
            <Button
              size="sm"
              variant={r.status === 'PAID' ? 'secondary' : 'primary'}
              onClick={() => sendReminderToTenant(r)}
              isLoading={sendingWaTenantId === r.tenant_id}
              disabled={Boolean(sendingWaTenantId && sendingWaTenantId !== r.tenant_id)}
              title={r.status === 'PAID' ? 'Send Paid Invoice on WhatsApp' : 'Send Due Reminder on WhatsApp'}
            >
              <Send size={14} /> {r.status === 'PAID' ? 'Send Invoice' : 'Send WhatsApp'}
            </Button>
          )}

          <Button
            size="sm"
            variant="secondary"
            onClick={() => openInvoiceView(r)}
            title="View detailed rent invoice breakdown"
          >
            <FileText size={14} /> View Bill
          </Button>

          {r.status !== 'PAID' && r.status !== 'PAYMENT_SUBMITTED' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => openRecordPaymentModal(r)}
              title="Record Cash/UPI payment"
            >
              <CreditCard size={14} /> Record
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="page-container">
      {/* Top Header & Quick Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Banknote size={26} style={{ color: 'var(--color-primary)' }} />
            Rent Tracking & Payment Reminders
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Real-time rent payment cycles, due-date countdowns, payment verification, and automated reminder tracking
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            onClick={triggerDailyReminders}
            disabled={isTriggeringScan}
            title="Scan for all due/overdue rents today and send WhatsApp reminders"
          >
            <Bell size={16} /> {isTriggeringScan ? 'Scanning...' : 'Trigger Due Reminders'}
          </Button>
          <Button onClick={() => setShowGenerateModal(true)} variant="secondary">
            <Plus size={16} /> Generate Invoices
          </Button>
        </div>
      </div>

      {/* Month Selector Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        backgroundColor: 'var(--color-bg-surface)',
        borderRadius: 'var(--radius-lg, 10px)',
        border: '1px solid var(--color-border)',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Calendar size={18} style={{ color: 'var(--color-primary)' }} />
          <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>Tracking Month:</span>
          <Input
            type="month"
            value={monthFilter}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMonthFilter(e.target.value)}
            style={{ width: '160px', padding: '6px 10px' }}
          />
          <Button
            size="sm"
            variant={monthFilter === currentMonthStr ? 'secondary' : 'primary'}
            onClick={() => setMonthFilter(currentMonthStr)}
          >
            Current Month
          </Button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            Active Tenants: <strong style={{ color: 'var(--color-text-primary)' }}>{summary.total_active_tenants}</strong>
          </span>
          <Button size="sm" variant="secondary" onClick={loadTracking} disabled={isLoading} title="Refresh data">
            <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
          </Button>
        </div>
      </div>

      {/* Executive KPI Overview Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '12px',
        marginBottom: '24px',
      }}>
        {/* Card 1: Upcoming */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'UPCOMING' ? 'ALL' : 'UPCOMING')}
          style={{
            padding: '16px',
            borderRadius: 'var(--radius-lg, 12px)',
            backgroundColor: statusFilter === 'UPCOMING' ? 'rgba(59, 130, 246, 0.08)' : 'var(--color-bg-surface)',
            border: `1.5px solid ${statusFilter === 'UPCOMING' ? 'var(--color-primary)' : 'var(--color-border)'}`,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
              UPCOMING PAYMENTS
            </span>
            <Clock size={18} style={{ color: '#2563eb' }} />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
            {summary.upcoming_count}
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--color-text-muted)' }}>
            Due within 10-day window
          </p>
        </div>

        {/* Card 2: Due Today */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'DUE_TODAY' ? 'ALL' : 'DUE_TODAY')}
          style={{
            padding: '16px',
            borderRadius: 'var(--radius-lg, 12px)',
            backgroundColor: statusFilter === 'DUE_TODAY' ? 'rgba(245, 158, 11, 0.10)' : 'var(--color-bg-surface)',
            border: `1.5px solid ${statusFilter === 'DUE_TODAY' ? '#d97706' : 'var(--color-border)'}`,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
              DUE TODAY
            </span>
            <Bell size={18} style={{ color: '#d97706' }} />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#d97706' }}>
            {summary.due_today_count}
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--color-text-muted)' }}>
            First reminder scheduled today
          </p>
        </div>

        {/* Card 3: Overdue */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'OVERDUE' ? 'ALL' : 'OVERDUE')}
          style={{
            padding: '16px',
            borderRadius: 'var(--radius-lg, 12px)',
            backgroundColor: statusFilter === 'OVERDUE' ? 'rgba(239, 68, 68, 0.08)' : 'var(--color-bg-surface)',
            border: `1.5px solid ${statusFilter === 'OVERDUE' ? '#dc2626' : 'var(--color-border)'}`,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
              OVERDUE
            </span>
            <AlertTriangle size={18} style={{ color: '#dc2626' }} />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#dc2626' }}>
            {summary.overdue_count}
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--color-text-muted)' }}>
            Active daily reminder cycle
          </p>
        </div>

        {/* Card 4: Payment Verification Pending */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'PAYMENT_SUBMITTED' ? 'ALL' : 'PAYMENT_SUBMITTED')}
          style={{
            padding: '16px',
            borderRadius: 'var(--radius-lg, 12px)',
            backgroundColor: statusFilter === 'PAYMENT_SUBMITTED' ? 'rgba(147, 51, 234, 0.08)' : 'var(--color-bg-surface)',
            border: `1.5px solid ${statusFilter === 'PAYMENT_SUBMITTED' ? '#7c3aed' : 'var(--color-border)'}`,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
              VERIFICATION PENDING
            </span>
            <ShieldAlert size={18} style={{ color: '#7c3aed' }} />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#7c3aed' }}>
            {summary.verification_pending_count}
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--color-text-muted)' }}>
            UTR submitted; awaiting admin check
          </p>
        </div>

        {/* Card 5: Paid */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'PAID' ? 'ALL' : 'PAID')}
          style={{
            padding: '16px',
            borderRadius: 'var(--radius-lg, 12px)',
            backgroundColor: statusFilter === 'PAID' ? 'rgba(16, 185, 129, 0.08)' : 'var(--color-bg-surface)',
            border: `1.5px solid ${statusFilter === 'PAID' ? '#059669' : 'var(--color-border)'}`,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
              PAID & SETTLED
            </span>
            <CheckCircle size={18} style={{ color: '#059669' }} />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#059669' }}>
            {summary.paid_count}
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--color-text-muted)' }}>
            Reminders permanently stopped
          </p>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { key: 'ALL', label: `All (${summary.total_active_tenants})` },
            { key: 'UPCOMING', label: `Upcoming (≤10d) (${summary.upcoming_count})` },
            { key: 'DUE_TODAY', label: `Due Today (${summary.due_today_count})` },
            { key: 'OVERDUE', label: `Overdue (${summary.overdue_count})` },
            { key: 'PAYMENT_SUBMITTED', label: `Verification Pending (${summary.verification_pending_count})` },
            { key: 'PAID', label: `Paid (${summary.paid_count})` },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-full, 9999px)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: statusFilter === tab.key ? 600 : 500,
                backgroundColor: statusFilter === tab.key ? 'var(--color-primary)' : 'var(--color-bg-surface)',
                color: statusFilter === tab.key ? '#fff' : 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', width: '220px' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <Input
            placeholder="Search tenant or room..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '32px', fontSize: 'var(--font-size-xs)' }}
          />
        </div>
      </div>

      {/* Main Responsive Table & Cards */}
      <ResponsiveTable<RentTrackingItem>
        columns={columns}
        data={filteredItems}
        isLoading={isLoading}
        renderCard={(item: RentTrackingItem) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Card Header: Tenant, Room, Status Countdown */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {item.full_name}
                </h4>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                  Room {item.room_number} {item.floor !== undefined && item.floor > 0 ? `• Fl ${item.floor}` : ''} • {formatMonth(item.month)}
                </div>
                {item.phone && (
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '1px' }}>
                    {item.phone}
                  </div>
                )}
              </div>

              {/* Status Badge */}
              {item.status === 'PAID' ? (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  color: '#059669',
                }}>
                  <CheckCircle2 size={12} /> Paid
                </span>
              ) : item.status === 'PAYMENT_SUBMITTED' ? (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: 'rgba(147, 51, 234, 0.12)',
                  color: '#7c3aed',
                }}>
                  <ShieldAlert size={12} /> Verification Pending
                </span>
              ) : item.status === 'DUE_TODAY' ? (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '11px',
                  fontWeight: 700,
                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                  color: '#d97706',
                }}>
                  <Bell size={12} /> Due Today
                </span>
              ) : item.status === 'OVERDUE' ? (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '11px',
                  fontWeight: 700,
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  color: '#dc2626',
                }}>
                  <AlertTriangle size={12} /> {item.days_overdue}d overdue
                </span>
              ) : (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '11px',
                  fontWeight: 500,
                  backgroundColor: 'rgba(59, 130, 246, 0.10)',
                  color: '#2563eb',
                }}>
                  <Clock size={12} /> In {item.days_remaining}d
                </span>
              )}
            </div>

            {/* Metrics Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
              padding: '12px 14px',
              backgroundColor: 'var(--color-bg-surface-alt)',
              borderRadius: 'var(--radius-md)',
            }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Rent Due Date
                </span>
                <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {item.due_date_formatted || formatDate(item.due_date)}
                </span>
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                  Cycle: {item.move_in_date ? `Day ${new Date(item.move_in_date).getDate()}` : 'Monthly'}
                </div>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Total Obligation
                </span>
                <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-primary)' }} className="tabular-nums">
                  {formatCurrency(item.total_due_paise)}
                </span>
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                  Rent: ₹{(item.base_rent_paise / 100).toLocaleString('en-IN')}
                  {item.electricity_amount_paise > 0 ? ` + Elec ₹${(item.electricity_amount_paise / 100).toLocaleString('en-IN')}` : ''}
                </div>
              </div>
            </div>

            {/* Reminder State Badge */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
              <div>
                {item.status === 'PAID' ? (
                  <span style={{ color: 'var(--color-success)', fontWeight: 500 }}>
                    ✓ Reminders permanently stopped
                  </span>
                ) : item.reminder_count > 0 ? (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'rgba(245, 158, 11, 0.12)',
                    color: '#b45309',
                    fontWeight: 600,
                    fontSize: '11px',
                  }}>
                    <MessageSquare size={11} /> Reminder #{item.reminder_count} sent
                  </span>
                ) : (
                  <span>No reminders sent yet</span>
                )}
              </div>

              {item.payment?.utr_id && (
                <span style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 600 }}>
                  UTR: {item.payment.utr_id}
                </span>
              )}
            </div>

            {/* Card Action Buttons */}
            <div style={{
              display: 'flex',
              gap: '8px',
              paddingTop: '10px',
              borderTop: '1px solid var(--color-border)',
              justifyContent: 'flex-end',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}>
              <Button size="sm" variant="secondary" onClick={() => openInvoiceView(item)}>
                <FileText size={14} /> View Bill
              </Button>

              {item.status === 'PAYMENT_SUBMITTED' ? (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    setVerifyingItem(item);
                    setShowRejectInput(false);
                    setRejectionReason('');
                  }}
                  style={{ backgroundColor: '#7c3aed', borderColor: '#7c3aed' }}
                >
                  <ShieldAlert size={14} /> Verify Payment
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant={item.status === 'PAID' ? 'secondary' : 'primary'}
                  onClick={() => sendReminderToTenant(item)}
                  isLoading={sendingWaTenantId === item.tenant_id}
                  disabled={Boolean(sendingWaTenantId && sendingWaTenantId !== item.tenant_id)}
                >
                  <Send size={14} /> {item.status === 'PAID' ? 'Send Invoice' : 'Send WhatsApp'}
                </Button>
              )}

              {item.status !== 'PAID' && item.status !== 'PAYMENT_SUBMITTED' && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openRecordPaymentModal(item)}
                >
                  <CreditCard size={14} /> Record
                </Button>
              )}
            </div>
          </div>
        )}
        emptyState={
          <div style={{ textAlign: 'center', padding: '48px' }}>
            <Banknote size={48} style={{ color: 'var(--color-text-muted)', marginBottom: '12px' }} />
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
              No tenants match the current tracking filter for {formatMonth(monthFilter)}
            </p>
            <Button onClick={() => setStatusFilter('ALL')} variant="secondary">
              View All Residents
            </Button>
          </div>
        }
      />

      {/* Payment Verification Modal */}
      <Modal
        isOpen={!!verifyingItem}
        onClose={() => setVerifyingItem(null)}
        title="Verify Resident Payment Submission"
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="secondary" onClick={() => setVerifyingItem(null)}>
              Cancel
            </Button>
            {!showRejectInput ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => setShowRejectInput(true)}
                  style={{ color: 'var(--color-error)', borderColor: 'var(--color-error)' }}
                  disabled={isVerifying}
                >
                  <X size={14} /> Reject Payment
                </Button>
                <Button
                  onClick={() => handleVerifyPayment('verified')}
                  disabled={isVerifying}
                  style={{ backgroundColor: 'var(--color-success)', borderColor: 'var(--color-success)' }}
                >
                  <Check size={14} /> {isVerifying ? 'Approving...' : 'Approve & Mark Paid'}
                </Button>
              </>
            ) : (
              <Button
                onClick={() => handleVerifyPayment('rejected')}
                disabled={isVerifying}
                style={{ backgroundColor: 'var(--color-error)', borderColor: 'var(--color-error)' }}
              >
                Confirm Rejection
              </Button>
            )}
          </div>
        }
      >
        {verifyingItem && (
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 14px',
              backgroundColor: 'rgba(147, 51, 234, 0.08)',
              border: '1px solid rgba(147, 51, 234, 0.25)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '16px',
            }}>
              <ShieldAlert size={20} style={{ color: '#7c3aed', flexShrink: 0 }} />
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-primary)' }}>
                <strong>Payment Verification Awaiting Admin Approval</strong>
                <p style={{ margin: '2px 0 0', color: 'var(--color-text-secondary)' }}>
                  Once approved, rent status immediately becomes <strong>PAID</strong>, official branded receipt is dispatched, and all automated reminders permanently stop.
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
                <p style={{ margin: '2px 0 0', fontWeight: 600 }}>{verifyingItem.full_name}</p>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{verifyingItem.phone}</span>
              </div>
              <div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Room</span>
                <p style={{ margin: '2px 0 0', fontWeight: 600 }}>Room {verifyingItem.room_number}</p>
              </div>
              <div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Billing Month</span>
                <p style={{ margin: '2px 0 0', fontWeight: 600 }}>{formatMonth(verifyingItem.month)}</p>
              </div>
              <div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Total Due</span>
                <p style={{ margin: '2px 0 0', fontWeight: 700, color: 'var(--color-primary)' }} className="tabular-nums">
                  {formatCurrency(verifyingItem.total_due_paise)}
                </p>
              </div>
            </div>

            {/* Submitted Payment Details */}
            <div style={{
              padding: '14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg-surface-alt)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontSize: 'var(--font-size-xs)',
              marginBottom: '16px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Submitted Amount:</span>
                <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-primary)' }}>
                  {verifyingItem.payment?.amount_paise ? formatCurrency(verifyingItem.payment.amount_paise) : formatCurrency(verifyingItem.total_due_paise)}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>UTR / Transaction ID:</span>
                <strong style={{ fontFamily: 'monospace', fontSize: '13px', color: '#7c3aed' }}>
                  {verifyingItem.payment?.utr_id || 'Not specified'}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Payment Method:</span>
                <strong>{verifyingItem.payment?.payment_method || 'UPI'}</strong>
              </div>
              {verifyingItem.payment?.created_at && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Submitted At:</span>
                  <strong>{formatDate(verifyingItem.payment.created_at)}</strong>
                </div>
              )}
            </div>

            {/* Rejection Reason Form */}
            {showRejectInput && (
              <FormField label="Reason for Rejection" required hint="Resident will receive this explanation on WhatsApp/Portal">
                <Input
                  type="text"
                  placeholder="e.g. UTR number invalid or amount mismatch"
                  value={rejectionReason}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRejectionReason(e.target.value)}
                  autoFocus
                />
              </FormField>
            )}
          </div>
        )}
      </Modal>

      {/* Manual Payment Recording Modal */}
      <Modal
        isOpen={!!recordingItem}
        onClose={() => setRecordingItem(null)}
        title={`Record Payment — ${recordingItem?.full_name || 'Resident'}`}
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setRecordingItem(null)}>Cancel</Button>
            <Button onClick={handleSubmitRecordPayment} disabled={isRecording}>
              {isRecording ? 'Recording...' : 'Record & Verify Payment'}
            </Button>
          </div>
        }
      >
        {recordingItem && (
          <form onSubmit={handleSubmitRecordPayment} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 12px',
              backgroundColor: 'var(--color-bg-surface-alt)',
              borderRadius: 'var(--radius-md)',
            }}>
              <div>
                <strong style={{ fontSize: 'var(--font-size-sm)' }}>{recordingItem.full_name}</strong>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', display: 'block' }}>
                  Room {recordingItem.room_number} • {formatMonth(recordingItem.month)}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', display: 'block' }}>Pending Due</span>
                <strong style={{ color: 'var(--color-primary)' }}>{formatCurrency(recordingItem.total_due_paise)}</strong>
              </div>
            </div>

            <FormField label="Amount Received (₹)" required>
              <Input
                type="number"
                step="1"
                value={recordAmount}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecordAmount(e.target.value)}
                required
              />
            </FormField>

            <FormField label="Payment Method" required>
              <Select
                options={[
                  { value: 'CASH', label: 'Cash Payment' },
                  { value: 'UPI', label: 'UPI / Google Pay / PhonePe' },
                  { value: 'BANK_TRANSFER', label: 'Direct Bank Transfer / NEFT' },
                ]}
                value={recordMethod}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRecordMethod(e.target.value as any)}
              />
            </FormField>

            <FormField label="UTR / Transaction Reference (Optional)">
              <Input
                type="text"
                placeholder="e.g. 219381928371"
                value={recordUtr}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecordUtr(e.target.value)}
              />
            </FormField>

            <FormField label="Notes (Optional)">
              <Input
                type="text"
                placeholder="e.g. Received full monthly rent"
                value={recordNotes}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecordNotes(e.target.value)}
              />
            </FormField>
          </form>
        )}
      </Modal>

      {/* Explicit Batch Invoice Generation Modal */}
      <Modal
        isOpen={showGenerateModal}
        onClose={() => setShowGenerateModal(false)}
        title="Generate Formal Invoices"
        size="sm"
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowGenerateModal(false)}>Cancel</Button>
            <Button onClick={handleGenerateInvoices} disabled={isGenerating}>
              {isGenerating ? 'Generating...' : 'Generate Records'}
            </Button>
          </div>
        }
      >
        <FormField
          label="Billing Month"
          required
          hint="Generates persistent database records and invoice numbers for all active tenants whose move-in cycle due dates fall in this month."
        >
          <Input
            type="month"
            value={generateMonth}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGenerateMonth(e.target.value)}
          />
        </FormField>
      </Modal>

      {/* Redesigned Rent Invoice & Bill Modal */}
      {selectedInvoice && (
        <RentInvoiceModal
          isOpen={!!selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          record={selectedInvoice}
          currentPG={pg}
          onSendWhatsApp={async () => {
            const tenantItem = items.find((i) => i.tenant_id === selectedInvoice.tenant?.id);
            if (tenantItem) {
              await sendReminderToTenant(tenantItem);
            }
          }}
          isSendingWhatsApp={Boolean(sendingWaTenantId && sendingWaTenantId === selectedInvoice.tenant?.id)}
        />
      )}
    </div>
  );
}
