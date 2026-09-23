import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, getStatusBadgeVariant } from '../components/ui/Badge';
import { apiGet, formatCurrency, formatMonth } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { Printer, FileSpreadsheet, Calendar, Search, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { printElement } from '../lib/printHelper';

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

type DateFilterMode = 'month' | 'exact_date' | 'date_range';
type DateFieldType = 'any' | 'paid_date' | 'due_date';
type StatusFilterType = 'all' | 'paid' | 'pending' | 'overdue';

const COLORS = ['#0F766E', '#3A6FC1', '#B8790E', '#1E8E5A', '#C13A3A'];

export default function AdminReports() {
  const { pg, pgName } = useAuth();
  const [data, setData] = React.useState<RevenueData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [selectedMonth, setSelectedMonth] = React.useState(new Date().toISOString().slice(0, 7));
  const [monthlyData, setMonthlyData] = React.useState<MonthlySummaryData | null>(null);
  const [isLoadingMonth, setIsLoadingMonth] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const { showToast } = useToast();

  // Filters State
  const [dateFilterMode, setDateFilterMode] = React.useState<DateFilterMode>('month');
  const [selectedDate, setSelectedDate] = React.useState<string>(new Date().toISOString().slice(0, 10));
  const [dateFrom, setDateFrom] = React.useState<string>('');
  const [dateTo, setDateTo] = React.useState<string>('');
  const [dateField, setDateField] = React.useState<DateFieldType>('any');
  const [statusFilter, setStatusFilter] = React.useState<StatusFilterType>('all');
  const [searchQuery, setSearchQuery] = React.useState<string>('');

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

  function handleExactDateChange(dateStr: string) {
    setSelectedDate(dateStr);
    if (dateStr && dateStr.length >= 7) {
      const targetMonth = dateStr.slice(0, 7);
      if (targetMonth !== selectedMonth) {
        setSelectedMonth(targetMonth);
      }
    }
  }

  function handleSetToday() {
    const today = new Date().toISOString().slice(0, 10);
    handleExactDateChange(today);
  }

  function handleClearFilters() {
    setDateFilterMode('month');
    setSelectedDate(new Date().toISOString().slice(0, 10));
    setDateFrom('');
    setDateTo('');
    setDateField('any');
    setStatusFilter('all');
    setSearchQuery('');
  }

  const isFilterActive =
    dateFilterMode !== 'month' ||
    statusFilter !== 'all' ||
    searchQuery.trim().length > 0;

  // Filter rows dynamically
  const filteredRows = React.useMemo(() => {
    if (!monthlyData?.rows) return [];
    return monthlyData.rows.filter((row) => {
      // 1. Status Filter
      if (statusFilter !== 'all' && row.status.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }

      // 2. Search Query (tenant name, room, phone)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = (row.tenant_name || '').toLowerCase().includes(q);
        const matchRoom = (row.room_number || '').toLowerCase().includes(q);
        const matchPhone = (row.phone || '').toLowerCase().includes(q);
        if (!matchName && !matchRoom && !matchPhone) return false;
      }

      // 3. Date Filters
      const paidDateStr = row.paid_date ? row.paid_date.slice(0, 10) : null;
      const dueDateStr = row.due_date ? row.due_date.slice(0, 10) : null;

      if (dateFilterMode === 'exact_date' && selectedDate) {
        if (dateField === 'paid_date') {
          return paidDateStr === selectedDate;
        } else if (dateField === 'due_date') {
          return dueDateStr === selectedDate;
        } else {
          return paidDateStr === selectedDate || dueDateStr === selectedDate;
        }
      }

      if (dateFilterMode === 'date_range') {
        const checkDate =
          dateField === 'paid_date'
            ? paidDateStr
            : dateField === 'due_date'
            ? dueDateStr
            : paidDateStr || dueDateStr;

        if (!checkDate) return false;
        if (dateFrom && checkDate < dateFrom) return false;
        if (dateTo && checkDate > dateTo) return false;
      }

      return true;
    });
  }, [monthlyData, statusFilter, searchQuery, dateFilterMode, selectedDate, dateFrom, dateTo, dateField]);

  // Recalculate summary metrics for the filtered set
  const filteredSummary = React.useMemo(() => {
    const totalDue = filteredRows.reduce((acc, r) => acc + (r.total_due_paise || 0), 0);
    const totalCollected = filteredRows
      .filter((r) => r.status.toLowerCase() === 'paid')
      .reduce((acc, r) => acc + (r.total_due_paise || 0), 0);
    const totalPending = filteredRows
      .filter((r) => ['pending', 'overdue'].includes(r.status.toLowerCase()))
      .reduce((acc, r) => acc + (r.total_due_paise || 0), 0);
    const totalBaseRent = filteredRows.reduce((acc, r) => acc + (r.base_rent_paise || 0), 0);
    const totalMaintenance = filteredRows.reduce((acc, r) => acc + (r.maintenance_paise || 0), 0);
    const totalUnits = filteredRows.reduce((acc, r) => acc + (r.electricity_units || 0), 0);
    const totalElectricity = filteredRows.reduce((acc, r) => acc + (r.electricity_amount_paise || 0), 0);

    return {
      total_tenants: filteredRows.length,
      total_base_rent_paise: totalBaseRent,
      total_maintenance_paise: totalMaintenance,
      total_units_consumed: totalUnits,
      total_electricity_paise: totalElectricity,
      total_due_paise: totalDue,
      total_collected_paise: totalCollected,
      total_pending_paise: totalPending,
      collection_rate: totalDue > 0 ? Math.round((totalCollected / totalDue) * 100) : 0,
    };
  }, [filteredRows]);

  const statementPeriodLabel = React.useMemo(() => {
    if (dateFilterMode === 'exact_date' && selectedDate) {
      try {
        return new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        });
      } catch {
        return selectedDate;
      }
    }
    if (dateFilterMode === 'date_range' && (dateFrom || dateTo)) {
      const fromStr = dateFrom
        ? new Date(dateFrom + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : 'Beginning';
      const toStr = dateTo
        ? new Date(dateTo + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : 'Current';
      return `${fromStr} to ${toStr}`;
    }
    return formatMonth(selectedMonth);
  }, [dateFilterMode, selectedDate, dateFrom, dateTo, selectedMonth]);

  // Export filtered CSV (client-side generation for 100% filter consistency)
  function handleDownloadCsv() {
    try {
      setIsExporting(true);
      const toRupees = (paise: number) => (paise / 100).toFixed(2);
      const escapeCsv = (str: any) => {
        if (str === null || str === undefined) return '""';
        const s = String(str).replace(/"/g, '""');
        return `"${s}"`;
      };

      const lines: string[] = [];
      lines.push(`"${(pg?.name || pgName || 'PG').replace(/"/g, '""')} - Billing & Statement Report"`);
      lines.push(`"Statement Period: ${statementPeriodLabel}"`);
      lines.push(`"Generated On: ${new Date().toLocaleString('en-IN')}"`);
      lines.push('');

      lines.push(
        [
          '#',
          'Tenant Name',
          'Phone',
          'Room Number',
          'Base Rent (Rs.)',
          'Maintenance (Rs.)',
          'Electricity Units (kWh)',
          'Electricity Bill (Rs.)',
          'Total Due (Rs.)',
          'Status',
          'Payment Date',
        ]
          .map(escapeCsv)
          .join(',')
      );

      filteredRows.forEach((r, idx) => {
        lines.push(
          [
            idx + 1,
            r.tenant_name,
            r.phone,
            `Room ${r.room_number}`,
            toRupees(r.base_rent_paise),
            toRupees(r.maintenance_paise),
            r.electricity_units,
            toRupees(r.electricity_amount_paise),
            toRupees(r.total_due_paise),
            r.status.toUpperCase(),
            r.paid_date ? new Date(r.paid_date).toLocaleDateString('en-IN') : (r.due_date ? `Due: ${new Date(r.due_date).toLocaleDateString('en-IN')}` : '-'),
          ]
            .map(escapeCsv)
            .join(',')
        );
      });

      lines.push('');
      lines.push(
        [
          'TOTALS',
          `${filteredSummary.total_tenants} Invoices`,
          '',
          '',
          toRupees(filteredSummary.total_base_rent_paise),
          toRupees(filteredSummary.total_maintenance_paise),
          filteredSummary.total_units_consumed,
          toRupees(filteredSummary.total_electricity_paise),
          toRupees(filteredSummary.total_due_paise),
          `Collected: Rs. ${toRupees(filteredSummary.total_collected_paise)} | Pending: Rs. ${toRupees(filteredSummary.total_pending_paise)}`,
          '',
        ]
          .map(escapeCsv)
          .join(',')
      );

      const csvContent = '\uFEFF' + lines.join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cleanPgName = (pg?.name || pgName || 'PG').replace(/[^a-zA-Z0-9]/g, '_');
      a.download = `Statement_${cleanPgName}_${selectedMonth}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('Filtered Statement CSV downloaded successfully');
    } catch (err) {
      showToast((err as Error).message || 'Export failed', 'error');
    } finally {
      setIsExporting(false);
    }
  }

  function handlePrintPdf() {
    const cleanPgName = (pg?.name || pgName || 'PG').replace(/[^a-zA-Z0-9]/g, '_');
    printElement(
      'printable-statement-report',
      `Billing_Statement_${cleanPgName}_${selectedMonth}`,
      {
        orientation: 'landscape',
        maxWidth: '100%',
        margin: '8mm 10mm',
      }
    );
  }

  if (isLoading) {
    return (
      <div className="page-container">
        <h1 className="page-title">Reports</h1>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: '200px', borderRadius: 'var(--radius-lg)' }} />
          ))}
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className="page-title" style={{ marginBottom: '4px' }}>
              Financial & Billing Reports
            </h1>
            {pg?.name && (
              <span
                style={{
                  fontSize: 'var(--font-size-xs)',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--color-primary-light)',
                  color: 'var(--color-primary)',
                  fontWeight: 600,
                }}
              >
                {pg.name}
              </span>
            )}
          </div>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Official billing ledger, revenue analysis, custom date filters, and corporate PDF statements.
          </p>
        </div>

        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'var(--color-bg-surface-alt)',
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
            }}
          >
            <Calendar size={16} style={{ color: 'var(--color-text-secondary)' }} />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                outline: 'none',
                color: 'var(--color-text-primary)',
                fontWeight: 600,
                fontSize: 'var(--font-size-sm)',
                cursor: 'pointer',
              }}
              title="Select Month"
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
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <Card padding="lg">
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
            Total Revenue
          </p>
          <p style={{ fontSize: 'var(--font-size-metric)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(data?.total_revenue_paise || 0)}
          </p>
        </Card>
        <Card padding="lg">
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
            Total Pending
          </p>
          <p
            style={{
              fontSize: 'var(--font-size-metric)',
              fontWeight: 700,
              color: 'var(--color-warning)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatCurrency(data?.total_pending_paise || 0)}
          </p>
        </Card>
        <Card padding="lg">
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
            Collection Rate
          </p>
          <p style={{ fontSize: 'var(--font-size-metric)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {data?.rent.collection_rate || 0}%
          </p>
        </Card>
        <Card padding="lg">
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
            Total Electricity Units
          </p>
          <p style={{ fontSize: 'var(--font-size-metric)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {data?.electricity.total_units_consumed || 0}
          </p>
        </Card>
      </div>

      {/* Multi-Mode Date & Parameter Filter Controls Bar */}
      <Card padding="lg" style={{ marginBottom: '24px', border: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Row 1: Filter Mode Selector & Date Inputs */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Filter Period:
              </span>

              {/* Mode Segmented Buttons */}
              <div
                style={{
                  display: 'flex',
                  backgroundColor: 'var(--color-bg-surface-alt)',
                  borderRadius: 'var(--radius-md)',
                  padding: '3px',
                  border: '1px solid var(--color-border)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setDateFilterMode('month')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: dateFilterMode === 'month' ? 700 : 500,
                    border: 'none',
                    backgroundColor: dateFilterMode === 'month' ? 'var(--color-primary)' : 'transparent',
                    color: dateFilterMode === 'month' ? '#ffffff' : 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Entire Month
                </button>
                <button
                  type="button"
                  onClick={() => setDateFilterMode('exact_date')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: dateFilterMode === 'exact_date' ? 700 : 500,
                    border: 'none',
                    backgroundColor: dateFilterMode === 'exact_date' ? 'var(--color-primary)' : 'transparent',
                    color: dateFilterMode === 'exact_date' ? '#ffffff' : 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Specific Date
                </button>
                <button
                  type="button"
                  onClick={() => setDateFilterMode('date_range')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: dateFilterMode === 'date_range' ? 700 : 500,
                    border: 'none',
                    backgroundColor: dateFilterMode === 'date_range' ? 'var(--color-primary)' : 'transparent',
                    color: dateFilterMode === 'date_range' ? '#ffffff' : 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Date Range
                </button>
              </div>

              {/* Exact Date Picker Input */}
              {dateFilterMode === 'exact_date' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => handleExactDateChange(e.target.value)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-bg-surface-alt)',
                      color: 'var(--color-text-primary)',
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 600,
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSetToday}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-bg-surface-alt)',
                      color: 'var(--color-text-primary)',
                      fontSize: 'var(--font-size-xs)',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    Today
                  </button>
                </div>
              )}

              {/* Date Range Inputs */}
              {dateFilterMode === 'date_range' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>From:</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-bg-surface-alt)',
                      color: 'var(--color-text-primary)',
                      fontSize: 'var(--font-size-sm)',
                    }}
                  />
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>To:</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-bg-surface-alt)',
                      color: 'var(--color-text-primary)',
                      fontSize: 'var(--font-size-sm)',
                    }}
                  />
                </div>
              )}

              {/* Date Target Selector (Only relevant for exact date & date range) */}
              {dateFilterMode !== 'month' && (
                <select
                  value={dateField}
                  onChange={(e) => setDateField(e.target.value as DateFieldType)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-surface-alt)',
                    color: 'var(--color-text-primary)',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <option value="any">Paid OR Due Date</option>
                  <option value="paid_date">Payment Date Only</option>
                  <option value="due_date">Due Date Only</option>
                </select>
              )}
            </div>

            {/* Clear Filters Button */}
            {isFilterActive && (
              <button
                type="button"
                onClick={handleClearFilters}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'transparent',
                  color: 'var(--color-danger, #ef4444)',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <X size={14} /> Reset Filters
              </button>
            )}
          </div>

          {/* Row 2: Search Input & Status Filter Pills */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 300px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: 'var(--color-bg-surface-alt)',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  width: '100%',
                  maxWidth: '380px',
                }}
              >
                <Search size={16} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Search tenant, room, or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    outline: 'none',
                    color: 'var(--color-text-primary)',
                    fontSize: 'var(--font-size-sm)',
                    width: '100%',
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Status Quick Filter Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                Status:
              </span>
              {(['all', 'paid', 'pending', 'overdue'] as StatusFilterType[]).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: statusFilter === status ? 700 : 500,
                    border: statusFilter === status ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                    backgroundColor: statusFilter === status ? 'var(--color-primary-light, #e0f2fe)' : 'transparent',
                    color: statusFilter === status ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {status === 'all' ? 'All Invoices' : status}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Monthly Statement & Records Table */}
      <Card padding="lg" style={{ marginBottom: '24px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
                Billing Records & Statement ({statementPeriodLabel})
              </h2>
              {isFilterActive && (
                <span
                  style={{
                    fontSize: '11px',
                    backgroundColor: 'var(--color-primary-light)',
                    color: 'var(--color-primary)',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    fontWeight: 700,
                  }}
                >
                  Filtered ({filteredRows.length} of {monthlyData?.rows.length || 0})
                </span>
              )}
            </div>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: '2px' }}>
              Itemized room rent, fixed maintenance, electricity consumption, and payment tracking.
            </p>
          </div>

          {filteredSummary && (
            <div style={{ display: 'flex', gap: '16px', fontSize: 'var(--font-size-sm)', flexWrap: 'wrap' }}>
              <div>
                <span style={{ color: 'var(--color-text-secondary)' }}>Total Due: </span>
                <strong>{formatCurrency(filteredSummary.total_due_paise)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-secondary)' }}>Collected: </span>
                <strong style={{ color: 'var(--color-success)' }}>{formatCurrency(filteredSummary.total_collected_paise)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-secondary)' }}>Pending: </span>
                <strong style={{ color: 'var(--color-warning)' }}>{formatCurrency(filteredSummary.total_pending_paise)}</strong>
              </div>
            </div>
          )}
        </div>

        {isLoadingMonth ? (
          <div className="skeleton" style={{ height: '240px', borderRadius: 'var(--radius-md)' }} />
        ) : filteredRows.length > 0 ? (
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
                {filteredRows.map((row) => (
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
                      {row.paid_date
                        ? new Date(row.paid_date).toLocaleDateString('en-IN')
                        : row.due_date
                        ? `Due: ${new Date(row.due_date).toLocaleDateString('en-IN')}`
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: 'var(--color-bg-surface-alt)', fontWeight: 700 }}>
                  <td style={tdStyle}>Total ({filteredSummary.total_tenants} Invoices)</td>
                  <td style={tdStyle}>-</td>
                  <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(filteredSummary.total_base_rent_paise)}</td>
                  <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(filteredSummary.total_maintenance_paise)}</td>
                  <td style={tdStyle}>{filteredSummary.total_units_consumed} units</td>
                  <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(filteredSummary.total_electricity_paise)}</td>
                  <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums', color: 'var(--color-primary)' }}>
                    {formatCurrency(filteredSummary.total_due_paise)}
                  </td>
                  <td style={tdStyle} colSpan={2}>
                    <span style={{ color: 'var(--color-success)' }}>
                      Collected: {formatCurrency(filteredSummary.total_collected_paise)}
                    </span>
                    {filteredSummary.total_pending_paise > 0 && (
                      <span style={{ color: 'var(--color-warning)', marginLeft: '12px' }}>
                        Pending: {formatCurrency(filteredSummary.total_pending_paise)}
                      </span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            No rent or electricity billing records match the current filters for {statementPeriodLabel}.
          </div>
        )}
      </Card>

      {/* Visual Revenue Breakdown Charts */}
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
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any) => formatCurrency(Number(value || 0))} />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* ========================================================================= */}
      {/* Dedicated Enterprise-Grade PDF Statement Report (Used for PDF generation) */}
      {/* ========================================================================= */}
      <div id="printable-statement-report" style={{ display: 'none' }}>
        <div
          style={{
            width: '100%',
            backgroundColor: '#ffffff',
            color: '#0f172a',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            padding: '4px',
          }}
        >
          {/* Official PG Corporate Letterhead */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              borderBottom: '2.5px solid #0f172a',
              paddingBottom: '16px',
              marginBottom: '16px',
            }}
          >
            {/* Left: Emblem & Property Physical Address */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', maxWidth: '62%' }}>
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '10px',
                  backgroundColor: '#0f766e',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontWeight: 800,
                  fontSize: '22px',
                  border: '2px solid #115e59',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
                }}
              >
                {(pg?.name || pgName || 'PG').charAt(0).toUpperCase()}
              </div>
              <div>
                <div
                  style={{
                    fontSize: '22px',
                    fontWeight: 800,
                    color: '#0f172a',
                    letterSpacing: '0.02em',
                    textTransform: 'uppercase',
                    lineHeight: 1.15,
                  }}
                >
                  {pg?.name || pgName || 'PG RESIDENCY & HOSTEL'}
                </div>
                <div style={{ fontSize: '11px', color: '#334155', marginTop: '5px', lineHeight: 1.4 }}>
                  {pg?.address || 'Official Property Premises'}
                  {pg?.city ? `, ${pg.city}` : ''}
                  {pg?.state ? `, ${pg.state}` : ''}
                  {pg?.pincode ? ` - ${pg.pincode}` : ''}
                </div>
                <div style={{ fontSize: '11px', color: '#475569', marginTop: '3px' }}>
                  {pg?.phone ? <span><strong>Phone:</strong> {pg.phone} &nbsp;|&nbsp; </span> : null}
                  {pg?.email ? <span><strong>Email:</strong> {pg.email} &nbsp;|&nbsp; </span> : null}
                  {pg?.upi_id ? <span><strong>UPI ID:</strong> {pg.upi_id}</span> : null}
                </div>
              </div>
            </div>

            {/* Right: Statement Identification & Timestamps */}
            <div style={{ textAlign: 'right', minWidth: '240px' }}>
              <div
                style={{
                  fontSize: '18px',
                  fontWeight: 800,
                  color: '#0f766e',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                OFFICIAL STATEMENT
              </div>
              <div style={{ fontSize: '11px', color: '#334155', marginTop: '4px' }}>
                <strong>REF NO:</strong> STMT-{(selectedMonth || '').replace('-', '')}-{String(filteredRows.length).padStart(3, '0')}
              </div>
              <div style={{ fontSize: '11px', color: '#334155', marginTop: '2px' }}>
                <strong>STATEMENT PERIOD:</strong> {statementPeriodLabel}
              </div>
              <div style={{ fontSize: '11px', color: '#334155', marginTop: '2px' }}>
                <strong>GENERATED ON:</strong>{' '}
                {new Date().toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          </div>

          {/* Executive Financial Summary Metric Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '12px',
              marginBottom: '18px',
            }}
          >
            <div
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                padding: '10px 14px',
                backgroundColor: '#f8fafc',
              }}
            >
              <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.05em' }}>
                TOTAL BILLED
              </div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a', marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(filteredSummary.total_due_paise)}
              </div>
              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                {filteredSummary.total_tenants} Invoices Generated
              </div>
            </div>

            <div
              style={{
                border: '1px solid #bbf7d0',
                borderRadius: '6px',
                padding: '10px 14px',
                backgroundColor: '#f0fdf4',
              }}
            >
              <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#166534', fontWeight: 700, letterSpacing: '0.05em' }}>
                TOTAL COLLECTED
              </div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: '#16a34a', marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(filteredSummary.total_collected_paise)}
              </div>
              <div style={{ fontSize: '10px', color: '#166534', marginTop: '2px' }}>
                {filteredSummary.collection_rate}% Collection Realization
              </div>
            </div>

            <div
              style={{
                border: '1px solid #fed7aa',
                borderRadius: '6px',
                padding: '10px 14px',
                backgroundColor: '#fffbeb',
              }}
            >
              <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#92400e', fontWeight: 700, letterSpacing: '0.05em' }}>
                PENDING ARREARS
              </div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: '#d97706', marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(filteredSummary.total_pending_paise)}
              </div>
              <div style={{ fontSize: '10px', color: '#92400e', marginTop: '2px' }}>
                {filteredRows.filter((r) => ['pending', 'overdue'].includes(r.status.toLowerCase())).length} Unsettled Accounts
              </div>
            </div>

            <div
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                padding: '10px 14px',
                backgroundColor: '#f8fafc',
              }}
            >
              <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.05em' }}>
                POWER CONSUMPTION
              </div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a', marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>
                {filteredSummary.total_units_consumed} kWh
              </div>
              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                Billed: {formatCurrency(filteredSummary.total_electricity_paise)}
              </div>
            </div>
          </div>

          {/* Itemized Accounting Ledger Table */}
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              marginBottom: '20px',
              fontSize: '10.5px',
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
                <th style={{ padding: '8px 6px', textAlign: 'center', width: '32px', fontSize: '10px', fontWeight: 700, border: '1px solid #0f172a' }}>#</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '10px', fontWeight: 700, border: '1px solid #0f172a' }}>TENANT NAME & CONTACT</th>
                <th style={{ padding: '8px 8px', textAlign: 'center', fontSize: '10px', fontWeight: 700, border: '1px solid #0f172a' }}>ROOM</th>
                <th style={{ padding: '8px 8px', textAlign: 'right', fontSize: '10px', fontWeight: 700, border: '1px solid #0f172a' }}>BASE RENT</th>
                <th style={{ padding: '8px 8px', textAlign: 'right', fontSize: '10px', fontWeight: 700, border: '1px solid #0f172a' }}>MAINTENANCE</th>
                <th style={{ padding: '8px 8px', textAlign: 'center', fontSize: '10px', fontWeight: 700, border: '1px solid #0f172a' }}>UNITS</th>
                <th style={{ padding: '8px 8px', textAlign: 'right', fontSize: '10px', fontWeight: 700, border: '1px solid #0f172a' }}>ELECTRICITY</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '10px', fontWeight: 800, border: '1px solid #0f172a' }}>TOTAL DUE</th>
                <th style={{ padding: '8px 8px', textAlign: 'center', fontSize: '10px', fontWeight: 700, border: '1px solid #0f172a' }}>STATUS</th>
                <th style={{ padding: '8px 8px', textAlign: 'center', fontSize: '10px', fontWeight: 700, border: '1px solid #0f172a' }}>SETTLEMENT DATE</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, idx) => (
                <tr
                  key={row.id}
                  style={{
                    backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                    pageBreakInside: 'avoid',
                  }}
                >
                  <td style={{ padding: '6px', textAlign: 'center', border: '1px solid #e2e8f0', color: '#64748b' }}>
                    {idx + 1}
                  </td>
                  <td style={{ padding: '6px 10px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{row.tenant_name}</div>
                    <div style={{ fontSize: '9.5px', color: '#64748b' }}>{row.phone}</div>
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600, border: '1px solid #e2e8f0', color: '#1e293b' }}>
                    Room {row.room_number}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', border: '1px solid #e2e8f0', fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(row.base_rent_paise)}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', border: '1px solid #e2e8f0', fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(row.maintenance_paise)}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontWeight: 600 }}>{row.electricity_units}</div>
                    {row.electricity_curr_reading !== null && (
                      <div style={{ fontSize: '9px', color: '#94a3b8' }}>
                        ({row.electricity_prev_reading}→{row.electricity_curr_reading})
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', border: '1px solid #e2e8f0', fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(row.electricity_amount_paise)}
                  </td>
                  <td
                    style={{
                      padding: '6px 10px',
                      textAlign: 'right',
                      fontWeight: 800,
                      border: '1px solid #e2e8f0',
                      color: '#0f172a',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatCurrency(row.total_due_paise)}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '9.5px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        border:
                          row.status.toLowerCase() === 'paid'
                            ? '1px solid #86efac'
                            : row.status.toLowerCase() === 'overdue'
                            ? '1px solid #fca5a5'
                            : '1px solid #fde68a',
                        backgroundColor:
                          row.status.toLowerCase() === 'paid'
                            ? '#f0fdf4'
                            : row.status.toLowerCase() === 'overdue'
                            ? '#fef2f2'
                            : '#fffbeb',
                        color:
                          row.status.toLowerCase() === 'paid'
                            ? '#15803d'
                            : row.status.toLowerCase() === 'overdue'
                            ? '#b91c1c'
                            : '#b45309',
                      }}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center', border: '1px solid #e2e8f0', fontSize: '9.5px', color: '#334155' }}>
                    {row.paid_date
                      ? new Date(row.paid_date).toLocaleDateString('en-IN')
                      : row.due_date
                      ? `Due: ${new Date(row.due_date).toLocaleDateString('en-IN')}`
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr
                style={{
                  backgroundColor: '#f1f5f9',
                  fontWeight: 800,
                  borderTop: '2.5px solid #0f172a',
                  borderBottom: '2.5px solid #0f172a',
                }}
              >
                <td colSpan={3} style={{ padding: '8px 10px', textAlign: 'left', border: '1px solid #cbd5e1', fontSize: '10.5px' }}>
                  STATEMENT TOTALS ({filteredSummary.total_tenants} Invoices)
                </td>
                <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #cbd5e1', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(filteredSummary.total_base_rent_paise)}
                </td>
                <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #cbd5e1', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(filteredSummary.total_maintenance_paise)}
                </td>
                <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #cbd5e1' }}>
                  {filteredSummary.total_units_consumed} kWh
                </td>
                <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #cbd5e1', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(filteredSummary.total_electricity_paise)}
                </td>
                <td
                  style={{
                    padding: '8px 10px',
                    textAlign: 'right',
                    border: '1px solid #cbd5e1',
                    color: '#0f766e',
                    fontSize: '12px',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatCurrency(filteredSummary.total_due_paise)}
                </td>
                <td colSpan={2} style={{ padding: '8px 10px', textAlign: 'right', border: '1px solid #cbd5e1', fontSize: '10px' }}>
                  <span style={{ color: '#15803d' }}>
                    Collected: {formatCurrency(filteredSummary.total_collected_paise)}
                  </span>
                  {filteredSummary.total_pending_paise > 0 && (
                    <span style={{ color: '#b45309', marginLeft: '10px' }}>
                      Pending: {formatCurrency(filteredSummary.total_pending_paise)}
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Official Sign-off & Audit Declaration */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              marginTop: '24px',
              paddingTop: '16px',
              borderTop: '1.5px solid #cbd5e1',
              pageBreakInside: 'avoid',
            }}
          >
            <div style={{ maxWidth: '60%', fontSize: '10px', color: '#64748b', lineHeight: 1.5 }}>
              <div style={{ fontWeight: 700, color: '#334155', marginBottom: '3px' }}>
                OFFICIAL VERIFICATION NOTICE
              </div>
              <div>
                This billing statement constitutes a certified account ledger for{' '}
                <strong>{pg?.name || pgName || 'PG Management'}</strong>. All records are subject to realization and bank
                settlement. Any query regarding electricity meter readings or room charges must be submitted within 7 days.
              </div>
              {pg?.bank_name && (
                <div style={{ marginTop: '5px', color: '#334155' }}>
                  <strong>Settlement Account:</strong> {pg.bank_name}
                  {pg.account_number ? ` | A/C: ••••${pg.account_number.slice(-4)}` : ''}
                  {pg.ifsc_code ? ` | IFSC: ${pg.ifsc_code}` : ''}
                </div>
              )}
            </div>

            <div style={{ textAlign: 'center', minWidth: '220px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: '#334155', marginBottom: '45px' }}>
                For <strong>{pg?.name || pgName || 'PG Management'}</strong>
              </div>
              <div
                style={{
                  borderTop: '1.5px solid #0f172a',
                  paddingTop: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#0f172a',
                }}
              >
                Authorized Signatory / Manager
              </div>
              <div style={{ fontSize: '9px', color: '#64748b' }}>Signature & Official Stamp</div>
            </div>
          </div>
        </div>
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
