import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { getPG } from './pg.service';
import { formatDateDMY, formatMonthMY } from '../utils/date';
import { decodeBase64Image } from './whatsapp.service';

export interface InvoicePdfData {
  id: string;
  month: string;
  rent_amount_paise: number;
  late_fee_paise: number;
  total_due_paise: number;
  status: string;
  due_date: string;
  paid_date?: string | null;
  notes?: string | null;
  tenant?: {
    full_name: string;
    phone: string;
    email?: string | null;
  };
  room?: {
    room_number: string;
  };
  pg?: any;
}

/**
 * Generates an official, publication-quality A4 PDF invoice/receipt using PDFKit.
 * Pure JavaScript, fast, zero browser dependencies.
 */
export async function generateRentInvoicePdf(pgId: string, record: any): Promise<Buffer> {
  const pg = record.pg || (await getPG(pgId).catch(() => ({})));

  // 1. Parse itemized charges from record.notes
  let parsedNotes: any = {};
  if (record.notes) {
    try {
      parsedNotes = JSON.parse(record.notes);
    } catch {
      // plain text note
    }
  }

  const pgSnapshot = parsedNotes.pg_snapshot || pg || {};
  const pgName = pgSnapshot.name || pg.name || 'Sagar PG';
  const ownerName = pgSnapshot.owner_name || pg.owner_name || '';
  const tagline = pgSnapshot.tagline || pg.tagline || 'PREMIUM PG LIVING';
  const fullAddress = [pgSnapshot.address || pg.address, pgSnapshot.city || pg.city, pgSnapshot.state || pg.state, pgSnapshot.pincode || pg.pincode]
    .filter(Boolean)
    .join(', ') || 'Property Location';
  const phone = pgSnapshot.phone || pg.phone || '';
  const email = pgSnapshot.email || pg.email || '';
  const upiId = pgSnapshot.upi_id || pg.upi_id || '';
  const bankName = pgSnapshot.bank_name || pg.bank_name || 'HDFC Bank';
  const accountNumber = pgSnapshot.account_number || pg.account_number || '';
  const ifscCode = pgSnapshot.ifsc_code || pg.ifsc_code || '';
  const accountHolder = pgSnapshot.account_holder_name || pg.account_holder_name || pgName;

  const tenantName = record.tenant?.full_name || 'Resident';
  const tenantPhone = record.tenant?.phone || '';
  const roomNumber = record.room?.room_number ? `Room ${record.room.room_number}` : 'Unassigned';

  const isPaid = record.status === 'paid' || record.status === 'verified';
  const invoiceNo = `SR-${record.month.replace('-', '')}-${record.id.slice(0, 6).toUpperCase()}`;
  const invoiceDate = formatDateDMY(new Date());
  const dueDate = formatDateDMY(record.due_date);
  const paidDate = record.paid_date ? formatDateDMY(record.paid_date) : invoiceDate;
  const monthFormatted = formatMonthMY(record.month);

  const baseRentPaise = parsedNotes.base_rent_paise ?? record.rent_amount_paise;
  const maintenancePaise = parsedNotes.maintenance_paise ?? 0;
  const electricityPaise = parsedNotes.electricity_amount_paise ?? 0;
  const electricityUnits = parsedNotes.electricity_units ?? 0;
  const electricityRate = parsedNotes.electricity_rate_per_unit_paise ? (parsedNotes.electricity_rate_per_unit_paise / 100).toFixed(2) : '12.00';
  const waterPaise = parsedNotes.water_charges_paise ?? 0;
  const lateFeePaise = record.late_fee_paise || 0;
  const totalDuePaise = record.total_due_paise || (baseRentPaise + maintenancePaise + electricityPaise + waterPaise + lateFeePaise);

  const totalInRupees = (totalDuePaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  // Generate UPI QR Code if unpaid
  let qrImageBuffer: Buffer | null = null;
  if (!isPaid && upiId) {
    try {
      const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(pgName)}&am=${(totalDuePaise / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Rent for ${monthFormatted}`)}`;
      qrImageBuffer = await QRCode.toBuffer(upiUrl, {
        width: 130,
        margin: 1,
        color: { dark: '#0f2942', light: '#ffffff' },
      });
    } catch (e: any) {
      console.warn('[PDF] Failed to generate QR buffer:', e?.message);
    }
  }

  // Check if logo exists
  let logoBuffer: Buffer | null = null;
  if (pgSnapshot.logo_url) {
    logoBuffer = decodeBase64Image(pgSnapshot.logo_url);
  }

  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 36,
        info: {
          Title: `Rent Invoice - ${monthFormatted} - ${tenantName}`,
          Author: pgName,
          Subject: `Rent Bill for ${monthFormatted}`,
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const pageWidth = 595.28;
      const margin = 36;
      const contentWidth = pageWidth - margin * 2; // 523.28

      // Top Primary Decorative Banner
      doc.rect(0, 0, pageWidth, 7).fill('#0f2942');

      // 1. Header (y: 28)
      let headerY = 28;

      // Draw Logo if available
      if (logoBuffer) {
        try {
          doc.image(logoBuffer, margin, headerY, { fit: [140, 42] });
          headerY += 46;
        } catch {
          // ignore logo decode errors
        }
      }

      // Left Header: PG Name & Address
      doc.font('Helvetica-Bold').fontSize(16).fillColor('#0f2942').text(pgName, margin, headerY);
      headerY += 19;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#64748b').text(tagline.toUpperCase(), margin, headerY);
      headerY += 12;

      if (ownerName) {
        doc.font('Helvetica').fontSize(8.5).fillColor('#334155').text(`Owner: ${ownerName}`, margin, headerY);
        headerY += 11;
      }
      doc.font('Helvetica').fontSize(8.5).fillColor('#475569').text(fullAddress, margin, headerY, { width: 280 });
      headerY += 20;

      const contactLine = [phone ? `Phone: ${phone}` : '', email ? `Email: ${email}` : ''].filter(Boolean).join('  |  ');
      if (contactLine) {
        doc.font('Helvetica').fontSize(8).fillColor('#0284c7').text(contactLine, margin, headerY);
      }

      // Right Header: INVOICE / RECEIPT Metadata Box
      const metaBoxX = 350;
      const metaBoxY = 28;
      const metaBoxWidth = contentWidth - (metaBoxX - margin);

      doc.font('Helvetica-Bold').fontSize(16).fillColor('#0f2942').text(
        isPaid ? 'OFFICIAL RECEIPT' : 'RENT INVOICE',
        metaBoxX,
        metaBoxY,
        { width: metaBoxWidth, align: 'right' }
      );

      // Status Pill
      const statusPillY = metaBoxY + 22;
      const statusPillWidth = 110;
      const statusPillX = metaBoxX + metaBoxWidth - statusPillWidth;
      doc.roundedRect(statusPillX, statusPillY, statusPillWidth, 18, 4)
        .fillAndStroke(isPaid ? '#dcfce7' : '#fef3c7', isPaid ? '#16a34a' : '#d97706');
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(isPaid ? '#15803d' : '#92400e')
        .text(isPaid ? 'VERIFIED & PAID' : 'PAYMENT DUE', statusPillX, statusPillY + 5, { width: statusPillWidth, align: 'center' });

      // Inset Details Box
      const detailsCardY = statusPillY + 24;
      const detailsCardHeight = 68;
      doc.roundedRect(metaBoxX, detailsCardY, metaBoxWidth, detailsCardHeight, 6)
        .fillAndStroke('#f8fafc', '#e2e8f0');

      let metaLineY = detailsCardY + 8;
      const drawMetaRow = (label: string, val: string, isBoldVal: boolean = false) => {
        doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(label, metaBoxX + 10, metaLineY);
        doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text(':', metaBoxX + 70, metaLineY);
        doc.font(isBoldVal ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor('#0f2942').text(val, metaBoxX + 78, metaLineY);
        metaLineY += 13;
      };

      drawMetaRow('Invoice No', invoiceNo, true);
      drawMetaRow('Date', invoiceDate);
      drawMetaRow('Month', monthFormatted, true);
      if (isPaid) {
        drawMetaRow('Paid On', paidDate, true);
      } else {
        drawMetaRow('Due Date', dueDate, true);
      }

      // Divider Line
      const dividerY = 152;
      doc.moveTo(margin, dividerY).lineTo(margin + contentWidth, dividerY).strokeColor('#e2e8f0').lineWidth(1).stroke();

      // 2. Tenant Details Section
      const tenantBoxY = 160;
      const tenantBoxHeight = 44;
      doc.roundedRect(margin, tenantBoxY, contentWidth, tenantBoxHeight, 6)
        .fillAndStroke('#f8fafc', '#e2e8f0');

      // Tenant Title Bar
      doc.roundedRect(margin, tenantBoxY, contentWidth, 16, 6)
        .fill('#e2e8f0');
      doc.rect(margin, tenantBoxY + 10, contentWidth, 6).fill('#e2e8f0'); // square off bottom corners of header
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f2942').text('TENANT DETAILS', margin + 12, tenantBoxY + 4);

      // Tenant Fields Row
      const tenantFieldsY = tenantBoxY + 22;
      doc.font('Helvetica').fontSize(8).fillColor('#64748b').text('Name:', margin + 12, tenantFieldsY);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f2942').text(tenantName, margin + 46, tenantFieldsY);

      doc.font('Helvetica').fontSize(8).fillColor('#64748b').text('Room No:', margin + 210, tenantFieldsY);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#0284c7').text(roomNumber, margin + 260, tenantFieldsY);

      doc.font('Helvetica').fontSize(8).fillColor('#64748b').text('Phone:', margin + 360, tenantFieldsY);
      doc.font('Helvetica').fontSize(9).fillColor('#1e293b').text(tenantPhone || '-', margin + 398, tenantFieldsY);

      // 3. Itemized Charges Table
      const tableY = 216;
      const col1X = margin;
      const col1W = 45;
      const col2X = margin + col1W;
      const col2W = 345;
      const col3X = col2X + col2W;
      const col3W = contentWidth - (col1W + col2W); // 133.28

      // Table Header Row
      const rowHeight = 22;
      doc.roundedRect(margin, tableY, contentWidth, rowHeight, 4).fill('#0f2942');
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff');
      doc.text('Sl No.', col1X, tableY + 6, { width: col1W, align: 'center' });
      doc.text('Description of Charges', col2X + 10, tableY + 6, { width: col2W - 10, align: 'left' });
      doc.text('Amount (INR)', col3X, tableY + 6, { width: col3W - 14, align: 'right' });

      // Table Line Items
      interface LineItem {
        sl: number;
        desc: string;
        amt: number;
      }
      const items: LineItem[] = [];
      let sl = 1;
      items.push({ sl: sl++, desc: `Monthly Room Rent (${monthFormatted})`, amt: baseRentPaise });

      if (electricityPaise > 0 || electricityUnits > 0) {
        items.push({
          sl: sl++,
          desc: electricityUnits > 0
            ? `Electricity Charges (${electricityUnits} units @ Rs. ${electricityRate}/unit)`
            : 'Electricity Charges',
          amt: electricityPaise,
        });
      }

      if (maintenancePaise > 0) {
        items.push({ sl: sl++, desc: 'Fixed Maintenance & Cleaning Charges', amt: maintenancePaise });
      }

      if (waterPaise > 0) {
        items.push({ sl: sl++, desc: 'Water Charges', amt: waterPaise });
      }

      if (lateFeePaise > 0) {
        items.push({ sl: sl++, desc: 'Late Fee / Fine', amt: lateFeePaise });
      }

      let currentY = tableY + rowHeight;
      items.forEach((item, idx) => {
        const bg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
        doc.rect(margin, currentY, contentWidth, rowHeight).fillAndStroke(bg, '#e2e8f0');

        doc.font('Helvetica').fontSize(8.5).fillColor('#64748b').text(String(item.sl), col1X, currentY + 6, { width: col1W, align: 'center' });
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1e293b').text(item.desc, col2X + 10, currentY + 6, { width: col2W - 10, align: 'left' });
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f2942').text(
          `Rs. ${(item.amt / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
          col3X,
          currentY + 6,
          { width: col3W - 14, align: 'right' }
        );

        currentY += rowHeight;
      });

      // Total Due Row
      const totalRowH = 26;
      doc.rect(margin, currentY, contentWidth, totalRowH).fillAndStroke('#f1f5f9', '#cbd5e1');
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f2942').text(
        isPaid ? 'TOTAL AMOUNT PAID' : 'TOTAL AMOUNT DUE',
        col2X + 10,
        currentY + 8,
        { width: col2W - 10, align: 'left' }
      );
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f2942').text(
        `Rs. ${totalInRupees}`,
        col3X,
        currentY + 7,
        { width: col3W - 14, align: 'right' }
      );
      currentY += totalRowH + 16;

      // 4. Bottom Grid: Payment Details (Left) + Verification / Scan to Pay (Right)
      const bottomY = currentY;
      const leftColW = 300;
      const rightColX = margin + leftColW + 16;
      const rightColW = contentWidth - leftColW - 16;

      // Left Box: Payment Details
      const payBoxH = 100;
      doc.roundedRect(margin, bottomY, leftColW, payBoxH, 6).fillAndStroke('#f8fafc', '#e2e8f0');

      doc.roundedRect(margin, bottomY, leftColW, 16, 6).fill('#e2e8f0');
      doc.rect(margin, bottomY + 10, leftColW, 6).fill('#e2e8f0');
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f2942').text('PAYMENT DETAILS', margin + 10, bottomY + 4);

      let pLineY = bottomY + 22;
      const drawPayLine = (l: string, v: string, isBlue: boolean = false) => {
        doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(l, margin + 10, pLineY);
        doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text(':', margin + 85, pLineY);
        doc.font('Helvetica-Bold').fontSize(8).fillColor(isBlue ? '#0284c7' : '#1e293b').text(v, margin + 92, pLineY, { width: 195 });
        pLineY += 13;
      };

      drawPayLine('UPI ID', upiId || 'Not configured', true);
      drawPayLine('Bank Name', bankName);
      drawPayLine('Account Holder', accountHolder);
      drawPayLine('Account No', accountNumber || 'xxxx xxxx xxxx');
      drawPayLine('IFSC Code', ifscCode || 'HDFC0001234');

      // Small Notice box below payment details
      const noticeY = bottomY + payBoxH + 8;
      doc.roundedRect(margin, noticeY, leftColW, 36, 4).fillAndStroke('#f0fdf4', '#bbf7d0');
      doc.font('Helvetica').fontSize(7.5).fillColor('#166534').text(
        `• Please ensure rent is cleared on or before the due date to avoid late fees.\n• For billing queries, contact PG administration directly at ${phone || 'property office'}.`,
        margin + 8,
        noticeY + 6,
        { width: leftColW - 16, lineGap: 2 }
      );

      // Right Column: Verified Confirmation OR Scan to Pay QR Code
      if (isPaid) {
        // Green Verified Stamp Box
        doc.roundedRect(rightColX, bottomY, rightColW, 110, 6)
          .fillAndStroke('#f0fdf4', '#86efac');

        // Checkmark badge
        doc.circle(rightColX + rightColW / 2, bottomY + 24, 14).fill('#22c55e');
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#ffffff')
          .text('v', rightColX + rightColW / 2 - 4, bottomY + 16);

        doc.font('Helvetica-Bold').fontSize(10).fillColor('#166534').text(
          'PAYMENT VERIFIED & CONFIRMED',
          rightColX + 8,
          bottomY + 44,
          { width: rightColW - 16, align: 'center' }
        );

        doc.font('Helvetica').fontSize(8).fillColor('#15803d').text(
          `Paid on ${paidDate}`,
          rightColX + 8,
          bottomY + 59,
          { width: rightColW - 16, align: 'center' }
        );

        if (parsedNotes.utr || record.notes) {
          const refText = parsedNotes.utr || (record.notes.length < 30 ? record.notes : `Ref: ${record.id.slice(0, 8)}`);
          doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#166534').text(
            `Ref / UTR: ${refText}`,
            rightColX + 8,
            bottomY + 72,
            { width: rightColW - 16, align: 'center' }
          );
        }

        doc.font('Helvetica').fontSize(7.5).fillColor('#475569').text(
          `Recorded by ${pgName} Administration`,
          rightColX + 8,
          bottomY + 88,
          { width: rightColW - 16, align: 'center' }
        );
      } else {
        // Scan to Pay Box with QR Code
        doc.roundedRect(rightColX, bottomY, rightColW, 144, 6)
          .fillAndStroke('#ffffff', '#e2e8f0');

        doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f2942').text(
          'SCAN TO PAY VIA UPI',
          rightColX,
          bottomY + 8,
          { width: rightColW, align: 'center' }
        );

        if (qrImageBuffer) {
          try {
            const qrSize = 88;
            doc.image(qrImageBuffer, rightColX + (rightColW - qrSize) / 2, bottomY + 22, { width: qrSize, height: qrSize });
          } catch {
            // ignore
          }
        }

        doc.font('Helvetica').fontSize(7.5).fillColor('#64748b').text(
          'GPay  |  PhonePe  |  Paytm  |  BHIM',
          rightColX,
          bottomY + 116,
          { width: rightColW, align: 'center' }
        );
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0284c7').text(
          `Payee: ${accountHolder}`,
          rightColX,
          bottomY + 128,
          { width: rightColW, align: 'center' }
        );
      }

      // 5. Signature & Closing
      const closingY = bottomY + 148;
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f2942').text(
        'Thank You!',
        rightColX,
        closingY,
        { width: rightColW, align: 'center' }
      );
      doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(
        'Stay Safe, Stay Happy',
        rightColX,
        closingY + 14,
        { width: rightColW, align: 'center' }
      );
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f2942').text(
        `Team ${pgName}`,
        rightColX,
        closingY + 26,
        { width: rightColW, align: 'center' }
      );

      // 6. Bottom Decorative Ribbon
      const ribbonY = 808;
      doc.rect(0, ribbonY, pageWidth, 34).fill('#0f2942');
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff').text(
        'Comfortable Homes   |   Happy Tenants   |   Better Living',
        0,
        ribbonY + 8,
        { width: pageWidth, align: 'center' }
      );
      doc.font('Helvetica').fontSize(7).fillColor('#94a3b8').text(
        `This is a computer-generated immutable digital invoice generated for ${tenantName}. All dates are in DD/MM/YYYY.`,
        0,
        ribbonY + 19,
        { width: pageWidth, align: 'center' }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
