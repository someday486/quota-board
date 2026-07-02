import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type ProfilePeopleRow = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: string | null;
  is_admin: boolean | null;
  leader_group: number | null;
  hire_date: string | null;
  resigned_at: string | null;
  resignation_note: string | null;
  invalid_call_count: number | null;
  participation_restricted_until: string | null;
  participation_restriction_note: string | null;
};

type BirthdayEventRow = {
  id: string;
  title: string | null;
  start_date: string | null;
  description: string | null;
  birthday_calendar_type: 'solar' | 'lunar' | null;
  birthday_is_intercalation: boolean | null;
};

type PeopleRow = ProfilePeopleRow & {
  birthday_event_id: string | null;
  birthday_date: string | null;
  birthday_calendar_type: 'solar' | 'lunar';
  birthday_is_intercalation: boolean;
};

type BirthdayEventDbRow = BirthdayEventRow & {
  category: 'birthday' | 'award' | 'dinner' | 'meeting' | 'notice';
  end_date: string | null;
  recurs_annually: boolean | null;
  created_by: string | null;
};

type BirthdayEventPayload = {
  title: string;
  category: 'birthday';
  start_date: string;
  end_date: string;
  description: string;
  recurs_annually: boolean;
  birthday_calendar_type: 'solar' | 'lunar';
  birthday_is_intercalation: boolean;
  created_by: string;
};

type PeopleDatabase = {
  public: {
    Tables: {
      profiles: {
        Row: ProfilePeopleRow;
        Insert: Partial<ProfilePeopleRow> & { user_id: string };
        Update: Partial<ProfilePeopleRow>;
        Relationships: [];
      };
      support_center_calendar_events: {
        Row: BirthdayEventDbRow;
        Insert: BirthdayEventPayload;
        Update: Partial<BirthdayEventPayload>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type AdminClient = ReturnType<typeof createClient<PeopleDatabase>>;

type AdminContext = {
  sbAdmin: AdminClient;
  actorUserId: string;
};

const PROFILE_SELECT =
  'user_id,display_name,email,role,is_admin,leader_group,hire_date,resigned_at,resignation_note,invalid_call_count,participation_restricted_until,participation_restriction_note';
const PROFILE_SELECT_WITHOUT_RESIGNATION =
  'user_id,display_name,email,role,is_admin,leader_group,hire_date,invalid_call_count,participation_restricted_until,participation_restriction_note';

const BIRTHDAY_SELECT =
  'id,title,start_date,description,birthday_calendar_type,birthday_is_intercalation';

const RESIGNED_AUTH_BAN_DURATION = '876000h';

function getBearerToken(req: NextRequest) {
  const authz = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/.exec(authz);
  return m?.[1] ?? null;
}

function normalizeEmail(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function parseIsoOrNull(input: unknown) {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input !== 'string') return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseDateOrNull(input: unknown) {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return null;
  return value;
}

function parseLeaderGroup(input: unknown) {
  if (input === null || input === undefined || input === '') return null;
  const n = Number(input);
  if (n === 1 || n === 2) return n;
  return undefined;
}

function parseBirthdayCalendarType(input: unknown) {
  const value = String(input ?? '').trim();
  if (value === 'solar' || value === 'lunar') return value;
  return undefined;
}

function parseBoolean(input: unknown) {
  return input === true || input === 'true' || input === 1 || input === '1';
}

function birthdayDescription(email: string) {
  return `계정: ${email}`;
}

function emailFromBirthdayDescription(description: string | null) {
  const m = /계정:\s*([^\s,]+)/i.exec(description ?? '');
  return normalizeEmail(m?.[1] ?? '');
}

async function requireAdmin(req: NextRequest): Promise<AdminContext | { error: NextResponse }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anon || !service) {
    return { error: NextResponse.json({ error: 'Missing Supabase env vars' }, { status: 500 }) };
  }

  const token = getBearerToken(req);
  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const sbUser = createClient<PeopleDatabase>(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: auth, error: authErr } = await sbUser.auth.getUser(token);
  if (authErr || !auth.user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const sbAdmin = createClient<PeopleDatabase>(url, service, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: me, error: meErr } = await sbAdmin
    .from('profiles')
    .select('role,is_admin')
    .eq('user_id', auth.user.id)
    .single();

  if (meErr) {
    return { error: NextResponse.json({ error: 'Failed to read profile' }, { status: 500 }) };
  }

  const meRow = me as { role: string | null; is_admin: boolean | null } | null;
  const isAdmin = meRow?.role === 'admin' || Boolean(meRow?.is_admin);
  if (!isAdmin) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { sbAdmin, actorUserId: auth.user.id };
}

async function readPeopleRows(sbAdmin: AdminContext['sbAdmin']) {
  let { data: profiles, error: profileError } = await sbAdmin
    .from('profiles')
    .select(PROFILE_SELECT)
    .order('display_name', { ascending: true });

  if (isMissingResignationColumnError(profileError)) {
    const fallback = await sbAdmin
      .from('profiles')
      .select(PROFILE_SELECT_WITHOUT_RESIGNATION)
      .order('display_name', { ascending: true });
    profiles = fallback.data as typeof profiles;
    profileError = fallback.error;
  }

  if (profileError) throw new Error(profileError.message);

  const { data: birthdayEvents, error: birthdayError } = await sbAdmin
    .from('support_center_calendar_events')
    .select(BIRTHDAY_SELECT)
    .eq('category', 'birthday');

  if (birthdayError) throw new Error(birthdayError.message);

  const birthdayByEmail = new Map<string, BirthdayEventRow>();
  for (const event of (birthdayEvents ?? []) as BirthdayEventRow[]) {
    const email = emailFromBirthdayDescription(event.description);
    if (email && !birthdayByEmail.has(email)) birthdayByEmail.set(email, event);
  }

  return ((profiles ?? []) as ProfilePeopleRow[]).map<PeopleRow>((rawProfile) => {
    const profile = withResignationDefaults(rawProfile);
    const birthday = birthdayByEmail.get(normalizeEmail(profile.email));
    return {
      ...profile,
      birthday_event_id: birthday?.id ?? null,
      birthday_date: birthday?.start_date ?? null,
      birthday_calendar_type: birthday?.birthday_calendar_type === 'lunar' ? 'lunar' : 'solar',
      birthday_is_intercalation: Boolean(birthday?.birthday_is_intercalation),
    };
  });
}

async function readProfileByUserId(sbAdmin: AdminContext['sbAdmin'], userId: string) {
  let { data, error } = await sbAdmin
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('user_id', userId)
    .maybeSingle();

  if (isMissingResignationColumnError(error)) {
    const fallback = await sbAdmin
      .from('profiles')
      .select(PROFILE_SELECT_WITHOUT_RESIGNATION)
      .eq('user_id', userId)
      .maybeSingle();
    data = fallback.data as typeof data;
    error = fallback.error;
  }

  if (error) throw new Error(error.message);
  return data ? withResignationDefaults(data as ProfilePeopleRow) : null;
}

function isAdminProfile(profile: Pick<ProfilePeopleRow, 'role' | 'is_admin'>) {
  return profile.role === 'admin' || Boolean(profile.is_admin);
}

function readNoteField(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || null;
}

function isMissingResignationColumnError(error: { message?: string; details?: string; hint?: string; code?: string } | null) {
  const text = [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(' ');
  return /resigned_at|resignation_note/i.test(text) && /does not exist|could not find|schema cache|PGRST/i.test(text);
}

function withResignationDefaults(
  profile: ProfilePeopleRow | (Omit<ProfilePeopleRow, 'resigned_at' | 'resignation_note'> & {
    resigned_at?: string | null;
    resignation_note?: string | null;
  }),
): ProfilePeopleRow {
  return {
    ...profile,
    resigned_at: profile.resigned_at ?? null,
    resignation_note: profile.resignation_note ?? null,
  };
}

async function assertResignationColumnsAvailable(sbAdmin: AdminContext['sbAdmin']) {
  const { error } = await sbAdmin.from('profiles').select('user_id,resigned_at,resignation_note').limit(1);
  if (isMissingResignationColumnError(error)) {
    return {
      error: NextResponse.json(
        { error: '퇴사처리 DB 컬럼이 아직 적용되지 않았습니다. Supabase migration을 먼저 적용해주세요.' },
        { status: 503 },
      ),
    };
  }
  if (error) {
    return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  }
  return {};
}

async function upsertBirthdayEvent(
  sbAdmin: AdminContext['sbAdmin'],
  profile: Pick<ProfilePeopleRow, 'display_name' | 'email'>,
  birthdayDate: string | null,
  calendarType: 'solar' | 'lunar',
  isIntercalation: boolean,
  actorUserId: string,
) {
  const email = normalizeEmail(profile.email);
  if (!email) return;

  const { data: existing, error: existingError } = await sbAdmin
    .from('support_center_calendar_events')
    .select('id')
    .eq('category', 'birthday')
    .eq('description', birthdayDescription(email));

  if (existingError) throw new Error(existingError.message);

  const existingIds = ((existing ?? []) as { id: string }[]).map((row) => row.id);
  if (!birthdayDate) {
    if (existingIds.length > 0) {
      const { error } = await sbAdmin
        .from('support_center_calendar_events')
        .delete()
        .in('id', existingIds);
      if (error) throw new Error(error.message);
    }
    return;
  }

  const titleName = String(profile.display_name ?? '').trim() || email;
  const payload: BirthdayEventPayload = {
    title: `${titleName}님 생일`,
    category: 'birthday',
    start_date: birthdayDate,
    end_date: birthdayDate,
    description: birthdayDescription(email),
    recurs_annually: true,
    birthday_calendar_type: calendarType,
    birthday_is_intercalation: isIntercalation,
    created_by: actorUserId,
  };

  if (existingIds.length > 0) {
    const [firstId, ...duplicateIds] = existingIds;
    const { error } = await sbAdmin
      .from('support_center_calendar_events')
      .update(payload)
      .eq('id', firstId);
    if (error) throw new Error(error.message);

    if (duplicateIds.length > 0) {
      const { error: deleteError } = await sbAdmin
        .from('support_center_calendar_events')
        .delete()
        .in('id', duplicateIds);
      if (deleteError) throw new Error(deleteError.message);
    }
    return;
  }

  const { error } = await sbAdmin.from('support_center_calendar_events').insert(payload);
  if (error) throw new Error(error.message);
}

function readDateField(
  body: Record<string, unknown>,
  field: string,
): { value: string | null } | { error: string } {
  const value = parseDateOrNull(body[field]);
  if (body[field] && !value) {
    return { error: `${field} must be YYYY-MM-DD` };
  }
  return { value };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return auth.error;

    const rows = await readPeopleRows(auth.sbAdmin);
    return NextResponse.json({ rows });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let createdUserId: string | null = null;

  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return auth.error;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

    const email = normalizeEmail(body.email);
    const password = String(body.password ?? '').trim();
    const displayName = String(body.display_name ?? '').trim();
    const leaderGroup = parseLeaderGroup(body.leader_group);
    const hireDate = readDateField(body, 'hire_date');
    const birthdayDate = readDateField(body, 'birthday_date');
    const birthdayCalendarType = parseBirthdayCalendarType(body.birthday_calendar_type) ?? 'solar';
    const birthdayIsIntercalation = parseBoolean(body.birthday_is_intercalation);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }
    if (!displayName) {
      return NextResponse.json({ error: 'display_name is required' }, { status: 400 });
    }
    if (leaderGroup === undefined) {
      return NextResponse.json({ error: 'leader_group must be 1, 2, or empty' }, { status: 400 });
    }
    if ('error' in hireDate) {
      return NextResponse.json({ error: hireDate.error }, { status: 400 });
    }
    if ('error' in birthdayDate) {
      return NextResponse.json({ error: birthdayDate.error }, { status: 400 });
    }

    const { data: created, error: createError } = await auth.sbAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
        role: 'leader',
        is_admin: false,
      },
    });

    if (createError || !created.user?.id) {
      return NextResponse.json({ error: createError?.message || 'Failed to create user' }, { status: 400 });
    }
    createdUserId = created.user.id;

    const profilePayload = {
      user_id: createdUserId,
      email,
      display_name: displayName,
      role: 'leader',
      is_admin: false,
      leader_group: leaderGroup,
      hire_date: hireDate.value,
      invalid_call_count: 0,
      participation_restricted_until: null,
      participation_restriction_note: null,
    };

    const { data: profile, error: profileError } = await auth.sbAdmin
      .from('profiles')
      .upsert(profilePayload, { onConflict: 'user_id' })
      .select(PROFILE_SELECT)
      .single();

    if (profileError || !profile) {
      await auth.sbAdmin.auth.admin.deleteUser(createdUserId);
      return NextResponse.json({ error: profileError?.message || 'Failed to create profile' }, { status: 500 });
    }

    await upsertBirthdayEvent(
      auth.sbAdmin,
      profile as ProfilePeopleRow,
      birthdayDate.value,
      birthdayCalendarType,
      birthdayIsIntercalation,
      auth.actorUserId,
    );

    const rows = await readPeopleRows(auth.sbAdmin);
    const row = rows.find((item) => item.user_id === createdUserId) ?? null;
    return NextResponse.json({ row }, { status: 201 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return auth.error;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

    const userId = typeof body?.user_id === 'string' ? body.user_id.trim() : '';
    if (!userId) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
    }

    const action = typeof body.action === 'string' ? body.action.trim() : '';
    if (action === 'resign' || action === 'restore') {
      const resignationColumns = await assertResignationColumnsAvailable(auth.sbAdmin);
      if ('error' in resignationColumns) return resignationColumns.error;

      const currentProfile = await readProfileByUserId(auth.sbAdmin, userId);
      if (!currentProfile) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }
      if (isAdminProfile(currentProfile)) {
        return NextResponse.json({ error: 'Admin accounts cannot be resigned here' }, { status: 400 });
      }

      if (action === 'resign') {
        const resignedAt = readDateField(body, 'resigned_at');
        const resignationNote = readNoteField(body.resignation_note);
        if ('error' in resignedAt) {
          return NextResponse.json({ error: resignedAt.error }, { status: 400 });
        }
        if (!resignedAt.value) {
          return NextResponse.json({ error: 'resigned_at is required' }, { status: 400 });
        }
        if (resignationNote === undefined) {
          return NextResponse.json({ error: 'resignation_note must be a string or null' }, { status: 400 });
        }

        const { error: banError } = await auth.sbAdmin.auth.admin.updateUserById(userId, {
          ban_duration: RESIGNED_AUTH_BAN_DURATION,
        });
        if (banError) {
          return NextResponse.json({ error: `Failed to disable auth user: ${banError.message}` }, { status: 500 });
        }

        const { data: profile, error } = await auth.sbAdmin
          .from('profiles')
          .update({
            leader_group: null,
            resigned_at: resignedAt.value,
            resignation_note: resignationNote,
            participation_restricted_until: null,
            participation_restriction_note: null,
          })
          .eq('user_id', userId)
          .select(PROFILE_SELECT)
          .maybeSingle();

        if (error || !profile) {
          await auth.sbAdmin.auth.admin.updateUserById(userId, { ban_duration: 'none' });
          return NextResponse.json({ error: error?.message || 'Profile not found' }, { status: error ? 500 : 404 });
        }

        await upsertBirthdayEvent(auth.sbAdmin, profile as ProfilePeopleRow, null, 'solar', false, auth.actorUserId);
      } else {
        const { error: unbanError } = await auth.sbAdmin.auth.admin.updateUserById(userId, {
          ban_duration: 'none',
        });
        if (unbanError) {
          return NextResponse.json({ error: `Failed to restore auth user: ${unbanError.message}` }, { status: 500 });
        }

        const { error } = await auth.sbAdmin
          .from('profiles')
          .update({
            resigned_at: null,
            resignation_note: null,
          })
          .eq('user_id', userId);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }

      const rows = await readPeopleRows(auth.sbAdmin);
      const row = rows.find((item) => item.user_id === userId) ?? null;
      if (!row) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }
      return NextResponse.json({ row });
    }

    const currentProfile = await readProfileByUserId(auth.sbAdmin, userId);
    if (!currentProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    if (currentProfile.resigned_at) {
      return NextResponse.json(
        { error: 'Resigned profiles can only use resign or restore actions' },
        { status: 400 },
      );
    }

    const payload: Record<string, unknown> = {};

    if (Object.prototype.hasOwnProperty.call(body, 'invalid_call_count')) {
      const n = Number(body.invalid_call_count);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        return NextResponse.json({ error: 'invalid_call_count must be a non-negative integer' }, { status: 400 });
      }
      payload.invalid_call_count = n;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'participation_restricted_until')) {
      const iso = parseIsoOrNull(body.participation_restricted_until);
      if (body.participation_restricted_until && !iso) {
        return NextResponse.json({ error: 'participation_restricted_until must be a valid datetime' }, { status: 400 });
      }
      payload.participation_restricted_until = iso;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'participation_restriction_note')) {
      if (body.participation_restriction_note === null || body.participation_restriction_note === '') {
        payload.participation_restriction_note = null;
      } else if (typeof body.participation_restriction_note === 'string') {
        payload.participation_restriction_note = body.participation_restriction_note.trim();
      } else {
        return NextResponse.json({ error: 'participation_restriction_note must be a string or null' }, { status: 400 });
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, 'hire_date')) {
      const hireDate = readDateField(body, 'hire_date');
      if ('error' in hireDate) {
        return NextResponse.json({ error: hireDate.error }, { status: 400 });
      }
      payload.hire_date = hireDate.value;
    }

    let profile: ProfilePeopleRow | null = null;
    if (Object.keys(payload).length > 0) {
      const { data, error } = await auth.sbAdmin
        .from('profiles')
        .update(payload)
        .eq('user_id', userId)
        .select(PROFILE_SELECT)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!data) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }
      profile = data as ProfilePeopleRow;
    } else {
      const { data, error } = await auth.sbAdmin
        .from('profiles')
        .select(PROFILE_SELECT)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!data) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }
      profile = data as ProfilePeopleRow;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'birthday_date')) {
      const birthdayDate = readDateField(body, 'birthday_date');
      const birthdayCalendarType = parseBirthdayCalendarType(body.birthday_calendar_type) ?? 'solar';
      const birthdayIsIntercalation = parseBoolean(body.birthday_is_intercalation);

      if ('error' in birthdayDate) {
        return NextResponse.json({ error: birthdayDate.error }, { status: 400 });
      }

      await upsertBirthdayEvent(
        auth.sbAdmin,
        profile,
        birthdayDate.value,
        birthdayCalendarType,
        birthdayIsIntercalation,
        auth.actorUserId,
      );
    }

    const rows = await readPeopleRows(auth.sbAdmin);
    const row = rows.find((item) => item.user_id === userId) ?? null;
    if (!row) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({ row });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
