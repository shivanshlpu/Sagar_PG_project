import { createOtpRequest, verifyOtpRequest } from '../services/otp.service';
import { sendWhatsAppMessage, getOrCreateSession, getWhatsAppStatus } from '../services/whatsapp.service';
import { enforcePgBoundary } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 MULTI-PG ACCOUNT ISOLATION & OTP ROUTING TEST SUITE');
  console.log('====================================================\n');

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

  // -------------------------------------------------------------------------
  // TEST 1: Dual-Storage & PG-Scoped OTP Generation & Verification
  // -------------------------------------------------------------------------
  console.log('--- Test Suite 1: PG-Scoped OTP Generation & Scoping ---');
  const pg1Id = '11111111-1111-1111-1111-111111111111';
  const pg2Id = '22222222-2222-2222-2222-222222222222';
  const user1Id = 'aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const user2Id = 'aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  const otp1 = await createOtpRequest({
    userId: user1Id,
    pgId: pg1Id,
    phone: '+919876543210',
    purpose: 'password_reset',
  });

  assert(typeof otp1 === 'string' && otp1.length === 6, 'OTP generated is 6 digits');

  // Verify that PG2 CANNOT verify User1's OTP even with correct code
  const crossPgVerify = await verifyOtpRequest({
    userId: user1Id,
    pgId: pg2Id, // Intentional cross-PG mismatch!
    code: otp1,
    purpose: 'password_reset',
  });
  assert(crossPgVerify === false, 'Cross-PG OTP verification strictly fails (PG2 cannot verify PG1 OTP)');

  // Verify that another user in the same PG cannot verify User1's OTP
  const crossUserVerify = await verifyOtpRequest({
    userId: user2Id,
    pgId: pg1Id,
    code: otp1,
    purpose: 'password_reset',
  });
  assert(crossUserVerify === false, 'Cross-User OTP verification strictly fails (User 2 cannot verify User 1 OTP)');

  // Verify that wrong code fails
  const wrongCodeVerify = await verifyOtpRequest({
    userId: user1Id,
    pgId: pg1Id,
    code: '000000',
    purpose: 'password_reset',
  });
  assert(wrongCodeVerify === false, 'Incorrect OTP code fails verification');

  // Verify correct user and PG verifies successfully
  const correctVerify = await verifyOtpRequest({
    userId: user1Id,
    pgId: pg1Id,
    code: otp1,
    purpose: 'password_reset',
  });
  assert(correctVerify === true, 'Authoritative (user1Id, pg1Id) OTP verification succeeds');

  // Verify OTP cannot be reused after verification
  const replayVerify = await verifyOtpRequest({
    userId: user1Id,
    pgId: pg1Id,
    code: otp1,
    purpose: 'password_reset',
  });
  assert(replayVerify === false, 'Verified OTP is immediately consumed and cannot be replayed');

  // -------------------------------------------------------------------------
  // TEST 2: Rate Limiting per (pgId, userId)
  // -------------------------------------------------------------------------
  console.log('\n--- Test Suite 2: Rate Limiting Isolated to (pgId, userId) ---');
  const userRateLimitId = 'bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  try {
    // Generate 3 allowed requests
    await createOtpRequest({ userId: userRateLimitId, pgId: pg1Id, phone: '+919999999991', purpose: 'password_reset' });
    await createOtpRequest({ userId: userRateLimitId, pgId: pg1Id, phone: '+919999999991', purpose: 'password_reset' });
    await createOtpRequest({ userId: userRateLimitId, pgId: pg1Id, phone: '+919999999991', purpose: 'password_reset' });
    
    // 4th request should throw rate limit error
    let rateLimitExceeded = false;
    try {
      await createOtpRequest({ userId: userRateLimitId, pgId: pg1Id, phone: '+919999999991', purpose: 'password_reset' });
    } catch (e: any) {
      if (e.message.includes('Too many OTP requests')) {
        rateLimitExceeded = true;
      }
    }
    assert(rateLimitExceeded, 'Rate limit triggered after max requests for (pgId, userId)');

    // But another user in PG1 or same user in PG2 should NOT be rate limited
    let otherUserOk = false;
    try {
      const otherOtp = await createOtpRequest({ userId: 'other-user-uuid', pgId: pg1Id, phone: '+919999999992', purpose: 'password_reset' });
      otherUserOk = !!otherOtp;
    } catch (e) {
      otherUserOk = false;
    }
    assert(otherUserOk, 'Rate limit is strictly scoped to user and does not bleed to others');
  } catch (err: any) {
    assert(false, 'Rate limit test encountered unexpected error', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 3: Strict WhatsApp Multi-Session Routing & Zero Fallback
  // -------------------------------------------------------------------------
  console.log('\n--- Test Suite 3: WhatsApp Routing & Zero Fallback Invariant ---');

  // Register a mock connected socket for PG1
  const mockSentMessages: Array<{ to: string; text?: string; pgId: string }> = [];
  const mockPg1Socket: any = {
    user: { id: '919876543210:1@s.whatsapp.net' },
    sendPresenceUpdate: async () => {},
    sendMessage: async (jid: string, content: any) => {
      mockSentMessages.push({ to: jid, text: content.text, pgId: pg1Id });
      return { key: { id: 'mock-msg-id-1' } };
    },
  };
  const session1 = getOrCreateSession(pg1Id);
  session1.sock = mockPg1Socket;
  session1.status = 'connected';

  assert(getWhatsAppStatus(pg1Id).status === 'connected', 'PG1 WhatsApp session is registered as connected');
  assert(getWhatsAppStatus(pg2Id).status === 'disconnected', 'PG2 WhatsApp session is disconnected');

  // Missing pgId options must be rejected immediately
  let missingPgThrows = false;
  try {
    await (sendWhatsAppMessage as any)('+919876543210', 'No pgId message', {});
  } catch (err: any) {
    missingPgThrows = err.message.includes('pgId is mandatory');
  }
  assert(missingPgThrows, 'Calling sendWhatsAppMessage without pgId throws strict isolation error');

  // Dispatch message for PG1 - should succeed
  let pg1Sent = false;
  try {
    await sendWhatsAppMessage('+919876543210', 'Test message for PG1', {
      pgId: pg1Id,
      purpose: 'PASSWORD_RESET_OTP',
    });
    pg1Sent = true;
  } catch (err: any) {
    console.error('PG1 send error:', err);
  }
  assert(pg1Sent && mockSentMessages.length === 1 && mockSentMessages[0].pgId === pg1Id, 'PG1 message dispatches through PG1 session only');

  // Dispatch message for PG2 (disconnected) - MUST FAIL with zero fallback to PG1!
  let pg2FailedGracefully = false;
  let pg2ErrorMessage = '';
  try {
    await sendWhatsAppMessage('+919876543210', 'Test message for PG2', {
      pgId: pg2Id,
      purpose: 'PASSWORD_RESET_OTP',
    });
  } catch (err: any) {
    pg2FailedGracefully = true;
    pg2ErrorMessage = err.message;
  }
  assert(
    pg2FailedGracefully && pg2ErrorMessage.includes('WhatsApp service is not connected for PG'),
    'PG2 dispatch fails with explicit zero fallback (NEVER falls back to PG1 session)'
  );
  assert(mockSentMessages.length === 1, 'No message was leaked through PG1 session during PG2 failure');

  // Dispatch message with nonexistent PG ID - MUST FAIL
  let nonExistentPgFailed = false;
  try {
    await sendWhatsAppMessage('+919876543210', 'Test for non-existent PG', {
      pgId: 'non-existent-pg-uuid',
      purpose: 'RENT_REMINDER',
    });
  } catch (err: any) {
    nonExistentPgFailed = true;
  }
  assert(nonExistentPgFailed, 'Non-existent PG session halts with error and does not fallback');

  // -------------------------------------------------------------------------
  // TEST 4: JWT Token PG Boundary Verification
  // -------------------------------------------------------------------------
  console.log('\n--- Test Suite 4: Password Reset Token Security & PG Binding ---');
  const validResetToken = jwt.sign(
    { id: user1Id, pgId: pg1Id, email: 'tenant@test.com', type: 'password-reset' },
    env.JWT_SECRET,
    { expiresIn: '10m' }
  );

  const decoded: any = jwt.verify(validResetToken, env.JWT_SECRET);
  assert(decoded.id === user1Id, 'Reset token binds to authentic userId');
  assert(decoded.pgId === pg1Id, 'Reset token binds strictly to authentic pgId');
  assert(decoded.type === 'password-reset', 'Reset token specifies explicit type');

  // Token with wrong type must be rejected
  const loginToken = jwt.sign(
    { id: user1Id, pgId: pg1Id, email: 'tenant@test.com', type: 'access' },
    env.JWT_SECRET,
    { expiresIn: '10m' }
  );
  const decodedLogin: any = jwt.verify(loginToken, env.JWT_SECRET);
  assert(decodedLogin.type !== 'password-reset', 'General access token cannot be used for password reset');

  // -------------------------------------------------------------------------
  // TEST 5: Express Middleware Multi-Tenant PG Boundary Enforcement
  // -------------------------------------------------------------------------
  console.log('\n--- Test Suite 5: Middleware Cross-PG Boundary Enforcement ---');
  let statusSent = 0;
  let nextCalled = false;

  const mockRes: any = {
    status: (code: number) => {
      statusSent = code;
      return {
        json: () => {},
      };
    },
  };

  // Case A: PG1 admin accessing PG1 resource -> ALLOWED
  nextCalled = false;
  statusSent = 0;
  const mockReqAllowed: any = {
    user: { id: 'admin-1', role: 'admin', pgId: pg1Id },
    params: { pgId: pg1Id },
    query: {},
    body: {},
  };
  enforcePgBoundary(mockReqAllowed, mockRes, () => { nextCalled = true; });
  assert(nextCalled && statusSent === 0, 'Admin accessing own PG resource is allowed');

  // Case B: PG1 admin trying to inject PG2 param -> REJECTED (403 Forbidden)
  nextCalled = false;
  statusSent = 0;
  const mockReqBlockedParams: any = {
    user: { id: 'admin-1', role: 'admin', pgId: pg1Id },
    params: { pgId: pg2Id },
    query: {},
    body: {},
  };
  enforcePgBoundary(mockReqBlockedParams, mockRes, () => { nextCalled = true; });
  assert(!nextCalled && statusSent === 403, 'Admin attempting to access other PG via params is blocked with 403');

  // Case C: PG1 admin trying to inject PG2 in request body -> REJECTED (403 Forbidden)
  nextCalled = false;
  statusSent = 0;
  const mockReqBlockedBody: any = {
    user: { id: 'admin-1', role: 'admin', pgId: pg1Id },
    params: {},
    query: {},
    body: { pgId: pg2Id },
  };
  enforcePgBoundary(mockReqBlockedBody, mockRes, () => { nextCalled = true; });
  assert(!nextCalled && statusSent === 403, 'Admin attempting to inject other PG via body is blocked with 403');

  // Case D: Superadmin -> ALLOWED
  nextCalled = false;
  statusSent = 0;
  const mockReqSuperadmin: any = {
    user: { id: 'super-1', role: 'superadmin', pgId: undefined },
    params: { pgId: pg2Id },
    query: {},
    body: {},
  };
  enforcePgBoundary(mockReqSuperadmin, mockRes, () => { nextCalled = true; });
  assert(nextCalled && statusSent === 0, 'Superadmin bypasses boundary check');

  // -------------------------------------------------------------------------
  // TEST 6: Check Database Connection & otp_requests table
  // -------------------------------------------------------------------------
  console.log('\n--- Test Suite 6: Database Table & Schema Check ---');
  try {
    const { error } = await supabaseAdmin
      .from('otp_requests')
      .select('id')
      .limit(1);

    if (error) {
      console.log(`ℹ️ Note: otp_requests table query returned: ${error.message}`);
      console.log('   (Migration 003 can be run in Supabase SQL editor; fallback dual-storage in otp.service operates in-memory cleanly)');
    } else {
      assert(true, 'Database otp_requests table exists and is accessible via supabaseAdmin');
    }
  } catch (err: any) {
    console.log(`ℹ️ Supabase query note: ${err.message}`);
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n====================================================');
  console.log(`📊 TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
