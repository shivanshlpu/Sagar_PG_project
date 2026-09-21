import { supabaseAdmin } from '../config/supabase';

export interface PGContext {
  pgName: string;
  wifi: { ssid: string; password: string };
  rules: string;
  rooms: {
    total: number;
    available: number;
    full: number;
    list: Array<{ room_number: string; room_type: string; total_beds: number; status: string }>;
  };
  tenants: {
    total: number;
    active: number;
    list: Array<{ name: string; room_number: string; phone: string; status: string }>;
  };
  rent: {
    pendingCount: number;
    overdueCount: number;
    totalPendingAmount: number;
    pendingList: Array<{ tenantName: string; roomNumber: string; amount: number; dueDate: string; status: string }>;
  };
  complaints: {
    openCount: number;
    inProgressCount: number;
    list: Array<{ id: string; category: string; description: string; status: string; tenantName: string }>;
  };
  recentPayments: Array<{ tenantName: string; amount: number; date: string; status: string }>;
}

/**
 * Retrieve current live database context for the PG owner
 */
export async function getPGContext(pgId: string): Promise<PGContext> {
  const [
    pgRes,
    settingsRes,
    roomsRes,
    tenantsRes,
    rentRes,
    complaintsRes,
    paymentsRes
  ] = await Promise.all([
    supabaseAdmin.from('pgs').select('name').eq('id', pgId).maybeSingle(),
    supabaseAdmin.from('property_settings').select('*').eq('pg_id', pgId).maybeSingle(),
    supabaseAdmin.from('rooms').select('id, room_number, room_type, total_beds, status').eq('pg_id', pgId),
    supabaseAdmin.from('tenants').select('id, full_name, phone, status, room:rooms(room_number)').eq('pg_id', pgId),
    supabaseAdmin.from('rent_records').select('id, total_due_paise, due_date, status, tenant:tenants(full_name, room:rooms(room_number))').eq('pg_id', pgId).in('status', ['pending', 'overdue', 'partially_paid']),
    supabaseAdmin.from('complaints').select('id, category, description, status, tenant:tenants(full_name)').eq('pg_id', pgId).in('status', ['open', 'in_progress']),
    supabaseAdmin.from('payments').select('id, amount_paise, created_at, status, tenant:tenants(full_name)').eq('pg_id', pgId).order('created_at', { ascending: false }).limit(5),
  ]);

  const rooms = roomsRes.data || [];
  const tenants = tenantsRes.data || [];
  const rentRecords = rentRes.data || [];
  const complaints = complaintsRes.data || [];
  const payments = paymentsRes.data || [];

  const pendingList = rentRecords.map((r: any) => ({
    tenantName: r.tenant?.full_name || 'Unknown',
    roomNumber: r.tenant?.room?.room_number || 'N/A',
    amount: Math.round(r.total_due_paise / 100),
    dueDate: r.due_date,
    status: r.status,
  }));

  const totalPendingAmount = pendingList.reduce((sum, item) => sum + item.amount, 0);

  return {
    pgName: pgRes.data?.name || 'My PG',
    wifi: {
      ssid: settingsRes.data?.wifi_ssid || 'Not configured',
      password: settingsRes.data?.wifi_password || 'Not configured',
    },
    rules: settingsRes.data?.rules || 'Standard PG rules apply.',
    rooms: {
      total: rooms.length,
      available: rooms.filter((r) => r.status === 'available').length,
      full: rooms.filter((r) => r.status === 'full').length,
      list: rooms.map((r) => ({
        room_number: r.room_number,
        room_type: r.room_type,
        total_beds: r.total_beds,
        status: r.status,
      })),
    },
    tenants: {
      total: tenants.length,
      active: tenants.filter((t) => t.status === 'active').length,
      list: tenants.map((t: any) => ({
        name: t.full_name,
        room_number: t.room?.room_number || 'N/A',
        phone: t.phone || 'N/A',
        status: t.status,
      })),
    },
    rent: {
      pendingCount: pendingList.filter((r) => r.status === 'pending').length,
      overdueCount: pendingList.filter((r) => r.status === 'overdue').length,
      totalPendingAmount,
      pendingList,
    },
    complaints: {
      openCount: complaints.filter((c) => c.status === 'open').length,
      inProgressCount: complaints.filter((c) => c.status === 'in_progress').length,
      list: complaints.map((c: any) => ({
        id: c.id,
        category: c.category,
        description: c.description,
        status: c.status,
        tenantName: c.tenant?.full_name || 'Anonymous',
      })),
    },
    recentPayments: payments.map((p: any) => ({
      tenantName: p.tenant?.full_name || 'Unknown',
      amount: Math.round(p.amount_paise / 100),
      date: p.created_at,
      status: p.status,
    })),
  };
}

/**
 * Intelligent Grounded AI Query Agent (RAG)
 */
export async function queryPGAgent(
  pgId: string,
  userQuery: string,
  language: 'hi' | 'en' | 'hinglish' = 'hinglish'
): Promise<{
  answer: string;
  language: 'hi' | 'en' | 'hinglish';
  suggestions: string[];
  dataSummary: Record<string, unknown>;
}> {
  const context = await getPGContext(pgId);
  const q = userQuery.toLowerCase().trim();

  // If GEMINI_API_KEY is configured in .env, use Gemini 1.5 Flash
  if (process.env.GEMINI_API_KEY) {
    try {
      const prompt = `You are a helpful, respectful AI Assistant for a PG owner running "${context.pgName}".
You must answer questions strictly based on the following real database records:
${JSON.stringify(context, null, 2)}

Instructions:
1. Answer ONLY using the facts given above. Do not invent or assume anything.
2. If information is not in the data, clearly and politely say it is not available in the database.
3. Language: Respond in ${language === 'hi' ? 'Hindi (in Devanagari script)' : language === 'hinglish' ? 'conversational Hinglish (Hindi written in English alphabet)' : 'English'}.
4. Keep the answer brief, friendly, and easy to understand for a non-tech-savvy PG owner.
5. Provide bullet points if listing tenants or rooms.
6. The user asked: "${userQuery}"`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 500, temperature: 0.2 },
          }),
        }
      );

      if (response.ok) {
        const data = (await response.json()) as any;
        const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (aiText) {
          return {
            answer: aiText.trim(),
            language,
            suggestions: getSuggestedQuestions(language),
            dataSummary: {
              activeTenants: context.tenants.active,
              pendingAmount: context.rent.totalPendingAmount,
              availableRooms: context.rooms.available,
              openComplaints: context.complaints.openCount,
            },
          };
        }
      }
    } catch (err) {
      console.warn('[AI Service] Gemini API call failed, using deterministic RAG engine:', err);
    }
  }

  // Built-in Deterministic Grounded RAG Engine
  const answer = evaluateGroundedQuery(context, q, language);
  return {
    answer,
    language,
    suggestions: getSuggestedQuestions(language),
    dataSummary: {
      activeTenants: context.tenants.active,
      pendingAmount: context.rent.totalPendingAmount,
      availableRooms: context.rooms.available,
      openComplaints: context.complaints.openCount,
    },
  };
}

/**
 * Built-in Rule-based Grounded Engine for 100% offline & keyless reliability
 */
function evaluateGroundedQuery(ctx: PGContext, q: string, lang: 'hi' | 'en' | 'hinglish'): string {
  // Rent / Pending money query
  if (
    q.includes('rent') ||
    q.includes('baki') ||
    q.includes('pending') ||
    q.includes('paise') ||
    q.includes('due') ||
    q.includes('overdue') ||
    q.includes('किराया') ||
    q.includes('बकाया')
  ) {
    if (ctx.rent.pendingList.length === 0) {
      if (lang === 'hi') return 'बहुत बढ़िया! अभी किसी भी किराएदार का किराया बकाया नहीं है। सबने समय पर भुगतान कर दिया है।';
      if (lang === 'hinglish') return 'Bahut badhiya! Abhi kisi bhi tenant ka rent pending nahi hai. Sabhi payments clear hain.';
      return 'Great news! There is currently no pending rent. All tenants are up to date.';
    }

    const listStr = ctx.rent.pendingList
      .map((r) => `• ${r.tenantName} (Room ${r.roomNumber}): ₹${r.amount.toLocaleString('en-IN')}`)
      .join('\n');

    if (lang === 'hi') {
      return `कुल ₹${ctx.rent.totalPendingAmount.toLocaleString('en-IN')} का किराया बकाया है (${ctx.rent.pendingList.length} किराएदार):\n\n${listStr}\n\nआप किराएदारों को सीधे WhatsApp पर रिमाइंडर भेज सकते हैं।`;
    }
    if (lang === 'hinglish') {
      return `Total ₹${ctx.rent.totalPendingAmount.toLocaleString('en-IN')} ka rent baki hai (${ctx.rent.pendingList.length} tenants):\n\n${listStr}\n\nAap in sabhi ko WhatsApp reminder bhej sakte hain.`;
    }
    return `Total pending rent is ₹${ctx.rent.totalPendingAmount.toLocaleString('en-IN')} across ${ctx.rent.pendingList.length} tenants:\n\n${listStr}`;
  }

  // Rooms / Vacancy query
  if (
    q.includes('room') ||
    q.includes('kamra') ||
    q.includes('bed') ||
    q.includes('khali') ||
    q.includes('available') ||
    q.includes('vacant') ||
    q.includes('कमरा') ||
    q.includes('खाली')
  ) {
    const availableRooms = ctx.rooms.list.filter((r) => r.status === 'available');
    const roomList = availableRooms.map((r) => `• Room ${r.room_number} (${r.room_type}, ${r.total_beds} beds)`).join('\n');

    if (lang === 'hi') {
      return `कुल ${ctx.rooms.total} कमरों में से ${ctx.rooms.available} कमरे अभी खाली हैं:\n\n${roomList || 'कोई कमरा पूरी तरह खाली नहीं है।'}\n\nकुल भरे हुए कमरे: ${ctx.rooms.full}`;
    }
    if (lang === 'hinglish') {
      return `Total ${ctx.rooms.total} rooms me se ${ctx.rooms.available} rooms abhi available hain:\n\n${roomList || 'Koi room poora khali nahi hai.'}\n\nBhari hui rooms: ${ctx.rooms.full}`;
    }
    return `Out of ${ctx.rooms.total} total rooms, ${ctx.rooms.available} are currently available:\n\n${roomList || 'No completely vacant rooms.'}\n\nFully occupied rooms: ${ctx.rooms.full}`;
  }

  // Tenants query
  if (
    q.includes('tenant') ||
    q.includes('kirayedar') ||
    q.includes('active') ||
    q.includes('log') ||
    q.includes('rehte') ||
    q.includes('किराएदार') ||
    q.includes('रहने')
  ) {
    const activeTenants = ctx.tenants.list.filter((t) => t.status === 'active');
    const tenantList = activeTenants
      .slice(0, 8)
      .map((t) => `• ${t.name} (Room ${t.room_number}, Phone: ${t.phone})`)
      .join('\n');

    if (lang === 'hi') {
      return `आपके PG में अभी कुल ${ctx.tenants.active} एक्टिव किराएदार रह रहे हैं:\n\n${tenantList}${activeTenants.length > 8 ? `\n...और ${activeTenants.length - 8} अन्य किराएदार।` : ''}`;
    }
    if (lang === 'hinglish') {
      return `Aapke PG me abhi total ${ctx.tenants.active} active tenants rah rahe hain:\n\n${tenantList}${activeTenants.length > 8 ? `\n...aur ${activeTenants.length - 8} aur tenants.` : ''}`;
    }
    return `There are currently ${ctx.tenants.active} active tenants in your PG:\n\n${tenantList}${activeTenants.length > 8 ? `\n...and ${activeTenants.length - 8} more.` : ''}`;
  }

  // Complaints query
  if (
    q.includes('complaint') ||
    q.includes('shikayat') ||
    q.includes('issue') ||
    q.includes('problem') ||
    q.includes('paani') ||
    q.includes('bijli') ||
    q.includes('water') ||
    q.includes('electricity') ||
    q.includes('शिकायत')
  ) {
    if (ctx.complaints.list.length === 0) {
      if (lang === 'hi') return 'अभी कोई भी शिकायत पेंडिंग नहीं है। सब कुछ ठीक चल रहा है!';
      if (lang === 'hinglish') return 'Abhi koi bhi complaint open nahi hai. Sab kuch theek chal raha hai!';
      return 'There are currently no open or in-progress complaints. All clear!';
    }

    const complaintList = ctx.complaints.list
      .map((c) => `• [${c.category.toUpperCase()}] ${c.tenantName}: "${c.description}" (${c.status})`)
      .join('\n');

    if (lang === 'hi') {
      return `अभी ${ctx.complaints.openCount + ctx.complaints.inProgressCount} शिकायतें एक्टिव हैं:\n\n${complaintList}`;
    }
    if (lang === 'hinglish') {
      return `Abhi ${ctx.complaints.openCount + ctx.complaints.inProgressCount} complaints active hain:\n\n${complaintList}`;
    }
    return `There are ${ctx.complaints.openCount + ctx.complaints.inProgressCount} active complaints:\n\n${complaintList}`;
  }

  // WiFi query
  if (
    q.includes('wifi') ||
    q.includes('password') ||
    q.includes('internet') ||
    q.includes('net') ||
    q.includes('वाईफाई') ||
    q.includes('पासवर्ड')
  ) {
    if (lang === 'hi') {
      return `📶 WiFi जानकारी:\n• WiFi नाम (SSID): ${ctx.wifi.ssid}\n• पासवर्ड: ${ctx.wifi.password}`;
    }
    if (lang === 'hinglish') {
      return `📶 WiFi Details:\n• WiFi Name: ${ctx.wifi.ssid}\n• Password: ${ctx.wifi.password}`;
    }
    return `📶 WiFi Information:\n• Network SSID: ${ctx.wifi.ssid}\n• Password: ${ctx.wifi.password}`;
  }

  // Rules query
  if (q.includes('rule') || q.includes('niyam') || q.includes('timing') || q.includes('gate') || q.includes('नियम')) {
    if (lang === 'hi') return `📋 PG के नियम:\n${ctx.rules}`;
    if (lang === 'hinglish') return `📋 PG Rules:\n${ctx.rules}`;
    return `📋 PG Rules:\n${ctx.rules}`;
  }

  // General Overview / Summary
  if (lang === 'hi') {
    return `नमस्ते! आपके ${ctx.pgName} का स्टेटस:\n\n• एक्टिव किराएदार: ${ctx.tenants.active}\n• खाली कमरे: ${ctx.rooms.available} (कुल ${ctx.rooms.total})\n• बकाया किराया: ₹${ctx.rent.totalPendingAmount.toLocaleString('en-IN')}\n• पेंडिंग शिकायतें: ${ctx.complaints.openCount + ctx.complaints.inProgressCount}\n• WiFi: ${ctx.wifi.ssid}\n\nआप ऊपर दिए गए किसी भी बटन पर क्लिक करके या बोलकर पूछ सकते हैं।`;
  }
  if (lang === 'hinglish') {
    return `Namaste! Aapke ${ctx.pgName} ka live status:\n\n• Active Tenants: ${ctx.tenants.active}\n• Khali Rooms: ${ctx.rooms.available} (Total ${ctx.rooms.total})\n• Pending Rent: ₹${ctx.rent.totalPendingAmount.toLocaleString('en-IN')}\n• Open Complaints: ${ctx.complaints.openCount + ctx.complaints.inProgressCount}\n• WiFi: ${ctx.wifi.ssid}\n\nAap niche diye kisi bhi question par tap kar sakte hain.`;
  }
  return `Hello! Here is the live status for ${ctx.pgName}:\n\n• Active Tenants: ${ctx.tenants.active}\n• Available Rooms: ${ctx.rooms.available} (Total ${ctx.rooms.total})\n• Pending Rent: ₹${ctx.rent.totalPendingAmount.toLocaleString('en-IN')}\n• Open Complaints: ${ctx.complaints.openCount + ctx.complaints.inProgressCount}\n• WiFi: ${ctx.wifi.ssid}\n\nFeel free to tap any of the suggested questions below!`;
}

/**
 * Suggested Questions for Non-Tech-Savvy Users
 */
export function getSuggestedQuestions(lang: 'hi' | 'en' | 'hinglish'): string[] {
  if (lang === 'hi') {
    return [
      'किसका किराया बकाया है?',
      'कितने कमरे खाली हैं?',
      'कुल कितने किराएदार हैं?',
      'कोई शिकायत पेंडिंग है क्या?',
      'WiFi का पासवर्ड क्या है?',
      'PG के नियम क्या हैं?',
    ];
  }
  if (lang === 'hinglish') {
    return [
      'Kiska rent pending hai?',
      'Kitne rooms khali hain?',
      'Total active tenants kitne hain?',
      'Koi complaint pending hai kya?',
      'WiFi password kya hai?',
      'PG ke rules kya hain?',
    ];
  }
  return [
    'Whose rent is pending?',
    'How many rooms are vacant?',
    'How many active tenants?',
    'Are there any pending complaints?',
    'What is the WiFi password?',
    'What are the PG rules?',
  ];
}
