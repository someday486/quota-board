import KoreanLunarCalendar from 'korean-lunar-calendar';

export type HolidayOverrideRow = {
  holiday_date: string;
  name: string | null;
  is_holiday: boolean;
};

export type HolidayEntry = {
  date: string;
  name: string;
};

type HolidayOccurrence = {
  date: string;
  name: string;
  substituteRule: 'none' | 'weekend_or_overlap' | 'sunday_or_overlap';
};

function parseLocalDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`);
}

export function formatYMDLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysLocal(dateStr: string, amount: number) {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + amount);
  return formatYMDLocal(d);
}

export function isWeekend(dateStr: string) {
  const day = parseLocalDate(dateStr).getDay();
  return day === 0 || day === 6;
}

function isSunday(dateStr: string) {
  return parseLocalDate(dateStr).getDay() === 0;
}

function isSaturday(dateStr: string) {
  return parseLocalDate(dateStr).getDay() === 6;
}

function pushOccurrence(
  list: HolidayOccurrence[],
  year: number,
  date: string,
  name: string,
  substituteRule: HolidayOccurrence['substituteRule']
) {
  if (date.startsWith(`${year}-`)) {
    list.push({ date, name, substituteRule });
  }
}

function solarFromLunar(lunarYear: number, lunarMonth: number, lunarDay: number) {
  const calendar = new KoreanLunarCalendar();
  const ok = calendar.setLunarDate(lunarYear, lunarMonth, lunarDay, false);
  if (!ok) return null;

  const solar = calendar.getSolarCalendar();
  return `${solar.year}-${String(solar.month).padStart(2, '0')}-${String(solar.day).padStart(2, '0')}`;
}

function buildOfficialHolidayOccurrences(year: number) {
  const occurrences: HolidayOccurrence[] = [];

  pushOccurrence(occurrences, year, `${year}-01-01`, '신정', 'none');
  pushOccurrence(occurrences, year, `${year}-03-01`, '삼일절', 'weekend_or_overlap');
  pushOccurrence(occurrences, year, `${year}-05-01`, '노동절', 'none');
  pushOccurrence(occurrences, year, `${year}-05-05`, '어린이날', 'weekend_or_overlap');
  pushOccurrence(occurrences, year, `${year}-06-06`, '현충일', 'none');
  pushOccurrence(occurrences, year, `${year}-08-15`, '광복절', 'weekend_or_overlap');
  pushOccurrence(occurrences, year, `${year}-10-03`, '개천절', 'weekend_or_overlap');
  pushOccurrence(occurrences, year, `${year}-10-09`, '한글날', 'weekend_or_overlap');
  pushOccurrence(occurrences, year, `${year}-12-25`, '성탄절', 'weekend_or_overlap');

  const buddha = solarFromLunar(year, 4, 8);
  if (buddha) pushOccurrence(occurrences, year, buddha, '부처님오신날', 'weekend_or_overlap');

  const seollal = solarFromLunar(year, 1, 1);
  if (seollal) {
    pushOccurrence(occurrences, year, addDaysLocal(seollal, -1), '설날 연휴', 'sunday_or_overlap');
    pushOccurrence(occurrences, year, seollal, '설날', 'sunday_or_overlap');
    pushOccurrence(occurrences, year, addDaysLocal(seollal, 1), '설날 연휴', 'sunday_or_overlap');
  }

  const chuseok = solarFromLunar(year, 8, 15);
  if (chuseok) {
    pushOccurrence(occurrences, year, addDaysLocal(chuseok, -1), '추석 연휴', 'sunday_or_overlap');
    pushOccurrence(occurrences, year, chuseok, '추석', 'sunday_or_overlap');
    pushOccurrence(occurrences, year, addDaysLocal(chuseok, 1), '추석 연휴', 'sunday_or_overlap');
  }

  return occurrences.sort((a, b) => a.date.localeCompare(b.date));
}

function shouldCreateSubstitute(occurrence: HolidayOccurrence, overlapCount: number) {
  if (occurrence.substituteRule === 'none') return false;

  const overlapsOtherHoliday = overlapCount > 1 && !isWeekend(occurrence.date);
  if (overlapsOtherHoliday) return true;

  if (occurrence.substituteRule === 'weekend_or_overlap') {
    return isWeekend(occurrence.date);
  }

  return isSunday(occurrence.date);
}

function buildOfficialHolidayMapForYear(year: number) {
  const occurrences = buildOfficialHolidayOccurrences(year);
  const byDate = new Map<string, HolidayOccurrence[]>();

  for (const occurrence of occurrences) {
    const rows = byDate.get(occurrence.date) ?? [];
    rows.push(occurrence);
    byDate.set(occurrence.date, rows);
  }

  const holidayMap = new Map<string, string>();
  for (const [date, rows] of byDate.entries()) {
    holidayMap.set(date, rows.map((row) => row.name).join(' · '));
  }

  const substituteDates = new Set<string>();
  for (const occurrence of occurrences) {
    const overlapCount = byDate.get(occurrence.date)?.length ?? 0;
    if (!shouldCreateSubstitute(occurrence, overlapCount)) continue;

    let candidate = addDaysLocal(occurrence.date, 1);
    while (
      isSaturday(candidate) ||
      isSunday(candidate) ||
      holidayMap.has(candidate) ||
      substituteDates.has(candidate)
    ) {
      candidate = addDaysLocal(candidate, 1);
    }

    substituteDates.add(candidate);
    holidayMap.set(candidate, `${occurrence.name} 대체공휴일`);
  }

  return holidayMap;
}

export function getHolidayEntriesBetween(start: string, end: string, overrides: HolidayOverrideRow[] = []) {
  if (!start || !end || end < start) return [];

  const merged = new Map<string, string>();
  const startYear = Number(start.slice(0, 4));
  const endYear = Number(end.slice(0, 4));

  for (let year = startYear; year <= endYear; year++) {
    const holidayMap = buildOfficialHolidayMapForYear(year);
    for (const [date, name] of holidayMap.entries()) {
      if (date >= start && date <= end) {
        merged.set(date, name);
      }
    }
  }

  for (const override of overrides) {
    if (override.holiday_date < start || override.holiday_date > end) continue;
    if (override.is_holiday) {
      merged.set(override.holiday_date, override.name?.trim() || merged.get(override.holiday_date) || '휴무일');
      continue;
    }
    merged.delete(override.holiday_date);
  }

  return Array.from(merged.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, name]) => ({ date, name }));
}

export function getHolidayDateSetBetween(start: string, end: string, overrides: HolidayOverrideRow[] = []) {
  return new Set(getHolidayEntriesBetween(start, end, overrides).map((entry) => entry.date));
}

export function countBusinessLeaveDays(start: string, end: string, holidayDates: Iterable<string> = []) {
  if (!start || !end || end < start) return 0;

  const holidays = holidayDates instanceof Set ? holidayDates : new Set(holidayDates);
  let count = 0;
  let cursor = start;

  while (cursor <= end) {
    if (!isWeekend(cursor) && !holidays.has(cursor)) {
      count += 1;
    }
    cursor = addDaysLocal(cursor, 1);
  }

  return count;
}
