begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

-- 관리자(30기 여) 기준으로 묶음이 갈리도록 기수와 성별을 맞춘다.
update public.profiles set cohort = 30, gender = 'female' where pub_id = 'hanbyeol-25';
update public.profiles set cohort = 30, gender = 'male' where pub_id = 'pureum-23';
update public.profiles set cohort = 29, gender = 'female' where pub_id = 'saebyeok-24';
-- 이웃 기수지만 성별이 다르면 나머지다.
update public.profiles set cohort = 29, gender = 'male' where pub_id = 'legacy-member';

-- 묶음 안의 하루 고정 순서를 지워 묶음 순서만 본다. 트랜잭션이 끝나면 원래 함수로 돌아간다.
create or replace function private.poke_suggestion_noise(p_viewer_id bigint, p_person_id bigint)
returns double precision language sql stable set search_path = '' as $$ select 0::double precision; $$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000098', true);
set local role authenticated;

create temp table suggestion as
select row_number() over () as position, pub_id, sort_score, profile_id
from public.list_poke_suggestions(null, null, 50);

select is(
  (select pub_id from suggestion where position = 1),
  'hanbyeol-25',
  'a classmate of the same gender comes first'
);
select set_eq(
  $$select pub_id from suggestion where position between 2 and 4$$,
  array['pureum-23', 'saebyeok-24', 'jung-teacher'],
  'then classmates of the other gender, neighbouring cohorts of the same gender and teachers, mixed together'
);
select ok(
  exists (select 1 from suggestion where position > 4 and pub_id = 'legacy-member'),
  'everyone else follows, including a neighbouring cohort of the other gender'
);
select ok(
  not exists (select 1 from suggestion where pub_id = 'kim-admin'),
  'I am never suggested to myself'
);

select results_eq(
  $$select pub_id from public.list_poke_suggestions(
      (select sort_score from suggestion where position = 2),
      (select profile_id from suggestion where position = 2),
      2
    )$$,
  $$select pub_id from suggestion where position in (3, 4) order by position$$,
  'the next page continues right after the cursor'
);
select is(
  (select count(*)::integer from public.list_poke_suggestions(null, null, 2)),
  2,
  'a page holds at most the requested number of people'
);
reset role;

select * from finish();
rollback;
