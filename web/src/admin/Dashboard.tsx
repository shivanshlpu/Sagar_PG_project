import React from 'react';
import { MetricCard } from '../components/ui/Card';
import { Badge, getStatusBadgeVariant } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { apiGet, formatCurrency, formatDate } from '../lib/api';
import {
  DoorOpen,
  Users,
  Banknote,
  MessageSquareWarning,
  Zap,
  CreditCard,
} from 'lucide-react';

interface DashboardData {
  rooms: { total: number; available: number; full: number };
  tenants: { total: number; active: number };
  rent: { pending: number; pendingAmountPaise: number; overdue: number };
  complaints: { open: number; inProgress: number };
  recentPayments: Array<{
    id: string;
    tenant: { full_name: string };
    amount_paise: number;
    status: string;
    created_at: string;
  }>;
}

export default function AdminDashboard() {
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    setIsLoading(true);
    try {
      // Load multiple endpoints in parallel
      const [roomsRes, tenantsRes, rentRes, complaintsRes, paymentsRes] = await Promise.all([
        apiGet<Array<{ status: string }>>('/rooms'),
        apiGet<Array<{ status: string }>>('/tenants'),
        apiGet<{ data: Array<{ status: string; total_due_paise: number }> }>('/rent/records?limit=100'),
        apiGet<Array<{ status: string }>>('/complaints'),
        apiGet<{ data: Array<{ id: string; tenant: { full_name: string }; amount_paise: number; status: string; created_at: string }> }>('/payments?limit=5'),
      ]);

      const rooms = roomsRes.data || [];
      const tenants = tenantsRes.data || [];
      const rentRecords = (rentRes.data as unknown as { data: Array<{ status: string; total_due_paise: number }> })?.data || rentRes.data || [];
      const complaints = complaintsRes.data || [];
      const payments = (paymentsRes.data as unknown as { data: Array<{ id: string; tenant: { full_name: string }; amount_paise: number; status: string; created_at: string }> })?.data || paymentsRes.data || [];

      const roomsArr = Array.isArray(rooms) ? rooms : [];
      const tenantsArr = Array.isArray(tenants) ? tenants : [];
      const rentArr = Array.isArray(rentRecords) ? rentRecords : [];
      const complaintsArr = Array.isArray(complaints) ? complaints : [];
      const paymentsArr = Array.isArray(payments) ? payments : [];

      setData({
        rooms: {
          total: roomsArr.length,
          available: roomsArr.filter(r => r.status === 'available').length,
          full: roomsArr.filter(r => r.status === 'full').length,
        },
        tenants: {
          total: tenantsArr.length,
          active: tenantsArr.filter(t => t.status === 'active').length,
        },
        rent: {
          pending: rentArr.filter(r => r.status === 'pending').length,
          pendingAmountPaise: rentArr.filter(r => ['pending', 'overdue'].includes(r.status)).reduce((s, r) => s + r.total_due_paise, 0),
          overdue: rentArr.filter(r => r.status === 'overdue').length,
        },
        complaints: {
          open: complaintsArr.filter(c => c.status === 'open').length,
          inProgress: complaintsArr.filter(c => c.status === 'in_progress').length,
        },
        recentPayments: paymentsArr.slice(0, 5) as DashboardData['recentPayments'],
      });
    } catch (err) {
      console.error('Dashboard load failed:', err);
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="page-container">
        <h1 className="page-title">Dashboard</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: '120px', borderRadius: 'var(--radius-lg)' }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Dashboard</h1>

      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: '16px',
        marginBottom: '24px',
      }}>
        <MetricCard
          label="Total Rooms"
          value={data?.rooms.total || 0}
          icon={<DoorOpen size={22} />}
          trend={{ value: `${data?.rooms.available || 0} available`, isPositive: true }}
        />
        <MetricCard
          label="Active Tenants"
          value={data?.tenants.active || 0}
          icon={<Users size={22} />}
          trend={{ value: `${data?.tenants.total || 0} total`, isPositive: true }}
        />
        <MetricCard
          label="Pending Rent"
          value={formatCurrency(data?.rent.pendingAmountPaise || 0)}
          icon={<Banknote size={22} />}
          trend={{
            value: `${data?.rent.overdue || 0} overdue`,
            isPositive: (data?.rent.overdue || 0) === 0,
          }}
        />
        <MetricCard
          label="Rent Pending Count"
          value={data?.rent.pending || 0}
          icon={<CreditCard size={22} />}
        />
        <MetricCard
          label="Open Complaints"
          value={(data?.complaints.open || 0) + (data?.complaints.inProgress || 0)}
          icon={<MessageSquareWarning size={22} />}
          trend={{ value: `${data?.complaints.inProgress || 0} in progress`, isPositive: true }}
        />
        <MetricCard
          label="Rooms Full"
          value={data?.rooms.full || 0}
          icon={<Zap size={22} />}
        />
      </div>

      {/* Recent Payments */}
      <Card>
        <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: '16px', padding: '16px 16px 0' }}>
          Recent Payments
        </h2>
        {data?.recentPayments && data.recentPayments.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Tenant</th>
                <th style={thStyle}>Amount</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Date</th>
              </tr>
            </thead>
            <tbody>
              {data.recentPayments.map((payment) => (
                <tr key={payment.id}>
                  <td style={tdStyle}>{payment.tenant?.full_name || 'N/A'}</td>
                  <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(payment.amount_paise)}</td>
                  <td style={tdStyle}>
                    <Badge variant={getStatusBadgeVariant(payment.status)}>
                      {payment.status}
                    </Badge>
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--color-text-muted)' }}>{formatDate(payment.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            No recent payments
          </div>
        )}
      </Card>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 16px',
  fontSize: 'var(--font-size-sm)',
  fontWeight: 500,
  color: 'var(--color-text-secondary)',
  backgroundColor: 'var(--color-bg-surface-alt)',
  borderBottom: '1px solid var(--color-border)',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: 'var(--font-size-base)',
  borderBottom: '1px solid var(--color-border)',
};
