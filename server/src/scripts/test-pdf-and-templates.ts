import assert from 'assert';
import { generateRentInvoicePdf } from '../services/invoicePdf.service';
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  renderWhatsAppTemplate,
} from '../services/settings.service';

async function run() {
  console.log('========================================================================');
  console.log('🧪 TESTING PDF INVOICE GENERATION & WHATSAPP SHORT TEMPLATES');
  console.log('========================================================================\n');

  // Test 1: PDF Generation
  console.log('--- Test Suite 1: PDF Invoice Generation ---');
  const mockRecord = {
    id: 'test-rec-123456',
    month: '2026-09',
    rent_amount_paise: 800000,
    late_fee_paise: 0,
    total_due_paise: 850400,
    status: 'paid',
    due_date: '2026-09-15T00:00:00Z',
    paid_date: '2026-09-15T12:00:00Z',
    notes: JSON.stringify({
      base_rent_paise: 800000,
      electricity_units: 42,
      electricity_rate_per_unit_paise: 1200,
      electricity_amount_paise: 50400,
      maintenance_paise: 0,
    }),
    tenant: {
      full_name: 'Rahul Sharma',
      phone: '9876543210',
    },
    room: {
      room_number: '204',
    },
    pg: {
      name: 'Sagar PG Living',
      tagline: 'PREMIUM PG LIVING',
      phone: '9999988888',
      address: 'Near Tech Park, Bengaluru',
      upi_id: 'sagarpg@upi',
      bank_name: 'HDFC Bank',
      account_number: '50100234567890',
      ifsc_code: 'HDFC0001234',
      account_holder_name: 'Sagar PG Living',
    },
  };

  const pdfBuffer = await generateRentInvoicePdf('default', mockRecord);
  assert(pdfBuffer instanceof Buffer, 'PDF buffer should be an instance of Buffer');
  assert(pdfBuffer.length > 1000, `PDF buffer length should be > 1000 bytes (got: ${pdfBuffer.length})`);
  const header = pdfBuffer.slice(0, 5).toString('ascii');
  assert.strictEqual(header, '%PDF-', `PDF header should start with %PDF- (got: ${header})`);
  console.log(`✅ PASS: PDF generated successfully (${pdfBuffer.length} bytes, header: ${header})`);

  // Test 2: Unpaid PDF with QR code
  mockRecord.status = 'pending';
  const unpaidPdfBuffer = await generateRentInvoicePdf('default', mockRecord);
  assert(unpaidPdfBuffer.length > 1000, 'Unpaid PDF should be generated');
  console.log(`✅ PASS: Unpaid invoice PDF with embedded QR generated (${unpaidPdfBuffer.length} bytes)`);

  // Test 3: Template Rendering
  console.log('\n--- Test Suite 2: Template Rendering & Placeholders ---');
  const vars = {
    tenant_name: 'Rahul Sharma',
    room_number: '204',
    month: 'September 2026',
    amount: '8,504.00',
    due_date: '15/09/2026',
    units: 42,
    pg_name: 'Sagar PG',
    upi_id: 'sagarpg@upi',
  };

  const renderedBill = renderWhatsAppTemplate(DEFAULT_WHATSAPP_TEMPLATES.bill_verified_message, vars);
  assert(renderedBill.includes('Rahul Sharma'), 'Rendered bill should contain tenant name');
  assert(renderedBill.includes('8,504.00'), 'Rendered bill should contain amount');
  assert(renderedBill.includes('September 2026'), 'Rendered bill should contain month');
  assert(renderedBill.includes('Sagar PG'), 'Rendered bill should contain PG name');
  assert(renderedBill.includes('PDF above'), 'Rendered bill should mention attached PDF');
  console.log('✅ PASS: Bill verified template rendered correctly:\n' + renderedBill.replace(/^/gm, '   | '));

  const renderedReminder = renderWhatsAppTemplate(DEFAULT_WHATSAPP_TEMPLATES.rent_reminder_message, vars);
  assert(renderedReminder.includes('Rahul Sharma'), 'Rendered reminder should contain tenant name');
  assert(renderedReminder.includes('8,504.00'), 'Rendered reminder should contain amount');
  assert(renderedReminder.includes('15/09/2026'), 'Rendered reminder should contain due date');
  assert(renderedReminder.includes('42 units'), 'Rendered reminder should contain electricity units');
  assert(renderedReminder.includes('QR code above'), 'Rendered reminder should mention QR code');
  console.log('\n✅ PASS: Rent reminder template rendered correctly:\n' + renderedReminder.replace(/^/gm, '   | '));

  console.log('\n========================================================================');
  console.log('📊 FINAL RESULT: ALL PDF & TEMPLATE TESTS PASSED');
  console.log('========================================================================');
}

run().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
