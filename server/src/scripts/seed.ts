import { supabaseAdmin } from '../config/supabase';
import crypto from 'crypto';

async function seed() {
  console.log('🌱 Starting database seed with realistic PG data...\n');

  // -------------------------------------------------------------
  // 1. ADMIN USER
  // -------------------------------------------------------------
  console.log('1️⃣ Creating Admin Account...');
  const adminEmail = 'admin@pg.com';
  const adminPassword = 'Admin@123456';
  let adminUserId: string;

  // Check if admin already exists in Supabase Auth
  const { data: existingAdminUser } = await supabaseAdmin.auth.admin.listUsers();
  const foundAdmin = existingAdminUser?.users?.find((u) => u.email === adminEmail);

  if (foundAdmin) {
    adminUserId = foundAdmin.id;
    console.log(`   Admin auth user exists: ${adminUserId}`);
  } else {
    const { data: newAdmin, error: adminErr } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { role: 'admin', full_name: 'Rajesh Sharma (Owner)' },
    });
    if (adminErr) throw new Error(`Admin creation failed: ${adminErr.message}`);
    adminUserId = newAdmin.user.id;
    console.log(`   Created new admin auth user: ${adminUserId}`);
  }

  // Upsert into admins table
  const { error: adminTableErr } = await supabaseAdmin.from('admins').upsert({
    user_id: adminUserId,
    full_name: 'Rajesh Sharma',
    email: adminEmail,
    phone: '+919876543210',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (adminTableErr) console.warn('   Admin table upsert warning:', adminTableErr.message);

  // -------------------------------------------------------------
  // 2. ROOMS & BEDS
  // -------------------------------------------------------------
  console.log('\n2️⃣ Creating Rooms & Beds across multiple floors...');
  const roomsData = [
    { room_number: '101', floor: 1, room_type: 'single', total_beds: 1, base_rent_paise: 1400000, notes: 'Spacious corner room with balcony and attached bathroom' },
    { room_number: '102', floor: 1, room_type: 'double', total_beds: 2, base_rent_paise: 900000, notes: 'East-facing double room with 2 study tables and wardrobes' },
    { room_number: '103', floor: 1, room_type: 'double', total_beds: 2, base_rent_paise: 900000, notes: 'Road-facing double sharing with air conditioning' },
    { room_number: '201', floor: 2, room_type: 'single', total_beds: 1, base_rent_paise: 1500000, notes: 'Executive single suite with high-speed router access' },
    { room_number: '202', floor: 2, room_type: 'triple', total_beds: 3, base_rent_paise: 750000, notes: 'Spacious triple sharing room with individual lockers' },
    { room_number: '203', floor: 2, room_type: 'double', total_beds: 2, base_rent_paise: 950000, notes: 'Double sharing with private washroom and mini-fridge' },
    { room_number: '301', floor: 3, room_type: 'double', total_beds: 2, base_rent_paise: 950000, notes: '3rd floor double room with quiet rooftop view' },
    { room_number: '302', floor: 3, room_type: 'dormitory', total_beds: 4, base_rent_paise: 600000, notes: 'Economy 4-bed dormitory for students/interns' },
  ];

  const createdRooms: any[] = [];
  const createdBeds: any[] = [];

  for (const r of roomsData) {
    const { data: room, error: rErr } = await supabaseAdmin
      .from('rooms')
      .upsert({
        ...r,
        occupied_beds: 0,
        status: 'available',
      }, { onConflict: 'room_number' })
      .select()
      .single();

    if (rErr) throw new Error(`Room ${r.room_number} failed: ${rErr.message}`);
    createdRooms.push(room);

    // Create beds for this room
    for (let i = 1; i <= r.total_beds; i++) {
      const bedLetter = String.fromCharCode(64 + i);
      const bedNumber = `${r.room_number}-${bedLetter}`;

      const { data: bed, error: bErr } = await supabaseAdmin
        .from('beds')
        .upsert({
          room_id: room.id,
          bed_number: bedNumber,
          status: 'vacant',
        }, { onConflict: 'id' })
        .select()
        .single();

      if (!bErr && bed) {
        createdBeds.push({ ...bed, room_number: r.room_number, floor: r.floor });
      }
    }
  }
  console.log(`   Created ${createdRooms.length} rooms and ${createdBeds.length} beds.`);

  // -------------------------------------------------------------
  // 3. TENANTS
  // -------------------------------------------------------------
  console.log('\n3️⃣ Creating Tenants and assigning beds...');
  const tenantProfiles = [
    { name: 'Aarav Patel', email: 'tenant@pg.com', phone: '9009149694', dep: 2000000, roomIdx: 0, bedIdx: 0, moveIn: '2026-01-10', address: 'B-12, Satellite, Ahmedabad, Gujarat', emName: 'Kirit Patel (Father)', emPhone: '9009149694' },
    { name: 'Rohan Verma', email: 'rohan.v@gmail.com', phone: '9009149694', dep: 1800000, roomIdx: 1, bedIdx: 1, moveIn: '2026-02-01', address: '44, Civil Lines, Jaipur, Rajasthan', emName: 'Sunita Verma (Mother)', emPhone: '9009149694' },
    { name: 'Priya Sharma', email: 'priya.s@gmail.com', phone: '9009149694', dep: 1800000, roomIdx: 1, bedIdx: 2, moveIn: '2026-02-15', address: '120/A, Gomti Nagar, Lucknow, UP', emName: 'Anil Sharma (Father)', emPhone: '9009149694' },
    { name: 'Vikram Malhotra', email: 'vikram.m@gmail.com', phone: '9009149694', dep: 3000000, roomIdx: 3, bedIdx: 5, moveIn: '2026-03-01', address: 'Flat 402, Green Glen, Bangalore, Karnataka', emName: 'Rajiv Malhotra (Brother)', emPhone: '9009149694' },
    { name: 'Ananya Iyer', email: 'ananya.i@gmail.com', phone: '9009149694', dep: 1500000, roomIdx: 4, bedIdx: 6, moveIn: '2026-04-10', address: 'Plot 18, Mylapore, Chennai, Tamil Nadu', emName: 'Lakshmi Iyer (Mother)', emPhone: '9009149694' },
    { name: 'Siddharth Rao', email: 'siddharth.r@gmail.com', phone: '9009149694', dep: 1500000, roomIdx: 4, bedIdx: 7, moveIn: '2026-05-01', address: 'H.No 3-4-12, Kachiguda, Hyderabad, Telangana', emName: 'Venkat Rao (Father)', emPhone: '9009149694' },
    { name: 'Neha Gupta', email: 'neha.g@gmail.com', phone: '9009149694', dep: 1900000, roomIdx: 5, bedIdx: 9, moveIn: '2026-06-01', address: 'Sector 21-C, Chandigarh', emName: 'Dinesh Gupta (Father)', emPhone: '9009149694' },
    { name: 'Karan Singh', email: 'karan.s@gmail.com', phone: '9009149694', dep: 1200000, roomIdx: 7, bedIdx: 13, moveIn: '2026-07-01', address: '55, Model Town, Jalandhar, Punjab', emName: 'Harpreet Singh (Uncle)', emPhone: '9009149694' },
  ];

  const createdTenants: any[] = [];

  for (const t of tenantProfiles) {
    // Check or create auth user
    let tUserId: string;
    const existing = existingAdminUser?.users?.find((u) => u.email === t.email);
    if (existing) {
      tUserId = existing.id;
    } else {
      const { data: newU, error: uErr } = await supabaseAdmin.auth.admin.createUser({
        email: t.email,
        password: 'Tenant@123456',
        email_confirm: true,
        user_metadata: { role: 'tenant', full_name: t.name },
      });
      if (uErr) {
        // Fallback: generate a unique UUID if auth user creation limits hit
        tUserId = crypto.randomUUID();
      } else {
        tUserId = newU.user.id;
      }
    }

    const targetRoom = createdRooms[t.roomIdx];
    const targetBed = createdBeds[t.bedIdx];

    const { data: tenant, error: tErr } = await supabaseAdmin
      .from('tenants')
      .upsert({
        user_id: tUserId,
        full_name: t.name,
        email: t.email,
        phone: t.phone,
        emergency_contact_name: t.emName,
        emergency_contact_phone: t.emPhone,
        permanent_address: t.address,
        room_id: targetRoom?.id || null,
        bed_id: targetBed?.id || null,
        move_in_date: new Date(t.moveIn).toISOString(),
        security_deposit_paise: t.dep,
        status: 'active',
        notes: 'Documents verified. Background check clear.',
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (!tErr && tenant) {
      createdTenants.push({ ...tenant, room: targetRoom, bed: targetBed });

      // Mark bed as occupied
      if (targetBed) {
        await supabaseAdmin.from('beds').update({
          status: 'occupied',
          tenant_id: tenant.id,
        }).eq('id', targetBed.id);
      }
    }
  }

  // Update room occupied_beds count
  for (const r of createdRooms) {
    const { count } = await supabaseAdmin
      .from('beds')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', r.id)
      .eq('status', 'occupied');

    const occ = count || 0;
    const status = occ >= r.total_beds ? 'full' : 'available';
    await supabaseAdmin.from('rooms').update({ occupied_beds: occ, status }).eq('id', r.id);
  }
  console.log(`   Created ${createdTenants.length} tenants with active room/bed assignments.`);

  // -------------------------------------------------------------
  // 4. RENT RECORDS (July, August, September 2026)
  // -------------------------------------------------------------
  console.log('\n4️⃣ Generating Rent Records for 3 months...');
  const months = ['2026-07', '2026-08', '2026-09'];
  const createdRentRecords: any[] = [];

  for (const t of createdTenants) {
    const rentPaise = t.room?.base_rent_paise || 900000;

    for (const m of months) {
      let status: 'paid' | 'pending' | 'overdue' = 'paid';
      let lateFee = 0;
      let paidDate: string | null = `${m}-04T11:30:00Z`;

      if (m === '2026-09') {
        // Current month: mix of paid, pending, overdue
        if (t.full_name === 'Rohan Verma') {
          status = 'overdue';
          lateFee = 50000; // Rs 500 late fee
          paidDate = null;
        } else if (t.full_name === 'Karan Singh' || t.full_name === 'Siddharth Rao') {
          status = 'pending';
          paidDate = null;
        }
      }

      const totalDue = rentPaise + lateFee;
      const dueDate = `${m}-05T18:00:00Z`;

      const { data: rentRec, error: rentErr } = await supabaseAdmin
        .from('rent_records')
        .upsert({
          tenant_id: t.id,
          room_id: t.room_id,
          month: m,
          rent_amount_paise: rentPaise,
          late_fee_paise: lateFee,
          total_due_paise: totalDue,
          status,
          due_date: dueDate,
          paid_date: paidDate,
          notes: status === 'overdue' ? 'Late fee applied after 5-day grace period' : 'Standard monthly rent',
        }, { onConflict: 'tenant_id,month' })
        .select()
        .single();

      if (!rentErr && rentRec) {
        createdRentRecords.push(rentRec);
      }
    }
  }
  console.log(`   Created ${createdRentRecords.length} rent records.`);

  // -------------------------------------------------------------
  // 5. ELECTRICITY BILLS
  // -------------------------------------------------------------
  console.log('\n5️⃣ Generating Electricity Bills...');
  const createdElectricity: any[] = [];

  for (const t of createdTenants) {
    for (const m of months) {
      const prev = 1100 + Math.floor(Math.random() * 400);
      const units = 120 + Math.floor(Math.random() * 80);
      const curr = prev + units;
      const rate = 1000; // Rs 10 / unit in paise
      const total = units * rate;
      const status = m === '2026-09' && t.full_name === 'Rohan Verma' ? 'pending' : 'paid';

      const { data: elec, error: eErr } = await supabaseAdmin
        .from('electricity_bills')
        .upsert({
          tenant_id: t.id,
          room_id: t.room_id,
          month: m,
          previous_reading: prev,
          current_reading: curr,
          units_consumed: units,
          rate_per_unit_paise: rate,
          total_amount_paise: total,
          status,
          notes: `Sub-meter verified reading for ${m}`,
        }, { onConflict: 'tenant_id,month' })
        .select()
        .single();

      if (!eErr && elec) {
        createdElectricity.push(elec);
      }
    }
  }
  console.log(`   Created ${createdElectricity.length} electricity bills.`);

  // -------------------------------------------------------------
  // 6. PAYMENTS
  // -------------------------------------------------------------
  console.log('\n6️⃣ Generating Payment Submissions...');
  const paymentMethods = ['upi', 'bank_transfer', 'cash', 'upi'] as const;
  let payCount = 0;

  for (const r of createdRentRecords) {
    if (r.status === 'paid') {
      const method = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
      await supabaseAdmin.from('payments').insert({
        tenant_id: r.tenant_id,
        rent_record_id: r.id,
        amount_paise: r.total_due_paise,
        payment_method: method,
        status: 'verified',
        verified_by: adminUserId,
        verified_at: r.paid_date || new Date().toISOString(),
        notes: `Rent payment for ${r.month} via ${method.toUpperCase()} (UTR: ${Math.floor(100000000000 + Math.random() * 900000000000)})`,
      });
      payCount++;
    }
  }

  // Add 1 pending submission and 1 rejected submission for realistic testing
  if (createdTenants.length > 0) {
    await supabaseAdmin.from('payments').insert({
      tenant_id: createdTenants[1].id,
      amount_paise: 900000,
      payment_method: 'upi',
      status: 'submitted',
      notes: 'Submitted via GPay. Ref: UPI/625519827391',
    });

    await supabaseAdmin.from('payments').insert({
      tenant_id: createdTenants[2].id,
      amount_paise: 900000,
      payment_method: 'upi',
      status: 'rejected',
      rejection_reason: 'UTR reference not found in bank statement. Please verify and resubmit.',
      notes: 'Payment verification failed',
    });
    payCount += 2;
  }
  console.log(`   Created ${payCount} payment transactions.`);

  // -------------------------------------------------------------
  // 7. COMPLAINTS & COMMENTS
  // -------------------------------------------------------------
  console.log('\n7️⃣ Creating Complaints & Comments...');
  const complaintsData = [
    {
      tIdx: 0,
      category: 'maintenance',
      title: 'Geyser not heating properly in Room 101',
      desc: 'The geyser light turns on but water does not heat beyond lukewarm even after 20 minutes.',
      priority: 'high',
      status: 'in_progress',
      assigned_to: 'Ramesh (Electrician)',
    },
    {
      tIdx: 1,
      category: 'other',
      title: 'Wi-Fi connectivity drops frequently in Room 102',
      desc: 'Frequent disconnections between 8 PM and 11 PM during office video calls.',
      priority: 'medium',
      status: 'open',
      assigned_to: null,
    },
    {
      tIdx: 3,
      category: 'maintenance',
      title: 'AC water leakage inside Room 201',
      desc: 'Indoor AC unit has water dripping on the study table since yesterday.',
      priority: 'urgent',
      status: 'in_progress',
      assigned_to: 'CoolAir AC Technicians',
    },
    {
      tIdx: 4,
      category: 'cleanliness',
      title: 'Common corridor dustbin overflowing on 2nd Floor',
      desc: 'Housekeeping missed emptying the common corridor dustbin today morning.',
      priority: 'low',
      status: 'resolved',
      assigned_to: 'Housekeeping Supervisor',
      resNote: 'Dustbin emptied and area sanitized at 11:30 AM by morning shift staff.',
    },
    {
      tIdx: 5,
      category: 'noise',
      title: 'Loud music late night from adjacent terrace area',
      desc: 'Loud music after midnight on Friday night made it difficult to sleep.',
      priority: 'medium',
      status: 'closed',
      assigned_to: 'Caretaker Suresh',
      resNote: 'Spoke with students; terrace curfew re-enforced at 10:30 PM strictly.',
    },
  ];

  for (const c of complaintsData) {
    const t = createdTenants[c.tIdx] || createdTenants[0];
    const { data: comp, error: cErr } = await supabaseAdmin.from('complaints').insert({
      tenant_id: t.id,
      room_id: t.room_id,
      category: c.category,
      title: c.title,
      description: c.desc,
      priority: c.priority,
      status: c.status,
      assigned_to: c.assigned_to,
      resolution_note: (c as any).resNote || null,
      resolved_at: (c as any).resNote ? new Date().toISOString() : null,
    }).select().single();

    if (!cErr && comp) {
      // Add comments
      await supabaseAdmin.from('complaint_comments').insert([
        {
          complaint_id: comp.id,
          author_id: t.user_id,
          author_role: 'tenant',
          content: 'Please look into this soon as it is affecting daily routine.',
        },
        {
          complaint_id: comp.id,
          author_id: adminUserId,
          author_role: 'admin',
          content: 'Acknowledged. Our team has been assigned and will visit during the daytime inspection window.',
        },
      ]);
    }
  }
  console.log(`   Created ${complaintsData.length} complaints with threaded comments.`);

  // -------------------------------------------------------------
  // 8. CONTACTS & EMERGENCY DIRECTORY
  // -------------------------------------------------------------
  console.log('\n8️⃣ Adding Staff & Emergency Contacts...');
  const contactsList = [
    { name: 'Suresh Kumar (Caretaker)', role: 'PG Caretaker & Facility Manager', phone: '+919811223344', is_emergency: false },
    { name: 'Ramesh Sharma', role: 'Chief Electrician & Power Backup', phone: '+919822334455', is_emergency: false },
    { name: 'Manoj Verma', role: 'Plumber & Water Supply', phone: '+919833445566', is_emergency: false },
    { name: 'Rajesh Sharma (Owner)', role: 'Property Owner / 24x7 Emergency', phone: '+919876543210', is_emergency: true },
    { name: 'Dr. Mehra / Fortis Ambulance', role: 'Medical Emergency & Ambulance', phone: '102 / +911147134444', is_emergency: true },
    { name: 'Sector 14 Police Station', role: 'Local Police & PCR Help', phone: '112 / +911124356789', is_emergency: true },
  ];

  for (const c of contactsList) {
    await supabaseAdmin.from('contacts').insert(c);
  }
  console.log(`   Created ${contactsList.length} contacts (including 3 emergency contacts).`);

  // -------------------------------------------------------------
  // 9. WI-FI NETWORKS (Multi-floor)
  // -------------------------------------------------------------
  console.log('\n9️⃣ Configuring Multi-Floor Wi-Fi Networks...');
  const wifiPayload = {
    networks: [
      { id: 'wifi_gf', name: 'PG_GroundFloor_HighSpeed', password: 'groundFloorPass2026', floor: 'Ground Floor', notes: 'Best coverage in dining area and rooms 001-002' },
      { id: 'wifi_f1', name: 'PG_1stFloor_5G', password: 'floor1Pass2026', floor: '1st Floor', notes: 'High-speed 5GHz router near room 102' },
      { id: 'wifi_f2', name: 'PG_2ndFloor_5G', password: 'floor2Pass2026', floor: '2nd Floor', notes: 'High-speed 5GHz router in corridor' },
      { id: 'wifi_f3', name: 'PG_3rdFloor_Mesh', password: 'floor3Pass2026', floor: '3rd Floor', notes: 'Covers 3rd floor dormitory and rooftop terrace' },
    ],
  };

  await supabaseAdmin.from('settings').upsert({
    key: 'wifi',
    value: wifiPayload,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });
  console.log('   Configured 4 floor-wise Wi-Fi networks.');

  // -------------------------------------------------------------
  // 10. NOTIFICATIONS & AUDIT LOGS
  // -------------------------------------------------------------
  console.log('\n🔟 Generating Notifications & Audit Trail...');
  await supabaseAdmin.from('notifications').insert([
    {
      user_id: adminUserId,
      title: 'New Complaint Registered',
      message: 'Aarav Patel (Room 101) registered a maintenance complaint regarding the geyser.',
      type: 'complaint',
      is_read: false,
    },
    {
      user_id: adminUserId,
      title: 'Payment Submitted for Verification',
      message: 'Rohan Verma submitted ₹9,000 for September rent via UPI.',
      type: 'payment',
      is_read: false,
    },
    {
      user_id: createdTenants[0]?.user_id || adminUserId,
      title: 'Rent Receipt Generated',
      message: 'Your payment of ₹14,000 for August 2026 has been verified. Download your receipt from the portal.',
      type: 'rent',
      is_read: true,
    },
  ]);

  await supabaseAdmin.from('audit_log').insert([
    {
      actor_id: adminUserId,
      actor_email: adminEmail,
      action: 'SEED_DATABASE',
      entity_type: 'system',
      entity_id: 'seed-2026',
      details: { message: 'Initialized sample data across all modules' },
    },
    {
      actor_id: adminUserId,
      actor_email: adminEmail,
      action: 'UPDATE_WIFI_SETTINGS',
      entity_type: 'settings',
      entity_id: 'wifi',
      details: { networksCount: 4 },
    },
  ]);

  console.log('\n🎉 DATABASE SEEDING COMPLETED SUCCESSFULLY!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔑 TEST LOGIN CREDENTIALS:');
  console.log('   👨‍💼 Admin Login:');
  console.log(`      Email:    ${adminEmail}`);
  console.log(`      Password: ${adminPassword}`);
  console.log('   🧑‍🎓 Tenant Login:');
  console.log('      Email:    tenant@pg.com');
  console.log('      Password: Tenant@123456');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

seed().catch((err) => {
  console.error('\n❌ Seeding failed with error:', err);
  process.exit(1);
});
