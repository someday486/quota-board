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

// 루트에 users.csv가 있어야 함
const csv = fs.readFileSync('./users.csv', 'utf8');
const rows = parse(csv, { columns: true, skip_empty_lines: true });

for (const r of rows) {
  // 🔽 모든 알파벳 소문자 처리
  const email = String(r.email).trim().toLowerCase();
  const password = String(r.password).trim().toLowerCase();
  const display_name = String(r.display_name ?? '').trim();
  const role = String(r.role ?? 'leader').trim().toLowerCase();
  const is_admin =
    String(r.is_admin ?? 'false').trim().toLowerCase() === 'true';

  const leader_group = r.leader_group
    ? String(r.leader_group).trim().toLowerCase()
    : null;

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
}
