import React from 'react';
import QRCode from 'qrcode';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { formatMonth } from '../../lib/api';
import { formatDate } from '../../lib/date';
import { printElement } from '../../lib/printHelper';
import {
  Printer,
  Send,
  Building2,
  Phone,
  Mail,
  MapPin,
  Home,
  QrCode as QrIcon,
} from 'lucide-react';

export interface InvoiceTenant {
  id?: string;
  full_name: string;
  phone: string;
  email?: string | null;
}

export interface InvoiceRoom {
  room_number: string;
  floor?: number | null;
}

export interface InvoicePGProfile {
  id?: string;
  name: string;
  owner_name?: string | null;
  tagline?: string | null;
  logo_url?: string | null;
  code?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  upi_id?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  ifsc_code?: string | null;
  account_holder_name?: string | null;
}

export interface RentInvoiceData {
  id: string;
  month: string; // YYYY-MM
  rent_amount_paise: number;
  late_fee_paise: number;
  total_due_paise: number;
  status: string;
  due_date: string;
  paid_date?: string | null;
  notes?: string | null;
  tenant?: InvoiceTenant;
  room?: InvoiceRoom;
  pg?: InvoicePGProfile;
}

interface RentInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: RentInvoiceData | null;
  currentPG?: InvoicePGProfile | null;
  onSendWhatsApp?: (recordId: string) => Promise<void> | void;
  isSendingWhatsApp?: boolean;
}

export function RentInvoiceModal({
  isOpen,
  onClose,
  record,
  currentPG,
  onSendWhatsApp,
  isSendingWhatsApp = false,
}: RentInvoiceModalProps) {
  const [qrCodeDataUrl, setQrCodeDataUrl] = React.useState<string | null>(null);

  if (!record) return null;

  // 1. Parse itemized charges from record.notes
  let parsedNotes: any = {};
  if (record.notes) {
    try {
      parsedNotes = JSON.parse(record.notes);
    } catch {
      // plain text note
    }
  }

  // 2. Resolve PG Profile: prefer historical snapshot from notes, then record.pg, then currentPG
  const pgSnapshot: InvoicePGProfile | null = parsedNotes.pg_snapshot || null;
  const activePG: InvoicePGProfile = pgSnapshot || record.pg || currentPG || {
    name: 'Sagar PG Living',
    tagline: 'PREMIUM PG LIVING',
  };

  const pgName = activePG.name || 'Sunrise Residency';
  const ownerName = activePG.owner_name || '';
  const tagline = activePG.tagline || 'PREMIUM PG LIVING';
  const logoUrl = activePG.logo_url || null;

  // Build complete address
  const addressParts = [
    activePG.address,
    activePG.city,
    activePG.state,
    activePG.pincode,
  ].filter(Boolean);
  const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : 'Property Location';

  const tenantName = record.tenant?.full_name || 'Resident';
  const tenantPhone = record.tenant?.phone || '';
  const roomNumber = record.room?.room_number ? `Room ${record.room.room_number}` : 'Unassigned';

  // Format dates
  const invoiceNumber = `SR-${record.month.replace('-', '')}-${record.id.slice(0, 4).toUpperCase()}`;
  const invoiceDateFormatted = formatDate(new Date().toISOString());
  const dueDateFormatted = formatDate(record.due_date);
  const monthFormatted = formatMonth(record.month);

  // Extract individual line items
  const baseRentPaise = parsedNotes.base_rent_paise ?? record.rent_amount_paise;
  const maintenancePaise = parsedNotes.maintenance_paise ?? 0;
  const electricityPaise = parsedNotes.electricity_amount_paise ?? 0;
  const electricityUnits = parsedNotes.electricity_units ?? 0;
  const waterPaise = parsedNotes.water_charges_paise ?? 0;
  const lateFeePaise = record.late_fee_paise || 0;
  const totalDuePaise = record.total_due_paise || (baseRentPaise + maintenancePaise + electricityPaise + waterPaise + lateFeePaise);

  const totalAmountInRupees = (totalDuePaise / 100).toFixed(2);

  // Generate UPI QR Code URL
  React.useEffect(() => {
    async function generateQR() {
      const upiId = activePG.upi_id || '9876543210@upi';
      const payeeName = activePG.name || 'PG Living';
      const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${totalAmountInRupees}&cu=INR&tn=${encodeURIComponent(`Rent for ${monthFormatted}`)}`;

      try {
        const dataUrl = await QRCode.toDataURL(upiUrl, {
          width: 220,
          margin: 1,
          color: {
            dark: '#0f172a',
            light: '#ffffff',
          },
        });
        setQrCodeDataUrl(dataUrl);
      } catch (err) {
        console.error('Failed to generate UPI QR code:', err);
      }
    }

    generateQR();
  }, [activePG.upi_id, activePG.name, totalAmountInRupees, monthFormatted]);

  // Construct itemized rows
  const lineItems: { sl: number; description: string; amountPaise: number }[] = [];
  let sl = 1;
  lineItems.push({
    sl: sl++,
    description: `Monthly Rent (${monthFormatted})`,
    amountPaise: baseRentPaise,
  });

  if (electricityPaise > 0) {
    lineItems.push({
      sl: sl++,
      description: electricityUnits > 0 ? `Electricity Charges (${electricityUnits} units)` : 'Electricity Charges',
      amountPaise: electricityPaise,
    });
  }

  if (waterPaise > 0) {
    lineItems.push({
      sl: sl++,
      description: 'Water Charges',
      amountPaise: waterPaise,
    });
  }

  if (maintenancePaise > 0) {
    lineItems.push({
      sl: sl++,
      description: 'Maintenance Charges',
      amountPaise: maintenancePaise,
    });
  }

  if (lateFeePaise > 0) {
    lineItems.push({
      sl: sl++,
      description: 'Late Fee / Fine',
      amountPaise: lateFeePaise,
    });
  }

  const handlePrint = () => {
    printElement('printable-rent-bill', `Invoice-${record.month}-${tenantName.replace(/\s+/g, '_')}`);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Official Rent Invoice"
      size="lg"
      footer={
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {onSendWhatsApp && (
              <Button
                variant="outline"
                onClick={() => onSendWhatsApp(record.id)}
                isLoading={isSendingWhatsApp}
                disabled={isSendingWhatsApp}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Send size={15} /> Send WhatsApp Invoice
              </Button>
            )}
            <Button
              variant="primary"
              onClick={handlePrint}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Printer size={16} /> Print / Save PDF
            </Button>
          </div>
        </div>
      }
    >
      {/* Scrollable invoice container for screen viewing */}
      <div className="invoice-modal-scroll">
        {/* Printable Root Element */}
        <div
          id="printable-rent-bill"
          className="invoice-paper-sheet"
        >
          {/* Top Header Row */}
          <div className="invoice-header-flex">
            {/* Left: Logo & PG Details */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Logo & Tagline */}
              <div style={{ marginBottom: '12px' }}>
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={`${pgName} Logo`}
                    style={{
                      maxHeight: '68px',
                      maxWidth: '220px',
                      objectFit: 'contain',
                      display: 'block',
                      marginBottom: '4px',
                    }}
                  />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      backgroundColor: '#0f2942',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Building2 size={22} />
                    </div>
                    <div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f2942', lineHeight: 1.1 }}>
                        {pgName}
                      </div>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', letterSpacing: '0.1em' }}>
                        {tagline}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* PG Name & Contact Meta */}
              <h1 style={{ margin: '0 0 4px 0', fontSize: '22px', fontWeight: 800, color: '#0f2942', letterSpacing: '-0.02em', wordBreak: 'break-word' }}>
                {pgName}
              </h1>

              {ownerName && (
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Owner: {ownerName}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '12px', color: '#475569' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <MapPin size={13} style={{ color: '#0284c7', flexShrink: 0, marginTop: '2px' }} />
                  <span style={{ wordBreak: 'break-word' }}>{fullAddress}</span>
                </div>
                {activePG.phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Phone size={13} style={{ color: '#0284c7', flexShrink: 0 }} />
                    <span>{activePG.phone}</span>
                  </div>
                )}
                {activePG.email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Mail size={13} style={{ color: '#0284c7', flexShrink: 0 }} />
                    <span style={{ wordBreak: 'break-all' }}>{activePG.email}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right: RENT INVOICE Title + Inset Metadata Box */}
            <div className="invoice-meta-container">
              <div
                className="invoice-title-text"
                style={{
                  fontSize: '24px',
                  fontWeight: 900,
                  color: '#0f2942',
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                  marginBottom: '10px',
                }}
              >
                RENT INVOICE
              </div>

              {/* Inset Card for Invoice details */}
              <div className="invoice-meta-card">
                <div style={{ display: 'grid', gridTemplateColumns: '95px 12px 1fr', gap: '4px', fontSize: '12px' }}>
                  <span style={{ color: '#64748b', fontWeight: 500 }}>Invoice No</span>
                  <span style={{ color: '#94a3b8' }}>:</span>
                  <strong style={{ color: '#0f2942', fontFamily: 'monospace', fontWeight: 700, wordBreak: 'break-all' }}>{invoiceNumber}</strong>

                  <span style={{ color: '#64748b', fontWeight: 500 }}>Invoice Date</span>
                  <span style={{ color: '#94a3b8' }}>:</span>
                  <span style={{ color: '#1e293b' }}>{invoiceDateFormatted}</span>

                  <span style={{ color: '#64748b', fontWeight: 500 }}>Due Date</span>
                  <span style={{ color: '#94a3b8' }}>:</span>
                  <span style={{ color: '#1e293b', fontWeight: 600 }}>{dueDateFormatted}</span>

                  <span style={{ color: '#64748b', fontWeight: 500 }}>Month</span>
                  <span style={{ color: '#94a3b8' }}>:</span>
                  <span style={{ color: '#1e293b', fontWeight: 600 }}>{monthFormatted}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: '1.5px', backgroundColor: '#e2e8f0', margin: '14px 0 18px 0' }} />

          {/* Tenant Details Card */}
          <div style={{
            backgroundColor: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            marginBottom: '20px',
          }}>
            <div style={{
              backgroundColor: '#e2e8f0',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 700,
              color: '#0f2942',
              letterSpacing: '0.03em',
            }}>
              Tenant Details
            </div>
            <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '70px 12px 1fr', gap: '5px', fontSize: '13px' }}>
              <span style={{ color: '#64748b', fontWeight: 500 }}>Name</span>
              <span style={{ color: '#94a3b8' }}>:</span>
              <strong style={{ color: '#0f2942', fontWeight: 700 }}>{tenantName}</strong>

              <span style={{ color: '#64748b', fontWeight: 500 }}>Room No</span>
              <span style={{ color: '#94a3b8' }}>:</span>
              <strong style={{ color: '#0284c7', fontWeight: 700 }}>{roomNumber}</strong>

              <span style={{ color: '#64748b', fontWeight: 500 }}>Phone</span>
              <span style={{ color: '#94a3b8' }}>:</span>
              <span style={{ color: '#334155' }}>{tenantPhone || '-'}</span>
            </div>
          </div>

          {/* Itemized Charges Table with Responsive Scroll Wrapper */}
          <div className="invoice-table-wrapper">
            <table style={{ width: '100%', minWidth: '440px', borderCollapse: 'collapse', marginBottom: '22px', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#0f2942', color: '#ffffff' }}>
                  <th style={{ width: '70px', padding: '9px 12px', textAlign: 'center', fontWeight: 700, borderRadius: '6px 0 0 0' }}>
                    Sl. No.
                  </th>
                  <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700 }}>
                    Description
                  </th>
                  <th style={{ width: '150px', padding: '9px 14px', textAlign: 'right', fontWeight: 700, borderRadius: '0 6px 0 0' }}>
                    Amount (₹)
                  </th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, idx) => (
                  <tr
                    key={idx}
                    style={{
                      backgroundColor: idx % 2 === 1 ? '#f8fafc' : '#ffffff',
                      borderBottom: '1px solid #e2e8f0',
                    }}
                  >
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#64748b' }}>
                      {item.sl}
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 500, color: '#1e293b' }}>
                      {item.description}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: '#0f2942', fontVariantNumeric: 'tabular-nums' }}>
                      {(item.amountPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: '#f1f5f9', borderTop: '2px solid #cbd5e1' }}>
                  <td colSpan={2} style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, fontSize: '14px', color: '#0f2942' }}>
                    Total Amount
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, fontSize: '16px', color: '#0f2942', fontVariantNumeric: 'tabular-nums' }}>
                    ₹ {(totalDuePaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Bottom Section: Payment Details (Left) + Scan to Pay & Signature (Right) */}
          <div className="invoice-bottom-grid">
            {/* Left: Payment Details Card + Notice */}
            <div className="invoice-payment-col">
              <div style={{
                backgroundColor: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                overflow: 'hidden',
                marginBottom: '12px',
              }}>
                <div style={{
                  backgroundColor: '#e2e8f0',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#0f2942',
                  letterSpacing: '0.03em',
                }}>
                  Payment Details
                </div>
                <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '95px 12px 1fr', gap: '4px', fontSize: '12px' }}>
                  <span style={{ color: '#64748b', fontWeight: 500 }}>UPI ID</span>
                  <span style={{ color: '#94a3b8' }}>:</span>
                  <strong style={{ color: '#0284c7', fontWeight: 700, wordBreak: 'break-all' }}>{activePG.upi_id || 'Not configured'}</strong>

                  <span style={{ color: '#64748b', fontWeight: 500 }}>Bank Name</span>
                  <span style={{ color: '#94a3b8' }}>:</span>
                  <span style={{ color: '#1e293b' }}>{activePG.bank_name || 'HDFC Bank'}</span>

                  <span style={{ color: '#64748b', fontWeight: 500 }}>Account Name</span>
                  <span style={{ color: '#94a3b8' }}>:</span>
                  <span style={{ color: '#1e293b' }}>{activePG.account_holder_name || pgName}</span>

                  <span style={{ color: '#64748b', fontWeight: 500 }}>Account No</span>
                  <span style={{ color: '#94a3b8' }}>:</span>
                  <span style={{ color: '#1e293b', fontFamily: 'monospace', fontWeight: 600 }}>{activePG.account_number || 'xxxx xxxx xxxx'}</span>

                  <span style={{ color: '#64748b', fontWeight: 500 }}>IFSC Code</span>
                  <span style={{ color: '#94a3b8' }}>:</span>
                  <span style={{ color: '#1e293b', fontFamily: 'monospace', fontWeight: 600 }}>{activePG.ifsc_code || 'HDFC0001234'}</span>
                </div>
              </div>

              {/* Notice Box */}
              <div style={{
                backgroundColor: '#f0fdf4',
                borderRadius: '6px',
                border: '1px solid #bbf7d0',
                padding: '8px 12px',
                fontSize: '11px',
                color: '#166534',
                lineHeight: 1.4,
              }}>
                <div>• Please make the payment before the due date to avoid late charges.</div>
                {activePG.phone && (
                  <div>• For any queries, contact us at <strong>{activePG.phone}</strong>.</div>
                )}
              </div>
            </div>

            {/* Right: Scan to Pay UPI QR + Badges + Signature */}
            <div className="invoice-qr-col">
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f2942', marginBottom: '6px' }}>
                Scan to Pay
              </div>

              {/* QR Code Container */}
              <div style={{
                padding: '6px',
                backgroundColor: '#ffffff',
                border: '2px solid #e2e8f0',
                borderRadius: '8px',
                display: 'inline-block',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                marginBottom: '8px',
              }}>
                {qrCodeDataUrl ? (
                  <img
                    src={qrCodeDataUrl}
                    alt="UPI Payment QR Code"
                    style={{ width: '135px', height: '135px', display: 'block' }}
                  />
                ) : (
                  <div style={{ width: '135px', height: '135px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                    <QrIcon size={48} />
                  </div>
                )}
              </div>

              {/* Payment App Badges */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '14px' }}>
                <span style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#ffffff',
                  backgroundColor: '#ea4335',
                  padding: '2px 6px',
                  borderRadius: '4px'
                }}>
                  GPay
                </span>
                <span style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#ffffff',
                  backgroundColor: '#5f259f',
                  padding: '2px 6px',
                  borderRadius: '4px'
                }}>
                  PhonePe
                </span>
                <span style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#ffffff',
                  backgroundColor: '#00b9f1',
                  padding: '2px 6px',
                  borderRadius: '4px'
                }}>
                  Paytm
                </span>
              </div>

              {/* Signature / Greeting */}
              <div style={{ marginTop: '2px', textAlign: 'center' }}>
                <div style={{
                  fontFamily: "'Brush Script MT', 'Dancing Script', 'Caveat', cursive, sans-serif",
                  fontSize: '24px',
                  color: '#0f2942',
                  fontWeight: 600,
                  lineHeight: 1,
                  marginBottom: '3px',
                }}>
                  Thank You!
                </div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>
                  Stay Safe, Stay Happy
                </div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f2942' }}>
                  Team {pgName}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Decorative Footer Ribbon */}
          <div className="invoice-footer-ribbon">
            <Home size={15} style={{ color: '#38bdf8', flexShrink: 0 }} />
            <span>Comfortable Homes &nbsp;|&nbsp; Happy Tenants &nbsp;|&nbsp; Better Living</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
