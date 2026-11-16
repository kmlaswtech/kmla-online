begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

-- 외부 서비스(큼온 위키)용 안정 규약. 반환 형태가 바뀌면 위키의 kmla-sign-in과 개인정보 처리방침의
-- 위키 제공 항목도 바뀌어야 하므로 고정한다.
select is(
  pg_get_function_result('public.get_external_identity()'::regprocedure),
  'TABLE(profile_id bigint)',
  'the external identity contract returns only profile_id'
);
select is_definer('public', 'get_external_identity', array[]::name[], 'the external identity RPC is security definer');
select ok(
  not has_function_privilege('anon', 'public.get_external_identity()', 'EXECUTE'),
  'anonymous clients cannot execute the external identity RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.get_external_identity()', 'EXECUTE'),
  'signed-in clients can execute the external identity RPC'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000', user_id, 'authenticated',
  'authenticated', email, '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
from (values
  ('10000000-0000-0000-0000-000000000701'::uuid, 'ext-student@kmla.hs.kr'),
  ('10000000-0000-0000-0000-000000000702'::uuid, 'ext-teacher@kmla.hs.kr'),
  ('10000000-0000-0000-0000-000000000703'::uuid, 'ext-alumni@kmla.hs.kr'),
  ('10000000-0000-0000-0000-000000000704'::uuid, 'ext-draft@kmla.hs.kr'),
  ('10000000-0000-0000-0000-000000000705'::uuid, 'ext-pending@kmla.hs.kr'),
  ('10000000-0000-0000-0000-000000000706'::uuid, 'ext-blocked@kmla.hs.kr'),
  ('10000000-0000-0000-0000-000000000707'::uuid, 'ext-suspended@kmla.hs.kr'),
  ('10000000-0000-0000-0000-000000000708'::uuid, 'ext-withdrawn@kmla.hs.kr'),
  ('10000000-0000-0000-0000-000000000709'::uuid, 'ext-deleted@kmla.hs.kr')
) as users(user_id, email);

insert into public.profiles (
  auth_user_id, pub_id, name, type, student_number, cohort, gender, academic_track,
  birthday, phone_number, is_returning_student, status
)
values
  ('10000000-0000-0000-0000-000000000701', 'ext-student', '외부학생', 'student', '260701', 31,
   'female', 'domestic', '2009-03-01', '010-1111-2222', true, 'accepted'),
  ('10000000-0000-0000-0000-000000000702', 'ext-teacher', '외부선생', 'teacher', null, null,
   null, null, '1980-03-01', null, false, 'accepted'),
  ('10000000-0000-0000-0000-000000000703', 'ext-alumni', '외부졸업', 'alumni', null, 25,
   'male', 'domestic', '2003-03-01', null, false, 'accepted'),
  ('10000000-0000-0000-0000-000000000704', 'ext-draft', '외부초안', 'student', '260704', 31,
   'male', 'domestic', '2009-03-01', null, false, 'draft'),
  ('10000000-0000-0000-0000-000000000705', 'ext-pending', '외부대기', 'student', '260705', 31,
   'male', 'domestic', '2009-03-01', null, false, 'pending'),
  ('10000000-0000-0000-0000-000000000706', 'ext-blocked', '외부거절', 'student', '260706', 31,
   'male', 'domestic', '2009-03-01', null, false, 'blocked'),
  ('10000000-0000-0000-0000-000000000707', 'ext-suspended', '외부정지', 'student', '260707', 31,
   'male', 'domestic', '2009-03-01', null, false, 'accepted'),
  -- 탈퇴 묘비는 보통 auth_user_id가 끊기지만, 연결이 남아 있어도 0행이어야 한다.
  ('10000000-0000-0000-0000-000000000708', 'ext-withdrawn', '외부탈퇴', 'student', '260708', 31,
   'male', 'domestic', '2009-03-01', null, false, 'withdrawn'),
  ('10000000-0000-0000-0000-000000000709', 'ext-deleted', '외부삭제', 'student', '260709', 31,
   'male', 'domestic', '2009-03-01', null, false, 'accepted');

update public.profiles set deleted_at = now() where pub_id in ('ext-withdrawn', 'ext-deleted');

insert into private.profile_suspensions (profile_id, reason, expires_at)
select id, '외부 확인 테스트 정지', now() + interval '3 days'
from public.profiles where pub_id = 'ext-suspended';

select set_config('test.student_id', (select id::text from public.profiles where pub_id = 'ext-student'), true);
select set_config('test.teacher_id', (select id::text from public.profiles where pub_id = 'ext-teacher'), true);
select set_config('test.alumni_id', (select id::text from public.profiles where pub_id = 'ext-alumni'), true);

create function pg_temp.act_as(p_user_id uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_user_id)::text, true);
$$;
grant execute on function pg_temp.act_as(uuid) to authenticated, anon;

-- 승인된 회원은 각자 1행
select pg_temp.act_as('10000000-0000-0000-0000-000000000701');
set local role authenticated;
select results_eq(
  $$select profile_id from public.get_external_identity()$$,
  format($$values (%s::bigint)$$, current_setting('test.student_id')),
  'an accepted student gets one row with its profile id'
);
reset role;

select pg_temp.act_as('10000000-0000-0000-0000-000000000702');
set local role authenticated;
select results_eq(
  $$select profile_id from public.get_external_identity()$$,
  format($$values (%s::bigint)$$, current_setting('test.teacher_id')),
  'an accepted teacher gets one row'
);
reset role;

select pg_temp.act_as('10000000-0000-0000-0000-000000000703');
set local role authenticated;
select results_eq(
  $$select profile_id from public.get_external_identity()$$,
  format($$values (%s::bigint)$$, current_setting('test.alumni_id')),
  'an accepted alumni gets one row'
);
reset role;

-- 승인되지 않았거나 이용할 수 없는 계정은 오류 없이 0행
select pg_temp.act_as('10000000-0000-0000-0000-000000000704');
set local role authenticated;
select is_empty($$select * from public.get_external_identity()$$, 'a draft applicant gets no row');
reset role;

select pg_temp.act_as('10000000-0000-0000-0000-000000000705');
set local role authenticated;
select is_empty($$select * from public.get_external_identity()$$, 'a pending applicant gets no row');
reset role;

select pg_temp.act_as('10000000-0000-0000-0000-000000000706');
set local role authenticated;
select is_empty($$select * from public.get_external_identity()$$, 'a blocked applicant gets no row');
reset role;

select pg_temp.act_as('10000000-0000-0000-0000-000000000707');
set local role authenticated;
select is_empty($$select * from public.get_external_identity()$$, 'a suspended accepted member gets no row');
reset role;

select pg_temp.act_as('10000000-0000-0000-0000-000000000708');
set local role authenticated;
select is_empty($$select * from public.get_external_identity()$$, 'a withdrawn account gets no row');
reset role;

select pg_temp.act_as('10000000-0000-0000-0000-000000000709');
set local role authenticated;
select is_empty($$select * from public.get_external_identity()$$, 'a deleted profile gets no row');
reset role;

-- 프로필이 연결되지 않은 토큰
select set_config('request.jwt.claims', '{}', true);
set local role authenticated;
select is_empty($$select * from public.get_external_identity()$$, 'a token without a linked profile gets no row');
reset role;

set local role anon;
select throws_ok(
  $$select * from public.get_external_identity()$$,
  '42501', null,
  'an anonymous caller is refused'
);
reset role;

select * from finish();
rollback;
