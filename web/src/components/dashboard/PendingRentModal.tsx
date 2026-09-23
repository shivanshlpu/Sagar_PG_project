import React from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge, getStatusBadgeVariant } from '../ui/Badge';
import { useToast } from '../ui/Toast';
import { apiGet, apiPost, apiPatch, formatCurrency, formatMonth } from '../../lib/api';
import { formatDate } from '../../lib/date';
import {
  Send,
  Check,
  RotateCcw,
  Search,
  CheckCircle2,
  Calendar,
  Phone,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { RentInvoiceModal } from '../billing/RentInvoiceModal';

interface RentRecordItem {
  id: string;
  month: string;
  rent_amount_paise: number;
  late_fee_paise: number;
  total_due_paise: number;
  status: 'pending' | 'paid' | 'overdue' | 'partially_paid' | 'waived';
  due_date: string;
  paid_date?: string | null;
  tenant?: {
    id?: string;
    full_name: string;
    phone: string;
    email?: string;
  };
  room?: {
    room_number: string;
  };
}

interface PendingRentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRecordUpdated?: () => void;
}

export function PendingRentModal({ isOpen, onClose, onRecordUpdated }: PendingRentModalProps) {
  const { showToast } = useToast();
  const { pg } = useAuth();
  const [records, setRecords] = React.useState<RentRecordItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [activeFilter, setActiveFilter] = React.useState<'pending' | 'overdue' | 'all' | 'paid'>('pending');
  const [sendingReminderId, setSendingReminderId] = React.useState<string | null>(null);
  const [isSendingAllReminders, setIsSendingAllReminders] = React.useState(false);
  const [updatingStatusId, setUpdatingStatusId] = React.useState<string | null>(null);
  const [selectedInvoiceRecord, setSelectedInvoiceRecord] = React.useState<RentRecordItem | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      loadRentRecords();
    }
  }, [isOpen]);

  async function loadRentRecords() {
    setIsLoading(true);
    try {
      const res = await apiGet<{ data: RentRecordItem[] } | RentRecordItem[]>('/rent/records?limit=100');
      if (res.success && res.data) {
        const raw = res.data;
        const list = Array.isArray(raw) ? raw : (raw as any)?.data || [];
        setRecords(Array.isArray(list) ? list : []);
      }
    } catch (err: any) {
      console.error('Failed to load rent records:', err);
      showToast('Could not load rent records', 'error');
    } finally {
      setIsLoading(false);
    }
  }

  // Mark record as Paid or Unpaid
  async function handleToggleStatus(record: RentRecordItem) {
    const newStatus = record.status === 'paid' ? 'pending' : 'paid';
    setUpdatingStatusId(record.id);

    try {
      const res = await apiPatch(`/rent/${record.id}/status`, { status: newStatus });
      if (res.success) {
        // Optimistically update local list
        setRecords((prev) =>
          prev.map((r) =>
            r.id === record.id
              ? {
                  ...r,
                  status: newStatus,
                  paid_date: newStatus === 'paid' ? new Date().toISOString() : null,
                }
              : r
          )
        );
        showToast(newStatus === 'paid' ? 'Payment marked as Paid!' : 'Rent marked as Unpaid');
        onRecordUpdated?.();
      } else {
        showToast(res.error || 'Failed to update rent status', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error updating rent status', 'error');
    } finally {
      setUpdatingStatusId(null);
    }
  }

  // Send single WhatsApp reminder
  async function handleSendSingleReminder(record: RentRecordItem) {
    setSendingReminderId(record.id);
    try {
      const res = await apiPost(`/rent/${record.id}/send-bill`, {});
      if (res.success) {
        showToast(`WhatsApp reminder sent to ${record.tenant?.full_name || 'tenant'}!`);
      } else {
        showToast(res.error || 'Failed to send WhatsApp reminder', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to send reminder', 'error');
    } finally {
      setSendingReminderId(null);
    }
  }

  // Send reminders to all pending tenants at once
  async function handleSendAllReminders() {
    setIsSendingAllReminders(true);
    try {
      const res = await apiPost<{ sent: number; skippedAlreadySent: number; skippedNoPhone: number }>('/rent/send-reminders', {});
      if (res.success) {
        const stats = res.data;
        showToast(
          `Reminders dispatched! ${stats?.sent ?? 0} sent, ${stats?.skippedAlreadySent ?? 0} already sent today.`
        );
      } else {
        showToast(res.error || 'Failed to dispatch reminders', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to dispatch reminders', 'error');
    } finally {
      setIsSendingAllReminders(false);
    }
  }

  // Computed summary metrics
  const pendingRecords = records.filter((r) => ['pending', 'overdue', 'partially_paid'].includes(r.status));
  const overdueRecords = records.filter((r) => r.status === 'overdue');
  const paidRecords = records.filter((r) => r.status === 'paid');

  const totalPendingPaise = pendingRecords.reduce((sum, r) => sum + (r.total_due_paise || 0), 0);

  // Filtered display list
  const filteredRecords = records.filter((r) => {
    // 1. Tab filter
    if (activeFilter === 'pending' && !['pending', 'overdue', 'partially_paid'].includes(r.status)) {
      return false;
    }
    if (activeFilter === 'overdue' && r.status !== 'overdue') {
      return false;
    }
    if (activeFilter === 'paid' && r.status !== 'paid') {
      return false;
    }

    // 2. Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const name = r.tenant?.full_name?.toLowerCase() || '';
      const phone = r.tenant?.phone?.toLowerCase() || '';
      const room = r.room?.room_number?.toLowerCase() || '';
      return name.includes(q) || phone.includes(q) || room.includes(q);
    }

    return true;
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Pending Rent & Dues"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            Showing <strong>{filteredRecords.length}</strong> record{filteredRecords.length === 1 ? '' : 's'}
          </div>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Top Summary Banner */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 18px',
            backgroundColor: 'rgba(15, 118, 110, 0.08)',
            border: '1px solid rgba(15, 118, 110, 0.25)',
            borderRadius: 'var(--radius-lg)',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Total Pending Rent
            </span>
            <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--color-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {formatCurrency(totalPendingPaise)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              Across {pendingRecords.length} tenant{pendingRecords.length === 1 ? '' : 's'} ({overdueRecords.length} overdue)
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button
              size="sm"
              onClick={handleSendAllReminders}
              isLoading={isSendingAllReminders}
              disabled={pendingRecords.length === 0}
            >
              <Send size={14} /> Send Reminders to All
            </Button>
            <Button size="sm" variant="secondary" onClick={loadRentRecords} isLoading={isLoading} title="Refresh records">
              <RefreshCw size={14} />
            </Button>
          </div>
        </div>

        {/* Search & Tabs Filter Row */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Search Box */}
          <div style={{ position: 'relative' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-text-muted)',
              }}
            />
            <input
              type="text"
              placeholder="Search by tenant name, room number, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 36px',
                fontSize: 'var(--font-size-sm)',
                backgroundColor: 'var(--color-bg-surface-alt)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-text-primary)',
                outline: 'none',
              }}
            />
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
            <button
              onClick={() => setActiveFilter('pending')}
              style={activeFilter === 'pending' ? activePillStyle : inactivePillStyle}
            >
              Pending & Overdue ({pendingRecords.length})
            </button>
            <button
              onClick={() => setActiveFilter('overdue')}
              style={activeFilter === 'overdue' ? activePillStyle : inactivePillStyle}
            >
              Overdue ({overdueRecords.length})
            </button>
            <button
              onClick={() => setActiveFilter('paid')}
              style={activeFilter === 'paid' ? activePillStyle : inactivePillStyle}
            >
              Paid ({paidRecords.length})
            </button>
            <button
              onClick={() => setActiveFilter('all')}
              style={activeFilter === 'all' ? activePillStyle : inactivePillStyle}
            >
              All Records ({records.length})
            </button>
          </div>
        </div>

        {/* Tenant Rent Record List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: '72px', borderRadius: 'var(--radius-md)' }} />
            ))
          ) : filteredRecords.length > 0 ? (
            filteredRecords.map((r) => {
              const isPaid = r.status === 'paid';
              const isOverdue = r.status === 'overdue';
              const isUpdating = updatingStatusId === r.id;
              const isSending = sendingReminderId === r.id;

              return (
                <div
                  key={r.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    padding: '14px 16px',
                    backgroundColor: isPaid ? 'rgba(30, 142, 90, 0.04)' : 'var(--color-bg-surface)',
                    border: `1px solid ${isOverdue ? 'rgba(239, 68, 68, 0.3)' : isPaid ? 'rgba(30, 142, 90, 0.25)' : 'var(--color-border)'}`,
                    borderRadius: 'var(--radius-lg)',
                    transition: 'all 150ms ease',
                  }}
                >
                  {/* Top Details Row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 'var(--font-size-base)', color: 'var(--color-text-primary)' }}>
                          {r.tenant?.full_name || 'Unnamed Tenant'}
                        </span>
                        {r.room?.room_number && (
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '2px 8px',
                              backgroundColor: 'var(--color-bg-surface-alt)',
                              borderRadius: 'var(--radius-full)',
                              color: 'var(--color-text-secondary)',
                            }}
                          >
                            Room {r.room.room_number}
                          </span>
                        )}
                        <Badge variant={getStatusBadgeVariant(r.status)}>
                          {r.status.toUpperCase()}
                        </Badge>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '4px', flexWrap: 'wrap' }}>
                        {r.tenant?.phone && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Phone size={12} />
                            {r.tenant.phone}
                          </span>
                        )}
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Calendar size={12} />
                          {formatMonth(r.month)} (Due: {formatDate(r.due_date)})
                        </span>
                      </div>
                    </div>

                    {/* Amount */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: isPaid ? 'var(--color-success)' : 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(r.total_due_paise || 0)}
                      </div>
                      {isPaid && r.paid_date && (
                        <span style={{ fontSize: '10px', color: 'var(--color-success)', fontWeight: 500 }}>
                          Paid on {formatDate(r.paid_date)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
                    {/* View & Print Official Bill */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedInvoiceRecord(r)}
                      style={{ fontSize: '12px', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
                      title="View & Print Official Bill"
                    >
                      <FileText size={13} />
                      Invoice
                    </Button>

                    {/* WhatsApp Reminder Button */}
                    {!isPaid && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleSendSingleReminder(r)}
                        isLoading={isSending}
                        disabled={!r.tenant?.phone}
                        style={{ fontSize: '12px', padding: '6px 12px' }}
                      >
                        <Send size={13} />
                        Send Reminder
                      </Button>
                    )}

                    {/* Toggle Paid / Unpaid Button */}
                    {isPaid ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleToggleStatus(r)}
                        isLoading={isUpdating}
                        style={{ fontSize: '12px', padding: '6px 12px', color: 'var(--color-warning)' }}
                      >
                        <RotateCcw size={13} />
                        Mark as Unpaid
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleToggleStatus(r)}
                        isLoading={isUpdating}
                        style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: 'var(--color-success)', borderColor: 'var(--color-success)' }}
                      >
                        <Check size={14} />
                        Mark as Paid
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--color-text-secondary)' }}>
              <CheckCircle2 size={36} style={{ color: 'var(--color-success)', margin: '0 auto 10px' }} />
              <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {searchQuery ? 'No matching records found' : 'All clear! No pending rent'}
              </h4>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                {searchQuery ? 'Try clearing or changing your search terms.' : 'All tenants for this period have cleared their dues.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Official Bill Invoice Modal */}
      {selectedInvoiceRecord && (
        <RentInvoiceModal
          isOpen={!!selectedInvoiceRecord}
          onClose={() => setSelectedInvoiceRecord(null)}
          record={selectedInvoiceRecord as any}
          currentPG={pg}
          onSendWhatsApp={handleSendSingleReminder as any}
        />
      )}
    </Modal>
  );
}

const activePillStyle: React.CSSProperties = {
  padding: '5px 12px',
  borderRadius: 'var(--radius-full)',
  backgroundColor: 'var(--color-primary)',
  color: '#ffffff',
  fontSize: '11px',
  fontWeight: 600,
  border: 'none',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const inactivePillStyle: React.CSSProperties = {
  padding: '5px 12px',
  borderRadius: 'var(--radius-full)',
  backgroundColor: 'var(--color-bg-surface-alt)',
  color: 'var(--color-text-secondary)',
  fontSize: '11px',
  fontWeight: 500,
  border: '1px solid var(--color-border)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
