import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.');
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function getField(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return String(row[key]).trim();
    }
  }
  return '';
}

function normalizeCalendarType(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'solar' || raw === '양력' || raw === '양') return 'solar';
  if (raw === 'lunar' || raw === '음력' || raw === '음') return 'lunar';
  return null;
}

function normalizeBoolean(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'y' || raw === 'yes' || raw === '예' || raw === '네';
}

function normalizeBirthdayDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const digits = raw.replace(/\D/g, '');
  if (digits.length === 8) {
    const yyyy = digits.slice(0, 4);
    const mm = digits.slice(4, 6);
    const dd = digits.slice(6, 8);
    return `${yyyy}-${mm}-${dd}`;
  }

  if (digits.length === 6) {
    const yy = Number(digits.slice(0, 2));
    const mm = digits.slice(2, 4);
    const dd = digits.slice(4, 6);
    const currentYY = new Date().getFullYear() % 100;
    const fullYear = yy <= currentYY ? 2000 + yy : 1900 + yy;
    return `${fullYear}-${mm}-${dd}`;
  }

  return null;
}

function buildBirthdayPayload(row, fallbackDisplayName, email) {
  const birthdayRaw = getField(row, ['birthday_ymd', 'birthday', 'birth_date', '생년월일']);
  const birthdayDate = normalizeBirthdayDate(birthdayRaw);
  if (!birthdayDate) return null;

  const calendarType = normalizeCalendarType(getField(row, ['birthday_calendar_type', 'calendar_type', 'birth_calendar_type', '양/음력'])) ?? 'solar';
  const intercalation = normalizeBoolean(getField(row, ['birthday_is_intercalation', 'is_intercalation', 'intercalation', '윤달']));
  const birthdayName = getField(row, ['birthday_name', 'registered_name', '등록이름 / 본명', '등록이름', '본명']) || fallbackDisplayName;

  return {
    title: `${birthdayName}님 생일`,
    category: 'birthday',
    start_date: birthdayDate,
    end_date: birthdayDate,
    description: `계정: ${email}`,
    recurs_annually: true,
    birthday_calendar_type: calendarType,
    birthday_is_intercalation: intercalation,
    created_by: null,
  };
}

function isMissingBirthdayTableError(message) {
  return (
    message.includes('support_center_calendar_events') ||
    message.includes('recurs_annually') ||
    message.includes('birthday_calendar_type') ||
    message.includes('birthday_is_intercalation')
  );
}

async function upsertBirthdayEvent(row, displayName, email) {
  const payload = buildBirthdayPayload(row, displayName, email);
  if (!payload) return { skipped: true };

  const { data: existing, error: selectError } = await supabaseAdmin
    .from('support_center_calendar_events')
    .select('id')
    .eq('category', 'birthday')
    .eq('title', payload.title)
    .eq('description', payload.description)
    .maybeSingle();

  if (selectError) {
    if (isMissingBirthdayTableError(selectError.message)) {
      return { skipped: true, reason: 'birthday_table_missing' };
    }
    return { skipped: false, error: selectError };
  }

  if (existing?.id) {
    const { error: updateError } = await supabaseAdmin
      .from('support_center_calendar_events')
      .update(payload)
      .eq('id', existing.id);

    return updateError ? { skipped: false, error: updateError } : { skipped: false, updated: true };
  }

  const { error: insertError } = await supabaseAdmin
    .from('support_center_calendar_events')
    .insert(payload);

  if (insertError && isMissingBirthdayTableError(insertError.message)) {
    return { skipped: true, reason: 'birthday_table_missing' };
  }

  return insertError ? { skipped: false, error: insertError } : { skipped: false, inserted: true };
}

// 루트에 users.csv가 있어야 함
const csv = fs.readFileSync('./users.csv', 'utf8');
const rows = parse(csv, { columns: true, skip_empty_lines: true });

for (const r of rows) {
  // 🔽 모든 알파벳 소문자 처리
  const email = getField(r, ['email', '계정']).toLowerCase();
  const password = getField(r, ['password', '비밀번호']).toLowerCase();
  const display_name = getField(r, ['display_name', '이름', '등록이름 / 본명', '등록이름', '본명']);
  const role = String(getField(r, ['role']) || 'leader').trim().toLowerCase();
  const is_admin =
    String(getField(r, ['is_admin']) || 'false').trim().toLowerCase() === 'true';

  const leader_group = getField(r, ['leader_group'])
    ? String(getField(r, ['leader_group'])).trim().toLowerCase()
    : null;

  if (!email || !password) {
    console.error('❌ FAIL (csv): email/password 누락');
    continue;
  }

  // 1️⃣ Auth 유저 생성
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name,
      role,
      is_admin,
    },
  });

  if (error || !data?.user) {
    console.error('❌ FAIL (auth):', email, error?.message);
    continue;
  }

  const userId = data.user.id;

  // 2️⃣ public.profiles 업데이트 (leader_group 포함)
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({
      display_name,
      role,
      is_admin,
      leader_group,
    })
    .eq('user_id', userId); // ✅ profiles 키가 user_id인 구조일 때

  if (profileError) {
    console.error('❌ FAIL (profile update):', email, profileError.message);
  } else {
    console.log('✅ OK:', email, 'leader_group =', leader_group);
  }

  const birthdayResult = await upsertBirthdayEvent(r, display_name, email);
  if (birthdayResult?.error) {
    console.error('❌ FAIL (birthday):', email, birthdayResult.error.message);
  } else if (birthdayResult?.reason === 'birthday_table_missing') {
    console.warn('⚠️ SKIP (birthday table missing):', email);
  } else if (birthdayResult?.inserted) {
    console.log('🎂 BIRTHDAY CREATED:', email);
  } else if (birthdayResult?.updated) {
    console.log('🎂 BIRTHDAY UPDATED:', email);
  }
}
