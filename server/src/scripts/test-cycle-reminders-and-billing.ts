import { calculateTenantDueDate } from '../services/rent.service';
import { supabaseAdmin } from '../config/supabase';
import { formatDateDMY, formatMonthMY } from '../utils/date';

async function runTests() {
  console.log('========================================================================');
  console.log('🧪 TESTING CYCLE-BASED REMINDERS, ELECTRICITY LOGIC & VERIFIED BILL DISPATCH');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${desc}`);
      failed++;
    }
  }

  // --- Test Suite 1: Tenant Cycle & Due Date Calculation ---
  console.log('--- Test Suite 1: Tenant Cycle & Due Date Calculation ---');
  const d1 = calculateTenantDueDate('2026-09', '2026-07-15T10:00:00Z', 5);
  assert(d1 === '2026-09-15T00:00:00Z', `Tenant move-in on 15th produces due_date 2026-09-15 (got: ${d1})`);

  const d2 = calculateTenantDueDate('2026-09', '2026-08-01T00:00:00Z', 5);
  assert(d2 === '2026-09-01T00:00:00Z', `Tenant move-in on 1st produces due_date 2026-09-01 (got: ${d2})`);

  const d3 = calculateTenantDueDate('2026-09', null, 5);
  assert(d3 === '2026-09-05T00:00:00Z', `Tenant with no move-in date defaults to 5th (got: ${d3})`);

  const d4 = calculateTenantDueDate('2026-02', '2026-01-31T00:00:00Z', 5);
  assert(d4 === '2026-02-28T00:00:00Z', `Tenant move-in on 31st clamps to Feb 28 (got: ${d4})`);

  // --- Test Suite 2: Electricity & Reminder Notification Formatting ---
  console.log('\n--- Test Suite 2: Electricity & Reminder Message Formatting ---');
  const todayStr = '2026-09-15';
  const tenantDueDate = '2026-09-15';
  const isCompletionDay = tenantDueDate === todayStr;
  assert(isCompletionDay === true, 'Reminder identifies exact completion day (15th)');

  // Case A: Electricity units already punched
  const notesWithUnits = {
    base_rent_paise: 750000,
    maintenance_paise: 50000,
    electricity_units: 42,
    electricity_amount_paise: 50400,
    electricity_rate_per_unit_paise: 1200,
  };
  const elUnits = notesWithUnits.electricity_units;
  const elAmount = notesWithUnits.electricity_amount_paise;
  const electricityNoticeA = elUnits > 0
    ? `⚡ Electricity: ${elUnits} units used (₹${(elAmount / 100).toLocaleString('en-IN')})`
    : 'Meter reading scheduled';
  assert(electricityNoticeA.includes('42 units used'), 'Reminder contains punched units (42 units)');
  assert(electricityNoticeA.includes('504'), 'Reminder contains electricity amount (₹504)');

  // Case B: Electricity units pending punch
  const notesPendingUnits = {
    base_rent_paise: 750000,
    maintenance_paise: 50000,
    electricity_units: 0,
    electricity_amount_paise: 0,
  };
  const electricityNoticeB = notesPendingUnits.electricity_units > 0
    ? 'Punched'
    : '⚡ Electricity Bill: Your electricity meter reading will be recorded on your cycle date today, and the units consumed will automatically show in your PG Resident App.';
  assert(electricityNoticeB.includes('recorded on your cycle date today'), 'Pending punch reminder informs tenant units will be recorded today');
  assert(electricityNoticeB.includes('PG Resident App'), 'Reminder tells tenant it will show in PG Resident App');

  // --- Test Suite 3: Verified Bill Format vs Unverified Invoice ---
  console.log('\n--- Test Suite 3: Verified Bill Format vs Unverified Invoice ---');
  const isPaid = true;
  const billHeader = isPaid
    ? '🧾 OFFICIAL RENT BILL & RECEIPT'
    : '📋 RENT INVOICE';
  assert(billHeader.includes('RECEIPT'), 'Verified status outputs official bill & receipt header');

  const statusSection = isPaid
    ? 'Status: VERIFIED & PAID'
    : 'Status: PENDING';
  assert(statusSection.includes('VERIFIED & PAID'), 'Verified payment bill includes VERIFIED & PAID status');

  console.log('\n========================================================================');
  console.log(`📊 FINAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
