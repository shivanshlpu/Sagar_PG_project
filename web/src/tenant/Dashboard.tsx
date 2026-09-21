import React from 'react';
import { Card } from '../components/ui/Card';
import { Badge, getStatusBadgeVariant } from '../components/ui/Badge';
import { useAuth } from '../hooks/useAuth';
import { apiGet, formatCurrency, formatMonth } from '../lib/api';
import {
  Zap,
  Home,
  ShieldCheck,
  History,
  AlertCircle,
  Info,
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} style={{ color: 'var(--color-success)' }} />
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
            Read-Only Verified Statement
          </span>
        </div>
      </div>

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

            {/* Row 4: Late Fee (if any) */}
            {(current?.late_fee_paise || 0) > 0 && (
              <div style={breakdownRowStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <AlertCircle size={16} style={{ color: 'var(--color-danger)' }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--color-danger)' }}>Late Fee</div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>Overdue payment penalty</div>
                  </div>
                </div>
                <div style={{ fontWeight: 600, color: 'var(--color-danger)', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(current?.late_fee_paise || 0)}
                </div>
              </div>
            )}

            {/* Row 5: Total Summary */}
            <div style={{ ...breakdownRowStyle, backgroundColor: 'var(--color-bg-surface-alt)', borderTop: '2px solid var(--color-border)' }}>
              <div style={{ fontWeight: 700, fontSize: 'var(--font-size-base)' }}>Total Balance Due</div>
              <div style={{ fontWeight: 800, fontSize: 'var(--font-size-md)', color: isPaid ? 'var(--color-success)' : 'var(--color-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(current?.total_due_paise || 0)}
              </div>
            </div>
          </div>
        </div>

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
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Verification / Details</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td style={tdStyle}>{new Date(p.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td style={{ ...tdStyle, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(p.amount_paise)}
                    </td>
                    <td style={{ ...tdStyle, textTransform: 'uppercase' }}>{p.payment_method}</td>
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
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            No payments recorded yet.
          </div>
        )}
      </Card>
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

