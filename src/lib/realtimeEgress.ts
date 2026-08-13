export type RealtimeConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export type MeetingTimeSlot = 'am' | 'pm';

export type RegionStatusLike = {
  region_id: string;
  region_name: string;
  sort_order: number;
  capacity_total: number;
  applied_count: number;
  capacity_remaining: number;
  is_closed: boolean;
};

export type ApplicationRealtimeRow = {
  id?: string | null;
  created_at?: string | null;
  user_id?: string | null;
  region_id?: string | null;
  leader_name?: string | null;
  company_name?: string | null;
  meeting_time_slot?: string | null;
  is_excluded?: boolean | null;
  is_reserve?: boolean | null;
  reviewed?: boolean | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
};

export type RegionTotalRealtimeRow = {
  region_id?: string | null;
  capacity_total?: number | null;
};

export type RealtimePayload<Row> = {
  eventType?: string;
  new?: Partial<Row> | null;
  old?: Partial<Row> | null;
};

const KST_TIME_ZONE = 'Asia/Seoul';

export function isCountedApplication(row?: Partial<ApplicationRealtimeRow> | null) {
  return Boolean(row?.region_id) && !Boolean(row?.is_reserve) && !Boolean(row?.is_excluded);
}

function normalizeMeetingTimeSlot(value?: string | null): MeetingTimeSlot | null {
  return value === 'am' || value === 'pm' ? value : null;
}

function recalcStatus(row: RegionStatusLike): RegionStatusLike {
  const capacityTotal = Math.max(0, Number(row.capacity_total ?? 0));
  const appliedCount = Math.max(0, Number(row.applied_count ?? 0));
  const capacityRemaining = Math.max(capacityTotal - appliedCount, 0);

  return {
    ...row,
    capacity_total: capacityTotal,
    applied_count: appliedCount,
    capacity_remaining: capacityRemaining,
    is_closed: capacityTotal <= 0 || capacityRemaining <= 0,
  };
}

export function applyRegionTotalPayload<T extends RegionStatusLike>(
  rows: T[],
  payload: RealtimePayload<RegionTotalRealtimeRow>,
) {
  const row = payload.new ?? payload.old;
  const regionId = String(row?.region_id ?? '');
  if (!regionId) return rows;

  let changed = false;
  const next = rows.map((status) => {
    if (status.region_id !== regionId) return status;
    changed = true;
    const patched = recalcStatus({
      ...status,
      capacity_total: Number(row?.capacity_total ?? status.capacity_total ?? 0),
    });
    return patched as T;
  });

  return changed ? next : rows;
}

export function applyApplicationStatusPayload<T extends RegionStatusLike>(
  rows: T[],
  payload: RealtimePayload<ApplicationRealtimeRow>,
) {
  const oldRow = payload.old ?? null;
  const newRow = payload.new ?? null;
  const eventType = String(payload.eventType ?? '').toUpperCase();

  const deltas = new Map<string, number>();
  const addDelta = (regionId: unknown, delta: number) => {
    const id = String(regionId ?? '');
    if (!id) return;
    deltas.set(id, (deltas.get(id) ?? 0) + delta);
  };

  if (eventType === 'INSERT') {
    if (isCountedApplication(newRow)) addDelta(newRow?.region_id, 1);
  } else if (eventType === 'DELETE') {
    if (isCountedApplication(oldRow)) addDelta(oldRow?.region_id, -1);
  } else {
    if (!oldRow?.id) return rows;
    if (isCountedApplication(oldRow)) addDelta(oldRow?.region_id, -1);
    if (isCountedApplication(newRow)) addDelta(newRow?.region_id, 1);
  }

  if (deltas.size === 0) return rows;

  let changed = false;
  const next = rows.map((status) => {
    const delta = deltas.get(status.region_id) ?? 0;
    if (delta === 0) return status;
    changed = true;
    const patched = recalcStatus({
      ...status,
      applied_count: Number(status.applied_count ?? 0) + delta,
    });
    return patched as T;
  });

  return changed ? next : rows;
}

export function mergeByIdDesc<T extends { id: string; created_at: string }>(
  rows: T[],
  row: T,
  limit?: number,
) {
  const without = rows.filter((item) => item.id !== row.id);
  const next = [row, ...without].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return typeof limit === 'number' ? next.slice(0, limit) : next;
}

export function removeById<T extends { id: string }>(rows: T[], id?: string | null) {
  if (!id) return rows;
  return rows.filter((item) => item.id !== id);
}

export function isTodayKst(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const target = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return today === target;
}

export function todayCountDelta(payload: RealtimePayload<ApplicationRealtimeRow>, userId?: string | null) {
  const eventType = String(payload.eventType ?? '').toUpperCase();
  const oldRow = payload.old ?? null;
  const newRow = payload.new ?? null;
  const matchesUser = (row?: Partial<ApplicationRealtimeRow> | null) => {
    if (!userId) return Boolean(row?.user_id);
    return row?.user_id === userId;
  };

  if (eventType === 'INSERT') return matchesUser(newRow) && isTodayKst(newRow?.created_at) ? 1 : 0;
  if (eventType === 'DELETE') return matchesUser(oldRow) && isTodayKst(oldRow?.created_at) ? -1 : 0;

  const oldHit = matchesUser(oldRow) && isTodayKst(oldRow?.created_at) ? 1 : 0;
  const newHit = matchesUser(newRow) && isTodayKst(newRow?.created_at) ? 1 : 0;
  return newHit - oldHit;
}

export function toLeaderApplyRow<T extends {
  id: string;
  created_at: string;
  region_id: string;
  leader_name: string;
  company_name: string;
  meeting_time_slot: MeetingTimeSlot | null;
  is_reserve: boolean;
}>(row?: Partial<ApplicationRealtimeRow> | null): T | null {
  if (!row?.id || !row.created_at || !row.region_id) return null;
  return {
    id: String(row.id),
    created_at: String(row.created_at),
    region_id: String(row.region_id),
    leader_name: String(row.leader_name ?? ''),
    company_name: String(row.company_name ?? ''),
    meeting_time_slot: normalizeMeetingTimeSlot(row.meeting_time_slot),
    is_reserve: Boolean(row.is_reserve),
  } as T;
}

export function toAdminApplyRow<T extends {
  id: string;
  created_at: string;
  region_id: string;
  leader_name: string;
  company_name: string;
  meeting_time_slot: MeetingTimeSlot | null;
  is_excluded: boolean;
  is_reserve: boolean;
  reviewed: boolean;
  reviewed_at: string | null;
  reviewed_by: string | null;
}>(row?: Partial<ApplicationRealtimeRow> | null): T | null {
  if (!row?.id || !row.created_at || !row.region_id) return null;
  return {
    id: String(row.id),
    created_at: String(row.created_at),
    region_id: String(row.region_id),
    leader_name: String(row.leader_name ?? ''),
    company_name: String(row.company_name ?? ''),
    meeting_time_slot: normalizeMeetingTimeSlot(row.meeting_time_slot),
    is_excluded: Boolean(row.is_excluded),
    is_reserve: Boolean(row.is_reserve),
    reviewed: Boolean(row.reviewed),
    reviewed_at: row.reviewed_at ? String(row.reviewed_at) : null,
    reviewed_by: row.reviewed_by ? String(row.reviewed_by) : null,
  } as T;
}
