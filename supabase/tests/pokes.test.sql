begin;

create extension if not exists pgtap with schema extensions;
select plan(34);

create temp table fixture as
select
  (select id from public.profiles where pub_id = 'kim-admin') as admin_id,
  (select name from public.profiles where pub_id = 'kim-admin') as admin_name,
  (select id from public.profiles where pub_id = 'jung-teacher') as teacher_id,
  (select name from public.profiles where pub_id = 'jung-teacher') as teacher_name,
  (select id from public.profiles where pub_id = 'legacy-member') as legacy_id,
  (select name from public.profiles where pub_id = 'legacy-member') as legacy_name,
  (select id from public.profiles where pub_id = 'pending-user') as pending_id,
  (select id from public.profiles where pub_id = 'hanbyeol-25') as classmate_id;
grant select on fixture to authenticated;

-- 푹 찌르기 확률을 고정한다. 트랜잭션이 끝나면 원래 함수로 돌아간다.
create or replace function private.roll_strong_poke()
returns boolean language sql volatile set search_path = '' as $$ select false; $$;

-- 같은 기수 추천을 보려고 동기 한 명을 관리자와 같은 기수로 둔다.
update public.profiles set cohort = (select cohort from public.profiles where pub_id = 'kim-admin')
where pub_id = 'hanbyeol-25';

-- 관리자가 교사를 찌른다.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000098', true);
set local role authenticated;

select results_eq(
  $$select poked, strong, poke_count, strong_count from public.poke_profile((select teacher_id from fixture))$$,
  $$values (true, false, 1, 0)$$,
  'the first poke lands as a plain poke'
);
select results_eq(
  $$select poked, poke_count from public.poke_profile((select teacher_id from fixture))$$,
  $$values (false, 1)$$,
  'poking again before the other side pokes back is refused without counting'
);
select results_eq(
  $$select waiting, poke_count from public.get_poke_state((select teacher_id from fixture))$$,
  $$values (true, 1)$$,
  'the profile button knows it is waiting for a poke back'
);
select results_eq(
  $$select waiting, poke_count from public.get_poke_state((select legacy_id from fixture))$$,
  $$values (false, 0)$$,
  'a stranger can be poked'
);
select throws_ok(
  $$select * from public.poke_profile((select admin_id from fixture))$$,
  '22023', 'poke target unavailable',
  'nobody can poke themselves'
);
select throws_ok(
  $$select * from public.poke_profile((select pending_id from fixture))$$,
  '22023', 'poke target unavailable',
  'a member who is not approved cannot be poked'
);
select ok(
  exists (select 1 from public.list_poke_suggestions(null, null, 50) where profile_id = (select classmate_id from fixture)),
  'a classmate I have never poked is suggested'
);
select ok(
  not exists (select 1 from public.list_poke_suggestions(null, null, 50) where profile_id = (select teacher_id from fixture)),
  'someone I am waiting on is not suggested'
);
select throws_ok(
  $$select * from private.poke_pairs$$,
  '42501', null,
  'clients cannot read poke pairs directly'
);
reset role;

select results_eq(
  $$select kind::text, category::text, importance::text, title, actor_profile_id, actor_count, read_at is null
    from public.notifications where recipient_profile_id = (select teacher_id from fixture) and kind = 'poked'$$,
  $$select 'poked', 'poke', 'normal', '회원님을 콕 찔렀습니다.', admin_id, 1, true from fixture$$,
  'the poked member gets one normal-importance poke notification'
);

-- 교사가 푹 찌르기로 되찌른다.
create or replace function private.roll_strong_poke()
returns boolean language sql volatile set search_path = '' as $$ select true; $$;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000099', true);
set local role authenticated;

select results_eq(
  $$select profile_id, poke_count, strong_count, last_strong from public.list_my_pokes()$$,
  $$select admin_id, 1, 0, false from fixture$$,
  'the poked member sees who is waiting for a poke back'
);
select results_eq(
  $$select poked, strong, poke_count, strong_count from public.poke_profile((select admin_id from fixture))$$,
  $$values (true, true, 2, 1)$$,
  'a poke back can turn into a strong poke and counts both'
);
select is(
  (select count(*)::integer from public.list_my_pokes()),
  0,
  'after poking back it is no longer my turn'
);
reset role;

-- 레거시 회원도 관리자를 찌른다.
create or replace function private.roll_strong_poke()
returns boolean language sql volatile set search_path = '' as $$ select false; $$;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select results_eq(
  $$select poked from public.poke_profile((select admin_id from fixture))$$,
  $$values (true)$$,
  'a second member pokes the same person'
);
reset role;

select results_eq(
  $$select count(*)::integer, max(actor_count), bool_and(read_at is null),
      max(title), max(actor_profile_id)
    from public.notifications where recipient_profile_id = (select admin_id from fixture) and kind = 'poked'$$,
  $$select 1, 2, true, '회원님을 콕 찔렀습니다.', legacy_id from fixture$$,
  'pokes collapse into one unread notification led by the latest poker'
);
select results_eq(
  $$select push.title, push.body
    from public.notifications as notification
    cross join lateral private.notification_push_content(notification.id) as push
    where notification.recipient_profile_id = (select admin_id from fixture) and notification.kind = 'poked'$$,
  $$select '콕 찌르기', legacy_name || '님 외 1명이 회원님을 콕 찔렀습니다.' from fixture$$,
  'the push card names the latest poker and how many others wait'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000098', true);
set local role authenticated;
select results_eq(
  $$select profile_id, poke_count, strong_count, last_strong, strong_effect_pending
    from public.list_my_pokes() order by profile_id$$,
  $$select * from (
      select legacy_id, 1, 0, false, false from fixture
      union all select teacher_id, 2, 1, true, true from fixture
    ) as expected order by 1$$,
  'received pokes carry counts and flag an unseen strong poke'
);
select is(
  public.resolve_my_notification_destination(
    (select id from public.notifications where kind = 'poked' and recipient_profile_id = (select admin_id from fixture))
  ),
  '/pokes',
  'a poke notification opens the poke screen'
);
select lives_ok($$select public.mark_my_pokes_seen()$$, 'opening the poke screen');
select is(
  (select count(*)::integer from public.list_my_pokes() where strong_effect_pending),
  0,
  'the strong poke effect plays only once'
);
reset role;

select results_eq(
  $$select read_at is not null
    from public.notifications where recipient_profile_id = (select admin_id from fixture) and kind = 'poked'$$,
  $$values (true)$$,
  'opening the poke screen reads the poke notification'
);

-- 레거시 회원의 찌르기에 14일 넘게 답하지 않았다.
update private.poke_pairs
set last_poked_at = now() - interval '15 days'
where low_profile_id = least((select admin_id from fixture), (select legacy_id from fixture))
  and high_profile_id = greatest((select admin_id from fixture), (select legacy_id from fixture));

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000098', true);
set local role authenticated;
select ok(
  not exists (select 1 from public.list_my_pokes() where profile_id = (select legacy_id from fixture)),
  'a poke left unanswered for 14 days leaves the received list'
);
select ok(
  exists (select 1 from public.list_poke_suggestions(null, null, 50) where profile_id = (select legacy_id from fixture)),
  'a missed poke comes back among suggestions'
);
reset role;

select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select results_eq(
  $$select poked, poke_count from public.poke_profile((select admin_id from fixture))$$,
  $$values (true, 2)$$,
  'after 14 days without a reply the poker may poke again'
);
reset role;

-- 기기 알림 유형 설정
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000098', true);
set local role authenticated;
select is(
  (select poke_push_enabled from public.get_my_notification_preferences()),
  true,
  'poke push is on by default'
);
select lives_ok(
  $$select public.update_my_notification_preferences(true, true, true, true, true, false)$$,
  'poke push can be turned off'
);
select lives_ok(
  $$select public.update_my_notification_preferences(true, true, true, true, true)$$,
  'an older app that does not send the poke switch still saves'
);
select is(
  (select poke_push_enabled from public.get_my_notification_preferences()),
  false,
  'the older app call keeps the poke switch as it was'
);
reset role;

-- 관리자는 레거시 회원과 교사의 되찌르기 차례다. 교사에게 되찌르면 알림 인원이 줄어든다.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000098', true);
set local role authenticated;
select results_eq(
  $$select poked from public.poke_profile((select teacher_id from fixture))$$,
  $$values (true)$$,
  'poking back the teacher'
);
reset role;
select is(
  (select actor_count from public.notifications
    where recipient_profile_id = (select admin_id from fixture) and kind = 'poked'),
  1,
  'poking back recounts the people still waiting on me'
);

-- 같은 기수 동기가 열흘 전에 관리자를 찔렀다. 아직 받은 목록에 있으므로 추천에는 나오지 않는다.
insert into private.poke_pairs (low_profile_id, high_profile_id, last_poker_profile_id, last_poked_at)
select least(admin_id, classmate_id), greatest(admin_id, classmate_id), classmate_id,
  now() - interval '10 days'
from fixture;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000098', true);
set local role authenticated;
select ok(
  exists (select 1 from public.list_my_pokes() where profile_id = (select classmate_id from fixture)),
  'a classmate who poked me ten days ago waits in the received list'
);
select ok(
  not exists (select 1 from public.list_poke_suggestions(null, null, 50) where profile_id = (select classmate_id from fixture)),
  'someone waiting in the received list is not also suggested'
);
reset role;

-- 레거시 회원이 정지되면 그 찌르기는 받은 목록과 알림 인원에서 빠진다.
insert into private.profile_suspensions (profile_id, reason, expires_at)
select legacy_id, '콕 찌르기 테스트 정지', now() + interval '3 days' from fixture;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000098', true);
set local role authenticated;
select ok(
  not exists (select 1 from public.list_my_pokes() where profile_id = (select legacy_id from fixture)),
  'a suspended poker leaves the received list'
);
reset role;
select private.sync_poke_notification((select admin_id from fixture));
select is(
  (select actor_count from public.notifications
    where recipient_profile_id = (select admin_id from fixture) and kind = 'poked'),
  1,
  'a suspended poker is not counted in the poke notification'
);

select * from finish();
rollback;
