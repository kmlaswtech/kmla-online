begin;

create extension if not exists pgtap with schema extensions;
select plan(17);

-- 연계 서비스 OAuth 액세스 토큰은 사용자 본인 토큰이다. Custom Access Token Hook이 역할을
-- `oauth_member_check`로 바꿔 `get_external_identity`만 부를 수 있게 한다(accounts §4.8).

-- Hook: 모든 토큰 발급에 실행되므로 일반 세션은 받은 그대로 돌려줘야 한다.
select is(
  public.oauth_access_token_hook(
    '{"user_id":"u","claims":{"sub":"u","role":"authenticated","aal":"aal1"},"authentication_method":"password"}'
  ),
  '{"user_id":"u","claims":{"sub":"u","role":"authenticated","aal":"aal1"},"authentication_method":"password"}'::jsonb,
  'the hook returns an app session event unchanged'
);
select is(
  public.oauth_access_token_hook('{"claims":{"sub":"u","role":"authenticated","client_id":""}}'),
  '{"claims":{"sub":"u","role":"authenticated","client_id":""}}'::jsonb,
  'the hook leaves an empty client_id alone'
);
select is(
  public.oauth_access_token_hook(
    '{"user_id":"u","claims":{"sub":"u","role":"authenticated","client_id":"c1","aal":"aal1"},"authentication_method":"oauth_provider/authorization_code"}'
  ),
  '{"user_id":"u","claims":{"sub":"u","role":"oauth_member_check","client_id":"c1","aal":"aal1"},"authentication_method":"oauth_provider/authorization_code"}'::jsonb,
  'the hook moves an OAuth client token to oauth_member_check and keeps every other claim'
);
select is(
  public.oauth_access_token_hook('{"claims":{"sub":"u","client_id":"c1"}}'),
  '{"claims":{"sub":"u","role":"oauth_member_check","client_id":"c1"}}'::jsonb,
  'the hook sets the role even when the event has none'
);

select ok(
  has_function_privilege('supabase_auth_admin', 'public.oauth_access_token_hook(jsonb)', 'EXECUTE'),
  'Supabase Auth can run the hook'
);
select ok(
  not has_function_privilege('anon', 'public.oauth_access_token_hook(jsonb)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.oauth_access_token_hook(jsonb)', 'EXECUTE'),
  'clients cannot call the hook'
);

-- 역할
select ok(
  not (select rolcanlogin from pg_roles where rolname = 'oauth_member_check'),
  'oauth_member_check cannot log in'
);
select ok(
  pg_has_role('authenticator', 'oauth_member_check', 'MEMBER'),
  'PostgREST can switch to oauth_member_check'
);

-- graphql_public 함수는 PUBLIC에 열려 있지만 스키마 USAGE가 없어 부를 수 없다(아래 스키마 검사).
-- 새 역할은 PUBLIC 권한을 물려받는다. public 함수를 만들 때 PUBLIC EXECUTE를 회수하지 않으면
-- OAuth 토큰이 그 함수를 부를 수 있게 되므로, 부를 수 있는 함수를 정확히 고정한다.
select results_eq(
  $$
    select p.oid::regprocedure::text
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('oauth_member_check', p.oid, 'EXECUTE')
    order by 1
  $$,
  $$values ('get_external_identity()')$$,
  'oauth_member_check can execute only get_external_identity in public'
);
select is_empty(
  $$
    select c.oid::regclass
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'v', 'm', 'p', 'f')
      and has_table_privilege('oauth_member_check', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
  $$,
  'oauth_member_check has no table privilege in public'
);
select ok(
  not has_schema_privilege('oauth_member_check', 'storage', 'USAGE')
    and not has_schema_privilege('oauth_member_check', 'graphql_public', 'USAGE')
    and not has_schema_privilege('oauth_member_check', 'private', 'USAGE'),
  'oauth_member_check cannot reach storage, graphql_public, or private'
);

-- 실제 호출: seed의 승인된 학생(student@kmla.hs.kr)
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"oauth_member_check","client_id":"c1"}',
  true
);
-- pgTAP 함수는 extensions 스키마에 있다. 단정을 부르려고 이 트랜잭션에서만 열어 준다(rollback).
grant usage on schema extensions to oauth_member_check;
set local role oauth_member_check;

select ok(
  (select count(*) from public.get_external_identity()) = 1,
  'an OAuth token confirms an accepted member'
);
select throws_ok(
  $$select * from public.get_my_profile()$$,
  '42501', null,
  'an OAuth token cannot read the caller profile'
);
select throws_ok(
  $$select id from public.profiles limit 1$$,
  '42501', null,
  'an OAuth token cannot read profiles'
);
select throws_ok(
  $$select * from public.list_feed_posts()$$,
  '42501', null,
  'an OAuth token cannot read the feed'
);
select throws_ok(
  $$select public.withdraw_account()$$,
  '42501', null,
  'an OAuth token cannot withdraw the account'
);
select throws_ok(
  $$select * from public.search_directory('a')$$,
  '42501', null,
  'an OAuth token cannot search members'
);

reset role;

select * from finish();
rollback;
