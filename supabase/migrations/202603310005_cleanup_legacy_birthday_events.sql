begin;

delete from public.support_center_calendar_events
where category = 'birthday'
  and description is null
  and title in (
    '김용석 팀장님 생일',
    '서정연 팀장님 생일(17일)',
    '연미순 팀장님 생일',
    '유스나 팀장님 생일(21일)',
    '이미현 팀장님 생일(28일)',
    '이영태 팀장님 생일',
    '임규정 실장님 생일',
    '장민자 팀장님 생일(3일)',
    '한갑렬 팀장님 생일'
  );

commit;
