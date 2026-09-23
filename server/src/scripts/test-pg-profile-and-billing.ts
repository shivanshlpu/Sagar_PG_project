import { supabaseAdmin } from '../config/supabase';
import * as pgService from '../services/pg.service';
import * as rentService from '../services/rent.service';
import { enforcePgBoundary } from '../middleware/auth';
import type { Request, Response } from 'express';

import { register } from '../services/auth.service';

async function runTestSuite() {
  console.log('========================================================================');
  console.log('🧪 PG PROFILE ISOLATION & BILL/INVOICE ENGINE TEST SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${msg}`);
      failed++;
    }
  }

  const timestamp = Date.now();
  let testPg1Id = '';
  let testPg2Id = '';
  let admin1Id = '';
  let admin2Id = '';
  const admin1Email = `admin_pg1_${timestamp}@testpg.com`;
  const admin2Email = `admin_pg2_${timestamp}@testpg.com`;

  try {
    // Register PG1
    const reg1 = await register(
      admin1Email,
      'Password123!',
      'admin',
      'Rajesh Kumar',
      '+919876543210',
      `Sunrise Residency ${timestamp}`
    );
    testPg1Id = reg1.user.pgId!;
    admin1Id = reg1.user.id;

    // Register PG2
    const reg2 = await register(
      admin2Email,
      'Password123!',
      'admin',
      'Amit Sharma',
      '+919123456789',
      `Horizon Heights ${timestamp}`
    );
    testPg2Id = reg2.user.pgId!;
    admin2Id = reg2.user.id;

    const actor1 = { id: admin1Id, email: admin1Email };
    const actor2 = { id: admin2Id, email: admin2Email };

    console.log('--- Test Suite 1: PG Profile Update & Retrieval ---');
    const pg1Logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await pgService.updatePG(testPg1Id, {
      name: 'Sunrise Residency & Suites',
      owner_name: 'Rajesh Kumar',
      tagline: 'PREMIUM PG LIVING',
      logo_url: pg1Logo,
      phone: '+91 98765 43210',
    }, actor1);

    const fetchedPg1 = await pgService.getPG(testPg1Id);
    assert(fetchedPg1.name === 'Sunrise Residency & Suites', 'PG1 name updated and retrieved correctly');
    assert(fetchedPg1.owner_name === 'Rajesh Kumar', 'PG1 owner_name persisted and retrieved');
    assert(fetchedPg1.tagline === 'PREMIUM PG LIVING', 'PG1 tagline persisted');
    assert(fetchedPg1.logo_url === pg1Logo, 'PG1 logo_url persisted and retrieved');
    assert(fetchedPg1.phone === '+91 98765 43210', 'PG1 phone retrieved');

    console.log('\n--- Test Suite 2: Strict Multi-PG Isolation ---');
    const pg2Logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    await pgService.updatePG(testPg2Id, {
      name: 'Horizon Luxury Stays',
      owner_name: 'Amit Sharma',
      tagline: 'ELITE STUDENT HOUSING',
      logo_url: pg2Logo,
      phone: '+91 91234 56789',
    }, actor2);

    const fetchedPg2 = await pgService.getPG(testPg2Id);
    assert(fetchedPg2.name === 'Horizon Luxury Stays', 'PG2 name updated independently');
    assert(fetchedPg2.owner_name === 'Amit Sharma', 'PG2 owner_name matches Amit Sharma');
    assert(fetchedPg2.tagline === 'ELITE STUDENT HOUSING', 'PG2 tagline matches');
    assert(fetchedPg2.logo_url === pg2Logo, 'PG2 logo_url matches pg2Logo');

    // Cross-contamination verification: PG1 must not have PG2's data
    const recheckedPg1 = await pgService.getPG(testPg1Id);
    assert(recheckedPg1.owner_name === 'Rajesh Kumar', 'PG1 owner is Rajesh Kumar, NOT Amit Sharma');
    assert(recheckedPg1.logo_url === pg1Logo, 'PG1 logo is NOT overwritten by PG2 logo');
    assert(recheckedPg1.name === 'Sunrise Residency & Suites', 'PG1 name is untouched by PG2 updates');

    console.log('\n--- Test Suite 3: Backend Route Boundary Protection ---');
    let boundaryBlocked = false;
    const mockReqCrossPg = {
      user: { id: 'admin-pg2', email: 'admin@pg2.com', role: 'admin', pgId: testPg2Id },
      params: { pgId: testPg1Id },
      body: {},
      query: {},
    } as unknown as Request;

    const mockRes = {
      status: (code: number) => {
        if (code === 403) boundaryBlocked = true;
        return {
          json: () => {},
        };
      },
    } as unknown as Response;

    enforcePgBoundary(mockReqCrossPg, mockRes, () => {});
    assert(boundaryBlocked, 'Cross-PG admin access is blocked with 403 Forbidden by enforcePgBoundary');

    console.log('\n--- Test Suite 4: Bill Invoice Snapshotting & Fidelity ---');
    // Create a mock tenant in PG1
    const tenantRes = await register(
      `tenant_rahul_${timestamp}@testpg.com`,
      'Password123!',
      'tenant',
      'Rahul Sharma',
      '+919876543210',
      undefined,
      undefined,
      testPg1Id
    );
    const testTenantId = tenantRes.user.tenantId!;

    // Create a rent record with snapshot
    const invoiceNotes = JSON.stringify({
      base_rent_paise: 800000,
      maintenance_paise: 30000,
      electricity_units: 100,
      electricity_rate_per_unit_paise: 1200,
      electricity_amount_paise: 120000,
      water_charges_paise: 20000,
      total_due_paise: 970000,
      pg_snapshot: {
        name: fetchedPg1.name,
        owner_name: fetchedPg1.owner_name,
        tagline: fetchedPg1.tagline,
        address: fetchedPg1.address,
        phone: fetchedPg1.phone,
        logo_url: fetchedPg1.logo_url,
      },
    });

    const testRentRecordId = '77777777-7777-7777-7777-777777777777';
    await supabaseAdmin.from('rent_records').delete().eq('id', testRentRecordId);
    await supabaseAdmin.from('rent_records').insert({
      id: testRentRecordId,
      pg_id: testPg1Id,
      tenant_id: testTenantId,
      month: '2026-09',
      rent_amount_paise: 800000,
      late_fee_paise: 0,
      total_due_paise: 970000,
      status: 'pending',
      due_date: '2026-09-30T00:00:00Z',
      notes: invoiceNotes,
    });

    const recordWithPg = await rentService.getRentRecord(testPg1Id, testRentRecordId);
    assert(Boolean(recordWithPg), 'Rent record retrieved successfully');
    assert(recordWithPg.pg?.name === 'Sunrise Residency & Suites', 'Attached PG profile matches PG1');
    assert(recordWithPg.pg?.owner_name === 'Rajesh Kumar', 'Attached PG profile has owner Rajesh Kumar');

    console.log('\n--- Test Suite 5: Historical Bill Immutability Verification ---');
    // Now simulate PG1 changing its name and owner 2 months later
    await pgService.updatePG(testPg1Id, {
      name: 'Sunrise Grand Towers',
      owner_name: 'Vikram Malhotra',
    }, actor1);

    // Verify current profile is updated
    const updatedProfile = await pgService.getPG(testPg1Id);
    assert(updatedProfile.name === 'Sunrise Grand Towers', 'Current PG profile updated to Sunrise Grand Towers');
    assert(updatedProfile.owner_name === 'Vikram Malhotra', 'Current PG owner updated to Vikram Malhotra');

    // Retrieve old rent record: verify historical snapshot is intact!
    const oldRecord = await rentService.getRentRecord(testPg1Id, testRentRecordId);
    const parsedOldNotes = JSON.parse(oldRecord.notes || '{}');
    assert(parsedOldNotes.pg_snapshot.name === 'Sunrise Residency & Suites', 'Historical invoice retained original name "Sunrise Residency & Suites"');
    assert(parsedOldNotes.pg_snapshot.owner_name === 'Rajesh Kumar', 'Historical invoice retained original owner "Rajesh Kumar"');

    console.log('\n--- Test Suite 6: Cross-PG Rent Record Isolation ---');
    let crossPgAccessBlocked = false;
    try {
      await rentService.getRentRecord(testPg2Id, testRentRecordId);
    } catch {
      crossPgAccessBlocked = true;
    }
    assert(crossPgAccessBlocked, 'PG2 cannot access PG1 rent record (Tenant/PG boundary enforced)');

  } catch (err: any) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    // Teardown
    await supabaseAdmin.from('settings').delete().in('key', [`pg_profile_${testPg1Id}`, `pg_profile_${testPg2Id}`]);
    await supabaseAdmin.from('rent_records').delete().in('pg_id', [testPg1Id, testPg2Id]);
    await supabaseAdmin.from('tenants').delete().in('pg_id', [testPg1Id, testPg2Id]);
    await supabaseAdmin.from('pgs').delete().in('id', [testPg1Id, testPg2Id]);
    if (admin1Id || admin2Id) {
      await supabaseAdmin.from('admins').delete().in('id', [admin1Id, admin2Id].filter(Boolean));
      await supabaseAdmin.from('auth_users').delete().in('id', [admin1Id, admin2Id].filter(Boolean));
    }
    console.log('🧹 Cleanup completed cleanly.\n');
  }

  console.log('========================================================================');
  console.log(`📊 FINAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite();
