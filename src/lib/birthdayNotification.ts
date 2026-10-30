import KoreanLunarCalendar from 'korean-lunar-calendar';

export type BirthdayEvent = {
  id: string;
  title: string;
  start_date: string;
  description: string | null;
  recurs_annually: boolean | null;
  birthday_calendar_type: 'solar' | 'lunar' | null;
  birthday_is_intercalation: boolean | null;
};

export type BirthdayProfile = {
  email: string | null;
  display_name: string | null;
  resigned_at: string | null;
};

function buildAnnualDate(targetYear: number, originalDate: string) {
  const [, monthText, dayText] = originalDate.split('-');
  const month = Number(monthText);
  const day = Number(dayText);
  const lastDay = new Date(targetYear, month, 0).getDate();

  return `${targetYear}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

function lunarBirthdayToSolar(targetYear: number, originalDate: string, isIntercalation: boolean) {
  const [, monthText, dayText] = originalDate.split('-');
  const calendar = new KoreanLunarCalendar();
  const converted = calendar.setLunarDate(
    targetYear,
    Number(monthText),
    Number(dayText),
    isIntercalation,
  );
  if (!converted) return null;

  const solar = calendar.getSolarCalendar();
  return `${solar.year}-${String(solar.month).padStart(2, '0')}-${String(solar.day).padStart(2, '0')}`;
}

function eventDateForYear(event: BirthdayEvent, targetYear: number) {
  if (!event.recurs_annually) return event.start_date;
  if (event.birthday_calendar_type === 'lunar') {
    return lunarBirthdayToSolar(targetYear, event.start_date, Boolean(event.birthday_is_intercalation));
  }
  return buildAnnualDate(targetYear, event.start_date);
}

function normalizeEmail(value: string | null) {
  return String(value ?? '').trim().toLowerCase();
}

function accountEmailFromDescription(description: string | null) {
  const match = /^\s*계정:\s*([^\s]+)\s*$/i.exec(description ?? '');
  return match ? normalizeEmail(match[1]) : null;
}

function nameFromTitle(title: string) {
  return title.replace(/\s*님\s*생일\s*$/, '').trim() || title.trim();
}

export function seoulDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function birthdayNamesForDate(
  events: BirthdayEvent[],
  profiles: BirthdayProfile[],
  targetDate: string,
) {
  const targetYear = Number(targetDate.slice(0, 4));
  const profilesByEmail = new Map(
    profiles
      .filter((profile) => normalizeEmail(profile.email))
      .map((profile) => [normalizeEmail(profile.email), profile]),
  );
  const names = new Set<string>();

  for (const event of events) {
    if (eventDateForYear(event, targetYear) !== targetDate) continue;

    const accountEmail = accountEmailFromDescription(event.description);
    if (!accountEmail) {
      names.add(nameFromTitle(event.title));
      continue;
    }

    const profile = profilesByEmail.get(accountEmail);
    if (!profile) continue;
    if (profile.resigned_at && profile.resigned_at <= targetDate) continue;

    names.add(profile.display_name?.trim() || nameFromTitle(event.title));
  }

  return [...names].sort((a, b) => a.localeCompare(b, 'ko'));
}

export function buildBirthdayMessage(names: string[]) {
  const people = names.map((name) => `${name}님`).join(', ');
  return `[생일 알림]\n오늘은 ${people}의 생일입니다. 모두 함께 축하해 주세요!`;
}
