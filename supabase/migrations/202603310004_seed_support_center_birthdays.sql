begin;

with seed_birthdays (title, start_date, birthday_calendar_type, birthday_is_intercalation, account_email) as (
  values
    ('강성용님 생일', '1963-09-19'::date, 'lunar', false, 'mega4190@megainfo.co.kr'),
    ('김용석님 생일', '1963-03-07'::date, 'lunar', false, 'mega5352@megainfo.co.kr'),
    ('김진숙님 생일', '1967-08-06'::date, 'lunar', false, 'mega6028@megainfo.co.kr'),
    ('김현님 생일', '1962-08-12'::date, 'lunar', false, 'mega5423@megainfo.co.kr'),
    ('연미순님 생일', '1962-03-15'::date, 'lunar', false, 'mega0734@megainfo.co.kr'),
    ('윤석용님 생일', '1955-07-23'::date, 'lunar', false, 'mega1800@megainfo.co.kr'),
    ('이미현님 생일', '1962-06-30'::date, 'lunar', false, 'mega2638@megainfo.co.kr'),
    ('이상숙님 생일', '1970-10-16'::date, 'lunar', false, 'mega2576@megainfo.co.kr'),
    ('이재흥님 생일', '1958-08-27'::date, 'lunar', false, 'mega1322@megainfo.co.kr'),
    ('임규정님 생일', '1973-04-26'::date, 'lunar', false, 'mega1510@megainfo.co.kr'),
    ('장민자님 생일', '1965-03-17'::date, 'lunar', false, 'mega5732@megainfo.co.kr'),
    ('조미라님 생일', '1964-01-15'::date, 'lunar', false, 'mega4328@megainfo.co.kr'),
    ('한갑렬님 생일', '1974-03-21'::date, 'lunar', false, 'mega4191@megainfo.co.kr'),
    ('김상훈님 생일', '1969-08-17'::date, 'solar', false, 'mega5224@megainfo.co.kr'),
    ('김용태님 생일', '1964-08-08'::date, 'solar', false, 'mega3595@megainfo.co.kr'),
    ('김인곤님 생일', '1971-12-24'::date, 'solar', false, 'mega4813@megainfo.co.kr'),
    ('김현숙님 생일', '1970-01-29'::date, 'solar', false, 'mega3129@megainfo.co.kr'),
    ('문성호님 생일', '1975-01-18'::date, 'solar', false, 'mega3451@megainfo.co.kr'),
    ('박영님 생일', '1975-03-21'::date, 'solar', false, 'mega5799@megainfo.co.kr'),
    ('박태하님 생일', '1961-10-30'::date, 'solar', false, 'mega0049@megainfo.co.kr'),
    ('서정연님 생일', '1967-05-17'::date, 'solar', false, 'mega5459@megainfo.co.kr'),
    ('송지우님 생일', '1973-03-20'::date, 'solar', false, 'mega6029@megainfo.co.kr'),
    ('신동율님 생일', '1955-07-21'::date, 'solar', false, 'mega0051@megainfo.co.kr'),
    ('유스나님 생일', '1976-06-21'::date, 'solar', false, 'mega4192@megainfo.co.kr'),
    ('이대환님 생일', '1975-10-25'::date, 'solar', false, 'mega5121@megainfo.co.kr'),
    ('이수진님 생일', '1969-01-08'::date, 'solar', false, 'mega5664@megainfo.co.kr'),
    ('이영태님 생일', '1967-05-04'::date, 'solar', false, 'mega5548@megainfo.co.kr'),
    ('이현순님 생일', '1980-10-31'::date, 'solar', false, 'mega6047@megainfo.co.kr'),
    ('이현주님 생일', '1982-12-07'::date, 'solar', false, 'mega3582@megainfo.co.kr'),
    ('임현우님 생일', '1968-09-26'::date, 'solar', false, 'mega5026@megainfo.co.kr'),
    ('정호세님 생일', '1980-01-04'::date, 'solar', false, 'mega1323@megainfo.co.kr'),
    ('조난희님 생일', '1964-09-17'::date, 'solar', false, 'mega4207@megainfo.co.kr'),
    ('허귀희님 생일', '1964-03-05'::date, 'solar', false, 'mega1135@megainfo.co.kr'),
    ('홍상철님 생일', '1962-02-23'::date, 'solar', false, 'mega4656@megainfo.co.kr')
)
insert into public.support_center_calendar_events (
  title,
  category,
  start_date,
  end_date,
  description,
  recurs_annually,
  birthday_calendar_type,
  birthday_is_intercalation,
  created_by
)
select
  s.title,
  'birthday',
  s.start_date,
  s.start_date,
  format('계정: %s', s.account_email),
  true,
  s.birthday_calendar_type,
  s.birthday_is_intercalation,
  null
from seed_birthdays s
where not exists (
  select 1
  from public.support_center_calendar_events e
  where e.category = 'birthday'
    and e.title = s.title
    and e.start_date = s.start_date
    and e.birthday_calendar_type = s.birthday_calendar_type
    and e.birthday_is_intercalation = s.birthday_is_intercalation
    and coalesce(e.description, '') = format('계정: %s', s.account_email)
);

commit;
