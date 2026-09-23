import { register, listPublicActivePGs, getPublicPGByCode } from '../services/auth.service';
import { listTenants, getTenant } from '../services/tenants.service';
import { listNotifications, createNotification } from '../services/notifications.service';
import { listComplaints, createComplaint } from '../services/complaints.service';
import { submitPayment } from '../services/payments.service';
import { supabaseAdmin } from '../config/supabase';

async function runTests() {
  console.log('========================================================================');
  console.log('🧪 MULTI-PG TENANT ONBOARDING, DATA ROUTING & ISOLATION TEST SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}${detail ? ` -> ${detail}` : ''}`);
      failed++;
    }
  }

  // Generate unique test codes and emails
  const timestamp = Date.now();
  const codeA = `TSTA${timestamp % 10000}`;
  const codeB = `TSTB${timestamp % 10000}`;
  const adminAEmail = `admin_a_${timestamp}@testpg.com`;
  const adminBEmail = `admin_b_${timestamp}@testpg.com`;
  const tenantAEmail = `tenant_a_${timestamp}@testpg.com`;
  const tenantBEmail = `tenant_b_${timestamp}@testpg.com`;

  let pgAId = '';
  let pgBId = '';
  let tenantAUserId = '';
  let tenantBUserId = '';
  let tenantATenantId = '';
  let tenantBTenantId = '';

  try {
    // -------------------------------------------------------------------------
    // TEST SUITE 1: Strict Zero-Fallback Tenant Registration Rejection
    // -------------------------------------------------------------------------
    console.log('--- Test Suite 1: Strict Zero-Fallback Validation ---');

    // 1.1 Tenant registration without pg_code or pg_id MUST fail
    let noPgError = '';
    try {
      await register(
        `orphan_${timestamp}@test.com`,
        'Password123!',
        'tenant',
        'Orphan Tenant'
      );
    } catch (e: any) {
      noPgError = e.message;
    }
    assert(
      noPgError.includes('valid PG property') || noPgError.includes('PG Code to register'),
      'Tenant registration without PG code is rejected with strict error',
      noPgError
    );

    // 1.2 Tenant registration with non-existent PG code MUST fail
    let invalidCodeError = '';
    try {
      await register(
        `invalid_${timestamp}@test.com`,
        'Password123!',
        'tenant',
        'Invalid Code Tenant',
        undefined,
        undefined,
        'NON_EXISTENT_XYZ'
      );
    } catch (e: any) {
      invalidCodeError = e.message;
    }
    assert(
      invalidCodeError.includes('PG property not found for code'),
      'Tenant registration with invalid PG code is rejected (Zero fallback)',
      invalidCodeError
    );

    // -------------------------------------------------------------------------
    // TEST SUITE 2: PG Creation, Code Generation & Public Discovery
    // -------------------------------------------------------------------------
    console.log('\n--- Test Suite 2: Independent PG Creation & Discovery ---');

    // 2.1 Register PG Admin A
    const adminARes = await register(
      adminAEmail,
      'Password123!',
      'admin',
      'Admin Alpha',
      '+919876543210',
      `Alpha Property ${timestamp}`
    );
    pgAId = adminARes.user.pgId!;
    assert(!!pgAId, 'PG Alpha created successfully with Admin A');

    // Assign explicit test code to PG A
    await supabaseAdmin.from('pgs').update({ code: codeA, status: 'active' }).eq('id', pgAId);

    // 2.2 Register PG Admin B
    const adminBRes = await register(
      adminBEmail,
      'Password123!',
      'admin',
      'Admin Beta',
      '+919876543211',
      `Beta Property ${timestamp}`
    );
    pgBId = adminBRes.user.pgId!;
    assert(!!pgBId, 'PG Beta created successfully with Admin B');

    // Assign explicit test code to PG B
    await supabaseAdmin.from('pgs').update({ code: codeB, status: 'active' }).eq('id', pgBId);

    // 2.3 Verify public PG discovery
    const publicList = await listPublicActivePGs();
    const publicPGA = publicList.find(p => p.id === pgAId);
    const publicPGB = publicList.find(p => p.id === pgBId);
    assert(!!publicPGA && !!publicPGB, 'Public PG discovery lists both active properties');

    const effectiveCodeA = publicPGA?.code || codeA;
    const effectiveCodeB = publicPGB?.code || codeB;

    // 2.4 Verify code lookup endpoint
    const lookedUpPGA = await getPublicPGByCode(effectiveCodeA);
    assert(lookedUpPGA?.id === pgAId, 'getPublicPGByCode correctly resolves code to PG Alpha ID');

    // -------------------------------------------------------------------------
    // TEST SUITE 3: Code-Based Tenant Registration & PG Binding
    // -------------------------------------------------------------------------
    console.log('\n--- Test Suite 3: Code-Based Tenant Registration & Binding ---');

    // 3.1 Register Tenant Alpha with effectiveCodeA
    const tenantARes = await register(
      tenantAEmail,
      'Password123!',
      'tenant',
      'Resident Alpha',
      '+919999000001',
      undefined,
      effectiveCodeA
    );
    tenantAUserId = tenantARes.user.id;
    assert(tenantARes.user.pgId === pgAId, 'Tenant Alpha resolved and permanently bound to PG Alpha ID');

    // Fetch tenant table record for Alpha
    const { data: tenantARecord } = await supabaseAdmin
      .from('tenants')
      .select('id, pg_id')
      .eq('user_id', tenantAUserId)
      .single();
    tenantATenantId = tenantARecord?.id || '';
    assert(tenantARecord?.pg_id === pgAId, 'Tenant Alpha database record strictly has pg_id = PG Alpha');

    // 3.2 Register Tenant Beta with effectiveCodeB
    const tenantBRes = await register(
      tenantBEmail,
      'Password123!',
      'tenant',
      'Resident Beta',
      '+919999000002',
      undefined,
      effectiveCodeB
    );
    tenantBUserId = tenantBRes.user.id;
    assert(tenantBRes.user.pgId === pgBId, 'Tenant Beta resolved and permanently bound to PG Beta ID');

    // Fetch tenant table record for Beta
    const { data: tenantBRecord } = await supabaseAdmin
      .from('tenants')
      .select('id, pg_id')
      .eq('user_id', tenantBUserId)
      .single();
    tenantBTenantId = tenantBRecord?.id || '';
    assert(tenantBRecord?.pg_id === pgBId, 'Tenant Beta database record strictly has pg_id = PG Beta');

    // -------------------------------------------------------------------------
    // TEST SUITE 4: Admin Directory & Query Scoping
    // -------------------------------------------------------------------------
    console.log('\n--- Test Suite 4: Admin Directory & Query Isolation ---');

    // 4.1 Admin A lists tenants -> MUST see Tenant Alpha, MUST NOT see Tenant Beta
    const adminATenants = await listTenants(pgAId);
    const adminASeesAlpha = adminATenants.some(t => t.id === tenantATenantId);
    const adminASeesBeta = adminATenants.some(t => t.id === tenantBTenantId);
    assert(adminASeesAlpha && !adminASeesBeta, 'Admin A lists ONLY PG Alpha tenants (Tenant Beta invisible)');

    // 4.2 Admin B lists tenants -> MUST see Tenant Beta, MUST NOT see Tenant Alpha
    const adminBTenants = await listTenants(pgBId);
    const adminBSeesBeta = adminBTenants.some(t => t.id === tenantBTenantId);
    const adminBSeesAlpha = adminBTenants.some(t => t.id === tenantATenantId);
    assert(adminBSeesBeta && !adminBSeesAlpha, 'Admin B lists ONLY PG Beta tenants (Tenant Alpha invisible)');

    // 4.3 Admin A attempts to fetch Tenant Beta directly by ID
    let crossTenantAccessBlocked = false;
    try {
      const crossResult = await getTenant(tenantBTenantId, pgAId);
      if (!crossResult) crossTenantAccessBlocked = true;
    } catch {
      crossTenantAccessBlocked = true;
    }
    assert(crossTenantAccessBlocked, 'Admin A cannot read Tenant Beta record (Cross-PG 404/Null isolation)');

    // -------------------------------------------------------------------------
    // TEST SUITE 5: Cross-PG Complaints & Notifications Routing
    // -------------------------------------------------------------------------
    console.log('\n--- Test Suite 5: Complaints & Notifications Scoping ---');

    // 5.1 Tenant Alpha creates a complaint
    const complaintA = await createComplaint(pgAId, tenantATenantId, {
      title: 'Water filter maintenance Alpha',
      description: 'Filter replacement required',
      category: 'maintenance',
    });
    assert(complaintA.pg_id === pgAId, 'Complaint Alpha created with authoritative pg_id = PG Alpha');

    // 5.2 Admin B lists complaints -> MUST NOT include complaint from PG Alpha
    const adminBComplaints = await listComplaints(pgBId);
    const adminBSeesAlphaComplaint = adminBComplaints.some(c => c.id === complaintA.id);
    assert(!adminBSeesAlphaComplaint, 'Admin B cannot see complaints from PG Alpha tenants');

    // 5.3 Notifications scoped to PG
    const notifA = await createNotification({
      pgId: pgAId,
      userId: adminARes.user.id,
      title: 'PG Alpha Alert',
      message: 'Exclusive notification for Alpha',
      type: 'system',
    });
    assert(notifA.pg_id === pgAId, 'Notification created with pg_id = PG Alpha');

    const adminBNotifs = await listNotifications(adminBRes.user.id, { pgId: pgBId });
    const adminBSeesAlphaNotif = adminBNotifs.some(n => n.id === notifA.id);
    assert(!adminBSeesAlphaNotif, 'Admin B notifications strictly isolated from PG Alpha notifications');

    // -------------------------------------------------------------------------
    // TEST SUITE 6: Cross-PG Payment Tampering Protection
    // -------------------------------------------------------------------------
    console.log('\n--- Test Suite 6: Cross-PG Payment Protection ---');

    // Create a dummy rent record belonging to PG Beta
    const { data: rentRecordBeta, error: rentInsertErr } = await supabaseAdmin
      .from('rent_records')
      .insert({
        pg_id: pgBId,
        tenant_id: tenantBTenantId,
        month: '2026-10',
        rent_amount_paise: 750000,
        total_due_paise: 750000,
        due_date: new Date().toISOString(),
        status: 'pending',
      })
      .select()
      .single();

    if (rentInsertErr) {
      console.error('Rent record insert error:', rentInsertErr);
    }

    // Tenant Alpha attempts to submit a payment referencing PG Beta's rent record!
    let crossPaymentError = '';
    if (rentRecordBeta) {
      try {
        await submitPayment(
          pgAId, // Tenant Alpha's PG
          tenantATenantId, // Tenant Alpha
          {
            rent_record_id: rentRecordBeta.id, // Referencing PG Beta's rent record!
            amount_paise: 750000,
            payment_method: 'upi',
            utr_id: 'CROSS_UTR_12345',
          }
        );
      } catch (err: any) {
        crossPaymentError = err.message;
      }
    }
    assert(
      crossPaymentError.includes('Tenant Isolation Violation') ||
      crossPaymentError.includes('Invalid rent record') ||
      crossPaymentError.includes('does not belong'),
      'Cross-PG payment injection strictly rejected by authoritative validation',
      crossPaymentError
    );

  } catch (unexpectedError: any) {
    console.error('💥 Unexpected test exception:', unexpectedError);
    failed++;
  } finally {
    // -------------------------------------------------------------------------
    // TEARDOWN: Clean up test records
    // -------------------------------------------------------------------------
    console.log('\n--- Teardown: Cleaning up test data ---');
    try {
      if (pgAId) {
        await supabaseAdmin.from('notifications').delete().eq('pg_id', pgAId);
        await supabaseAdmin.from('complaints').delete().eq('pg_id', pgAId);
        await supabaseAdmin.from('tenants').delete().eq('pg_id', pgAId);
        await supabaseAdmin.from('users').delete().eq('pg_id', pgAId);
        await supabaseAdmin.from('admins').delete().eq('user_id', adminAEmail);
        await supabaseAdmin.from('pgs').delete().eq('id', pgAId);
      }
      if (pgBId) {
        await supabaseAdmin.from('rent_records').delete().eq('pg_id', pgBId);
        await supabaseAdmin.from('notifications').delete().eq('pg_id', pgBId);
        await supabaseAdmin.from('complaints').delete().eq('pg_id', pgBId);
        await supabaseAdmin.from('tenants').delete().eq('pg_id', pgBId);
        await supabaseAdmin.from('users').delete().eq('pg_id', pgBId);
        await supabaseAdmin.from('admins').delete().eq('user_id', adminBEmail);
        await supabaseAdmin.from('pgs').delete().eq('id', pgBId);
      }
      if (tenantAUserId) {
        await supabaseAdmin.auth.admin.deleteUser(tenantAUserId).catch(() => {});
      }
      if (tenantBUserId) {
        await supabaseAdmin.auth.admin.deleteUser(tenantBUserId).catch(() => {});
      }
      console.log('🧹 Cleanup completed cleanly.');
    } catch (cleanupErr) {
      console.warn('⚠️ Teardown warning:', cleanupErr);
    }
  }

  // -------------------------------------------------------------------------
  // FINAL REPORT
  // -------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`📊 FINAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
