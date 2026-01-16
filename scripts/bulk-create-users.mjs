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
  const email = String(r.email).trim();
  const password = String(r.password).trim();
  const display_name = String(r.display_name ?? '').trim();
  const role = String(r.role ?? 'leader').trim();
  const is_admin = String(r.is_admin ?? 'false').trim().toLowerCase() === 'true';

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

  if (error) {
    console.error('❌ FAIL:', email, error.message);
  } else {
    console.log('✅ OK:', email, data.user?.id);
  }
}
