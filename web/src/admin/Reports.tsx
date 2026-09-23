import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, getStatusBadgeVariant } from '../components/ui/Badge';
import { apiGet, formatCurrency, formatMonth, API_URL, getAccessToken } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { Printer, FileSpreadsheet, Calendar } from 'lucide-react';

interface RevenueData {
  rent: { total_due_paise: number; total_collected_paise: number; total_pending_paise: number; collection_rate: number };
  electricity: { total_billed_paise: number; total_collected_paise: number; total_units_consumed: number };
  total_revenue_paise: number;
  total_pending_paise: number;
}

interface MonthlyBillingRow {
  id: string;
  tenant_id: string;
  tenant_name: string;
  phone: string;
  room_number: string;
  base_rent_paise: number;
  maintenance_paise: number;
  electricity_prev_reading: number | null;
  electricity_curr_reading: number | null;
  electricity_units: number;
  electricity_rate_per_unit_paise: number;
  electricity_amount_paise: number;
  late_fee_paise: number;
  total_due_paise: number;
  status: string;
  due_date: string;
  paid_date: string | null;
}

interface MonthlySummaryData {
  month: string;
  rows: MonthlyBillingRow[];
  summary: {
    total_tenants: number;
    total_base_rent_paise: number;
    total_maintenance_paise: number;
    total_units_consumed: number;
    total_electricity_paise: number;
    total_late_fee_paise: number;
    total_due_paise: number;
    total_collected_paise: number;
    total_pending_paise: number;
    collection_rate: number;
  };
}

const COLORS = ['#0F766E', '#3A6FC1', '#B8790E', '#1E8E5A', '#C13A3A'];

export default function AdminReports() {
  const [data, setData] = React.useState<RevenueData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [selectedMonth, setSelectedMonth] = React.useState(new Date().toISOString().slice(0, 7));
  const [monthlyData, setMonthlyData] = React.useState<MonthlySummaryData | null>(null);
  const [isLoadingMonth, setIsLoadingMonth] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const { showToast } = useToast();

  React.useEffect(() => {
    loadReports();
  }, []);

  React.useEffect(() => {
    loadMonthlySummary(selectedMonth);
  }, [selectedMonth]);

  async function loadReports() {
    setIsLoading(true);
    const res = await apiGet<RevenueData>('/reports/revenue');
    if (res.success && res.data) setData(res.data);
    setIsLoading(false);
  }

  async function loadMonthlySummary(month: string) {
    setIsLoadingMonth(true);
    const res = await apiGet<MonthlySummaryData>(`/reports/monthly-summary?month=${month}`);
    if (res.success && res.data) {
      setMonthlyData(res.data);
    }
    setIsLoadingMonth(false);
  }

  async function handleDownloadCsv() {
    try {
      setIsExporting(true);
      const res = await fetch(`${API_URL}/reports/export?month=${selectedMonth}&format=csv`, {
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
        },
      });

      if (!res.ok) throw new Error('Failed to generate export');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Billing_Report_${selectedMonth}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('Excel/CSV report downloaded successfully');
    } catch (err) {
      showToast((err as Error).message || 'Export failed', 'error');
    } finally {
      setIsExporting(false);
    }
  }

  function handlePrintPdf() {
    window.print();
  }

  if (isLoading) {
    return (
      <div className="page-container">
        <h1 className="page-title">Reports</h1>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton" style={{ height: '200px', borderRadius: 'var(--radius-lg)' }} />)}
        </div>
      </div>
    );
  }

  const barData = [
    { name: 'Rent Collected', value: (data?.rent.total_collected_paise || 0) / 100 },
    { name: 'Rent Pending', value: (data?.rent.total_pending_paise || 0) / 100 },
    { name: 'Electricity', value: (data?.electricity.total_collected_paise || 0) / 100 },
  ];

  const pieData = [
    { name: 'Collected', value: data?.total_revenue_paise || 0 },
    { name: 'Pending', value: data?.total_pending_paise || 0 },
  ];

  return (
    <div className="page-container" id="printable-reports-page">
      {/* Header with Print & Export Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: '4px' }}>Financial & Billing Reports</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Permanent monthly billing records, revenue analysis, and downloadable PDF/Excel reports.
          </p>
        </div>

        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--color-bg-surface-alt)', padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <Calendar size={16} style={{ color: 'var(--color-text-secondary)' }} />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ border: 'none', background: 'transparent', outline: 'none', color: 'var(--color-text-primary)', fontWeight: 600, fontSize: 'var(--font-size-sm)' }}
            />
          </div>

          <Button variant="secondary" onClick={handleDownloadCsv} isLoading={isExporting}>
            <FileSpreadsheet size={16} /> Download Excel (CSV)
          </Button>

          <Button onClick={handlePrintPdf}>
            <Printer size={16} /> Print / Save PDF
          </Button>
        </div>
      </div>

      {/* Global Revenue Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <Card padding="lg">
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Total Revenue</p>
          <p style={{ fontSize: 'var(--font-size-metric)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(data?.total_revenue_paise || 0)}</p>
        </Card>
        <Card padding="lg">
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Total Pending</p>
          <p style={{ fontSize: 'var(--font-size-metric)', fontWeight: 700, color: 'var(--color-warning)', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(data?.total_pending_paise || 0)}</p>
        </Card>
        <Card padding="lg">
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Collection Rate</p>
          <p style={{ fontSize: 'var(--font-size-metric)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{data?.rent.collection_rate || 0}%</p>
        </Card>
        <Card padding="lg">
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Total Electricity Units</p>
          <p style={{ fontSize: 'var(--font-size-metric)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{data?.electricity.total_units_consumed || 0}</p>
        </Card>
      </div>

      {/* Monthly Statement & Records Table */}
      <Card padding="lg" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
              Monthly Billing Records & Statement ({formatMonth(selectedMonth)})
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: '2px' }}>
              Permanent record of room rent, fixed maintenance, electricity consumption, and payment status.
            </p>
          </div>

          {monthlyData?.summary && (
            <div style={{ display: 'flex', gap: '16px', fontSize: 'var(--font-size-sm)' }}>
              <div>
                <span style={{ color: 'var(--color-text-secondary)' }}>Total Due: </span>
                <strong>{formatCurrency(monthlyData.summary.total_due_paise)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-secondary)' }}>Collected: </span>
                <strong style={{ color: 'var(--color-success)' }}>{formatCurrency(monthlyData.summary.total_collected_paise)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-secondary)' }}>Pending: </span>
                <strong style={{ color: 'var(--color-warning)' }}>{formatCurrency(monthlyData.summary.total_pending_paise)}</strong>
              </div>
            </div>
          )}
        </div>

        {isLoadingMonth ? (
          <div className="skeleton" style={{ height: '240px', borderRadius: 'var(--radius-md)' }} />
        ) : monthlyData && monthlyData.rows.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Tenant Name</th>
                  <th style={thStyle}>Room</th>
                  <th style={thStyle}>Base Rent</th>
                  <th style={thStyle}>Maintenance</th>
                  <th style={thStyle}>El. Units</th>
                  <th style={thStyle}>El. Bill</th>
                  <th style={{ ...thStyle, fontWeight: 700 }}>Total Due</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Payment Date</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.rows.map((row) => (
                  <tr key={row.id}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600 }}>{row.tenant_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{row.phone}</div>
                    </td>
                    <td style={tdStyle}>Room {row.room_number}</td>
                    <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(row.base_rent_paise)}</td>
                    <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(row.maintenance_paise)}</td>
                    <td style={tdStyle}>
                      <div>{row.electricity_units} units</div>
                      {row.electricity_curr_reading !== null && (
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                          ({row.electricity_prev_reading} → {row.electricity_curr_reading})
                        </div>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(row.electricity_amount_paise)}</td>
                    <td style={{ ...tdStyle, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--color-primary)' }}>
                      {formatCurrency(row.total_due_paise)}
                    </td>
                    <td style={tdStyle}>
                      <Badge variant={getStatusBadgeVariant(row.status)}>{row.status}</Badge>
                    </td>
                    <td style={{ ...tdStyle, fontSize: 'var(--font-size-xs)' }}>
                      {row.paid_date ? new Date(row.paid_date).toLocaleDateString('en-IN') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: 'var(--color-bg-surface-alt)', fontWeight: 700 }}>
                  <td style={tdStyle}>Total ({monthlyData.summary.total_tenants} Tenants)</td>
                  <td style={tdStyle}>-</td>
                  <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(monthlyData.summary.total_base_rent_paise)}</td>
                  <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(monthlyData.summary.total_maintenance_paise)}</td>
                  <td style={tdStyle}>{monthlyData.summary.total_units_consumed} units</td>
                  <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(monthlyData.summary.total_electricity_paise)}</td>
                  <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums', color: 'var(--color-primary)' }}>{formatCurrency(monthlyData.summary.total_due_paise)}</td>
                  <td style={tdStyle} colSpan={2}>
                    <span style={{ color: 'var(--color-success)' }}>Collected: {formatCurrency(monthlyData.summary.total_collected_paise)}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            No rent or electricity billing records generated for {formatMonth(selectedMonth)}.
          </div>
        )}
      </Card>

      {/* Visual Revenue Breakdown Charts — Stacked vertically for clear visibility */}
      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
        <Card padding="lg">
          <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: '16px' }}>Revenue Breakdown</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={barData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 13, fill: 'var(--color-text-secondary)' }} />
              <YAxis tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }} />
              <Tooltip formatter={(value: any) => `₹${Number(value || 0).toLocaleString('en-IN')}`} />
              <Bar dataKey="value" fill="var(--color-primary)" radius={[4, 4, 0, 0]} barSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card padding="lg">
          <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: '16px' }}>Collection Status</h3>
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="48%"
                outerRadius={110}
                label={({ name, value }: any) => `${name}: ${formatCurrency(Number(value || 0))}`}
              >
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip formatter={(value: any) => formatCurrency(Number(value || 0))} />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 14px',
  fontSize: 'var(--font-size-xs)',
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  backgroundColor: 'var(--color-bg-surface-alt)',
  borderBottom: '1px solid var(--color-border)',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderBottom: '1px solid var(--color-border)',
};

