begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

-- 전역 검색의 게시물 탭(기능 명세 §3.6). 범위는 지금 가입한 그룹의 게시된 그룹 게시물이고,
-- 신원 규칙은 그룹 게시물 검색(§8.9)과 같다.

update public.profiles set name = '검색작성자' where pub_id = 'pureum-23';

insert into public.groups (
  id, slug, slug_is_custom, kind, name, join_policy, identity_policy, posting_policy, created_by
)
values
  (
    'c1000000-0000-0000-0000-000000000001', 'gs-mine', true, 'unofficial', '내검색그룹',
    'invite_only', 'optional_anonymous', 'members',
    (select id from public.profiles where pub_id = 'kim-admin')
  ),
  (
    'c1000000-0000-0000-0000-000000000002', 'gs-other', true, 'unofficial', '남검색그룹',
    'open', 'identified', 'members',
    (select id from public.profiles where pub_id = 'kim-admin')
  );

insert into public.group_memberships (group_id, profile_id)
select 'c1000000-0000-0000-0000-000000000001', profile.id
from public.profiles as profile
where profile.auth_user_id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000099'
);

insert into public.posts (
  id, kind, group_id, title, body, author_identity, display_author_profile_id,
  created_at, published_at
)
values
  (
    'c2000000-0000-0000-0000-000000000001', 'group', 'c1000000-0000-0000-0000-000000000001',
    '글로벌검색 첫째', '실명 본문', 'identified',
    (select id from public.profiles where pub_id = 'pureum-23'),
    now() - interval '3 hours', now() - interval '3 hours'
  ),
  (
    'c2000000-0000-0000-0000-000000000002', 'group', 'c1000000-0000-0000-0000-000000000001',
    '익명 글', '본문에 글로벌검색', 'anonymous', null,
    now() - interval '2 hours', now() - interval '2 hours'
  ),
  (
    'c2000000-0000-0000-0000-000000000003', 'group', 'c1000000-0000-0000-0000-000000000001',
    '글로벌검색 운영진', '운영진 본문', 'staff', null,
    now() - interval '1 hour', now() - interval '1 hour'
  ),
  (
    'c2000000-0000-0000-0000-000000000004', 'group', 'c1000000-0000-0000-0000-000000000001',
    '글로벌검색 초안', '초안 본문', 'identified',
    (select id from public.profiles where pub_id = 'pureum-23'),
    now() - interval '4 hours', null
  ),
  (
    'c2000000-0000-0000-0000-000000000005', 'group', 'c1000000-0000-0000-0000-000000000002',
    '글로벌검색 남의 그룹', '본문', 'identified',
    (select id from public.profiles where pub_id = 'pureum-23'),
    now() - interval '1 hour', now() - interval '1 hour'
  );

insert into public.posts (
  id, kind, timeline_profile_id, body, author_identity, display_author_profile_id,
  visibility, created_at, published_at
)
select
  'c2000000-0000-0000-0000-000000000006', 'profile', profile.id, '글로벌검색 개인 게시물',
  'identified', profile.id, 'public', now() - interval '1 hour', now() - interval '1 hour'
from public.profiles as profile
where profile.auth_user_id = '10000000-0000-0000-0000-000000000001';

insert into private.post_authors (post_id, profile_id)
select post.id, (select id from public.profiles where pub_id = 'pureum-23')
from public.posts as post
where post.id::text like 'c2000000-%' and post.kind = 'group';

insert into private.post_authors (post_id, profile_id)
select 'c2000000-0000-0000-0000-000000000006', profile.id
from public.profiles as profile
where profile.auth_user_id = '10000000-0000-0000-0000-000000000001';

select ok(
  not has_function_privilege(
    'anon',
    'public.search_member_group_posts(text, timestamp with time zone, uuid, integer)',
    'EXECUTE'
  ),
  'anonymous visitors cannot call the member post search'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;

select is(
  (select count(*) from public.search_member_group_posts('글')),
  0::bigint,
  'a one-character query returns nothing'
);

select is(
  (select array_agg(post_id order by published_at desc, post_id desc)
   from public.search_member_group_posts('글로벌 검색')),
  array[
    'c2000000-0000-0000-0000-000000000003',
    'c2000000-0000-0000-0000-000000000002',
    'c2000000-0000-0000-0000-000000000001'
  ]::uuid[],
  'only published posts of joined groups match, newest first, ignoring whitespace'
);

select is(
  (select array_agg(post_id order by published_at desc, post_id desc)
   from public.search_member_group_posts('글로벌검색')),
  array[
    'c2000000-0000-0000-0000-000000000003',
    'c2000000-0000-0000-0000-000000000002',
    'c2000000-0000-0000-0000-000000000001'
  ]::uuid[],
  'results come back already ordered newest first'
);

select is(
  (select row(group_slug, group_name)::text
   from public.search_member_group_posts('글로벌검색첫째')),
  row('gs-mine', '내검색그룹')::text,
  'each result names the group it belongs to'
);

select is(
  (select array_agg(row(author_name, is_staff)::text order by published_at desc)
   from public.search_member_group_posts('글로벌검색')),
  array[
    row('검색작성자', true)::text,
    row('익명', false)::text,
    row('검색작성자', false)::text
  ],
  'staff posts show the real author with a staff flag; anonymous posts show only 익명'
);

select ok(
  (select count(*) = 0 from public.search_member_group_posts('익명글') where author_name <> '익명'),
  'an anonymous result never carries the real author name'
);

select is(
  (select array_agg(post_id order by published_at desc)
   from public.search_member_group_posts('검색 작성자')),
  array[
    'c2000000-0000-0000-0000-000000000003',
    'c2000000-0000-0000-0000-000000000001'
  ]::uuid[],
  'visible author names match; the real author of an anonymous post does not'
);

select is(
  (select array_agg(post_id)
   from public.search_member_group_posts(
     '글로벌검색',
     (select published_at from public.posts where id = 'c2000000-0000-0000-0000-000000000002'),
     'c2000000-0000-0000-0000-000000000002',
     20
   )),
  array['c2000000-0000-0000-0000-000000000001']::uuid[],
  'the cursor continues strictly after the last seen post'
);

select is(
  (select count(*) from public.search_member_group_posts('글로벌검색', null, null, 2)),
  2::bigint,
  'the page size is honored'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000099', true);

select is(
  (select count(*) from public.search_member_group_posts('글로벌검색')),
  3::bigint,
  'teachers search the groups they belong to'
);

select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$select * from public.search_member_group_posts('글로벌검색')$$,
  '42501',
  null,
  'an unauthenticated caller is rejected'
);

reset role;
select * from finish();
rollback;
