import React from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
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
  Megaphone,
  Package,
  BarChart3,
  Settings,
  Bot,
  ArrowRight,
} from 'lucide-react';
import { AIAssistantModal } from '../components/ai/AIAssistantModal';

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
  const navigate = useNavigate();
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isAIOpen, setIsAIOpen] = React.useState(false);

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

      {/* All Features & Modules Quick Access */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, margin: 0, color: 'var(--color-text-primary)' }}>
              All Features & Modules
            </h2>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
              Direct 1-tap access to all management tools
            </p>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(105px, 1fr))',
          gap: '10px',
        }}>
          {[
            { title: 'Tenants', to: '/admin/tenants', icon: Users, badge: `${data?.tenants.active || 0} active`, color: 'var(--color-primary)' },
            { title: 'Rooms & Beds', to: '/admin/rooms', icon: DoorOpen, badge: `${data?.rooms.available || 0} open`, color: '#0284c7' },
            { title: 'Rent', to: '/admin/rent', icon: Banknote, badge: `${data?.rent.pending || 0} due`, color: '#16a34a' },
            { title: 'Electricity', to: '/admin/electricity', icon: Zap, color: '#d97706' },
            { title: 'Payments', to: '/admin/payments', icon: CreditCard, color: '#7c3aed' },
            { title: 'Complaints', to: '/admin/complaints', icon: MessageSquareWarning, badge: `${(data?.complaints.open || 0) + (data?.complaints.inProgress || 0)} open`, color: '#e11d48' },
            { title: 'Announcements', to: '/admin/announcements', icon: Megaphone, color: '#0d9488' },
            { title: 'Assets', to: '/admin/assets', icon: Package, color: '#4b5563' },
            { title: 'Reports', to: '/admin/reports', icon: BarChart3, color: '#2563eb' },
            { title: 'Settings', to: '/admin/settings', icon: Settings, color: '#475569' },
            { title: 'PG AI', onClick: () => setIsAIOpen(true), icon: Bot, badge: 'Smart AI', color: 'var(--color-primary)', isHighlight: true },
          ].map((m) => (
            <button
              key={m.title}
              onClick={() => m.onClick ? m.onClick() : m.to ? navigate(m.to) : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '12px 6px',
                backgroundColor: m.isHighlight ? 'rgba(15, 118, 110, 0.07)' : 'var(--color-bg-surface)',
                border: m.isHighlight ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                gap: '6px',
                textAlign: 'center',
              }}
            >
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                backgroundColor: m.isHighlight ? 'var(--color-primary)' : 'var(--color-bg-surface-alt)',
                color: m.isHighlight ? '#ffffff' : m.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <m.icon size={19} />
              </div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.2 }}>
                {m.title}
              </span>
              {m.badge && (
                <span style={{
                  fontSize: '9px',
                  fontWeight: 500,
                  color: m.isHighlight ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  lineHeight: 1,
                }}>
                  {m.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Recent Payments */}
      <Card padding="sm" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <div>
            <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, margin: 0 }}>
              Recent Payments
            </h2>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
              Latest transactions recorded across tenants
            </p>
          </div>
          <NavLink
            to="/admin/payments"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-primary)',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            <span>View All</span>
            <ArrowRight size={14} />
          </NavLink>
        </div>

        {data?.recentPayments && data.recentPayments.length > 0 ? (
          <>
            {/* Mobile View: Clean Transaction List (fits 100% of any phone width without getting cut off) */}
            <div className="mobile-payment-list">
              {data.recentPayments.map((payment) => (
                <div
                  key={payment.id}
                  onClick={() => navigate('/admin/payments')}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--color-border)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1, paddingRight: '12px' }}>
                    <div style={{
                      fontWeight: 600,
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {payment.tenant?.full_name || 'N/A'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                      {formatDate(payment.created_at)}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{
                      fontWeight: 700,
                      fontSize: 'var(--font-size-sm)',
                      fontVariantNumeric: 'tabular-nums',
                      color: 'var(--color-text-primary)',
                    }}>
                      {formatCurrency(payment.amount_paise)}
                    </div>
                    <div style={{ marginTop: '3px' }}>
                      <Badge variant={getStatusBadgeVariant(payment.status)}>
                        {payment.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop View: Full Table with smooth horizontal scroll wrapper */}
            <div className="desktop-payment-table" style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', minWidth: '480px', borderCollapse: 'collapse' }}>
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
                      <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {formatCurrency(payment.amount_paise)}
                      </td>
                      <td style={tdStyle}>
                        <Badge variant={getStatusBadgeVariant(payment.status)}>
                          {payment.status}
                        </Badge>
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                        {formatDate(payment.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            No recent payments
          </div>
        )}
      </Card>

      {/* AIAssistantModal */}
      <AIAssistantModal isOpen={isAIOpen} onClose={() => setIsAIOpen(false)} />
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
