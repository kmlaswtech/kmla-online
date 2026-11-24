-- Declarative schema source of truth. Edit this file first, then generate and manually review the migration.

-- 콕 찌르기(기능 명세 §12.5). 두 사람 사이에 한 행을 두고 마지막으로 찌른 사람만 기억한다. 번갈아
-- 찌르기 규칙은 "마지막으로 찌른 사람은 14일 동안 다시 찌를 수 없다" 하나로 충분하므로 찌르기마다 행을
-- 쌓지 않는다. 실명 활동이고 두 당사자만 보는 기록이라 클라이언트 권한 없이 definer RPC로만 읽고 쓴다.
create table private.poke_pairs (
  low_profile_id bigint not null references public.profiles(id) on delete cascade,
  high_profile_id bigint not null references public.profiles(id) on delete cascade,
  last_poker_profile_id bigint not null,
  last_poked_at timestamptz not null default now(),
  last_strong boolean not null default false,
  poke_count integer not null default 1,
  strong_count integer not null default 0,
  -- 찔린 사람이 아직 보지 못한 푹 찌르기 효과. 콕 찌르기 화면을 열면 지운다.
  strong_effect_pending boolean not null default false,
  primary key (low_profile_id, high_profile_id),
  constraint poke_pairs_ordered check (low_profile_id < high_profile_id),
  constraint poke_pairs_last_poker check (
    last_poker_profile_id = low_profile_id or last_poker_profile_id = high_profile_id
  ),
  constraint poke_pairs_counts check (
    poke_count >= 1 and strong_count >= 0 and strong_count <= poke_count
  ),
  constraint poke_pairs_strong_effect check (not strong_effect_pending or last_strong)
);
alter table private.poke_pairs owner to postgres;
create index poke_pairs_low_recent_idx
on private.poke_pairs (low_profile_id, last_poked_at desc);
create index poke_pairs_high_recent_idx
on private.poke_pairs (high_profile_id, last_poked_at desc);

alter table private.poke_pairs enable row level security;
create policy poke_pairs_deny_client on private.poke_pairs
  for all to anon, authenticated using (false) with check (false);
revoke all on table private.poke_pairs from anon, authenticated;

-- 푹 찌르기 확률 1%(기능 명세 §12.5). 브라우저가 정하면 매번 푹을 만들 수 있으므로 서버가 뽑는다.
-- pgTAP은 트랜잭션 안에서 이 함수를 바꿔 결과를 고정한다.
create or replace function private.roll_strong_poke()
returns boolean
language sql volatile
set search_path = ''
as $$
  select pg_catalog.random() < 0.01;
$$;
alter function private.roll_strong_poke() owner to postgres;

-- 되찌르기를 기다리는 기간(기능 명세 §12.5). 지나면 받은 목록과 알림 인원에서 빠지고, 찌른 사람은 다시
-- 찌를 수 있으며, 찔린 사람에게는 추천으로 나온다.
create or replace function private.poke_awaits_reply(p_last_poked_at timestamptz)
returns boolean
language sql stable
set search_path = ''
as $$
  select p_last_poked_at > now() - interval '14 days';
$$;
alter function private.poke_awaits_reply(timestamptz) owner to postgres;

-- 찌를 수 있는 사람: 승인되어 이용 중이고 탈퇴하지 않은 사람.
create or replace function private.pokeable_profile(p_profile_id bigint)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as profile
    where profile.id = p_profile_id
      and profile.status = 'accepted'
      and profile.deleted_at is null
      and not private.profile_suspended(profile.id)
  );
$$;
alter function private.pokeable_profile(bigint) owner to postgres;

-- 내가 되찌를 차례이고 기다리는 기간이 남은 사람 수. 콕 찌르기 알림의 인원이다(기능 명세 §14.14).
-- 받은 목록과 같은 기준이라 정지·탈퇴한 사람은 세지 않는다. 기간 만료와 정지는 다음 계산 때 반영된다.
create or replace function private.sync_poke_notification(p_recipient_profile_id bigint)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  pending integer;
begin
  select count(*) into pending
  from private.poke_pairs as pair
  where (pair.low_profile_id = p_recipient_profile_id or pair.high_profile_id = p_recipient_profile_id)
    and pair.last_poker_profile_id <> p_recipient_profile_id
    and private.poke_awaits_reply(pair.last_poked_at)
    and private.pokeable_profile(pair.last_poker_profile_id);

  update public.notifications as notification
  set actor_count = greatest(pending, 1)
  where notification.id = (
    select event.notification_id
    from private.notification_event_keys as event
    where event.event_key = 'pokes:' || p_recipient_profile_id::text
  );
end;
$$;
alter function private.sync_poke_notification(bigint) owner to postgres;

create or replace function public.poke_profile(p_profile_id bigint)
returns table (poked boolean, strong boolean, poke_count integer, strong_count integer)
language plpgsql security definer
set search_path = ''
as $$
declare
  caller_id bigint := private.current_profile_id();
  low_id bigint;
  high_id bigint;
  pair private.poke_pairs;
  is_strong boolean;
  poke_title text;
  caller_profile public.profiles;
  notification_id uuid;
begin
  if auth.uid() is null or caller_id is null then
    raise exception 'accepted profile required' using errcode = '42501';
  end if;
  if p_profile_id is null or p_profile_id = caller_id or not private.pokeable_profile(p_profile_id) then
    raise exception 'poke target unavailable' using errcode = '22023';
  end if;

  low_id := least(caller_id, p_profile_id);
  high_id := greatest(caller_id, p_profile_id);

  -- 두 사람이 동시에 처음 찔러도 행이 없어 row lock을 걸 수 없다. 쌍 단위로 직렬화해 차례를 가린다.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('poke-pair:' || low_id::text || ':' || high_id::text, 0)
  );
  select existing.* into pair
  from private.poke_pairs as existing
  where existing.low_profile_id = low_id and existing.high_profile_id = high_id
  for update;

  if pair.low_profile_id is not null
    and pair.last_poker_profile_id = caller_id
    and private.poke_awaits_reply(pair.last_poked_at) then
    return query select false, false, pair.poke_count, pair.strong_count;
    return;
  end if;

  is_strong := private.roll_strong_poke();
  poke_title := case when is_strong then '회원님을 푹 찔렀습니다.' else '회원님을 콕 찔렀습니다.' end;

  insert into private.poke_pairs as existing (
    low_profile_id, high_profile_id, last_poker_profile_id, last_strong,
    strong_count, strong_effect_pending
  ) values (
    low_id, high_id, caller_id, is_strong,
    case when is_strong then 1 else 0 end, is_strong
  )
  on conflict (low_profile_id, high_profile_id) do update
  set last_poker_profile_id = excluded.last_poker_profile_id,
    last_poked_at = now(),
    last_strong = excluded.last_strong,
    poke_count = existing.poke_count + 1,
    strong_count = existing.strong_count + excluded.strong_count,
    strong_effect_pending = excluded.strong_effect_pending
  returning existing.* into pair;

  select profile.* into caller_profile
  from public.profiles as profile where profile.id = caller_id;

  notification_id := private.emit_notification(
    'poke:' || low_id::text || ':' || high_id::text || ':' || pair.poke_count::text,
    p_profile_id, 'poked', 'normal', 'poke', 'identified',
    caller_id, caller_profile.name, caller_profile.avatar_path,
    poke_title,
    null, null, null, null, null,
    'pokes:' || p_profile_id::text
  );
  -- 집계 경로의 emit_notification은 행위자만 바꾸고 문장은 그대로 둔다. 문장은 가장 최근 찌르기를 따른다.
  if notification_id is not null then
    update public.notifications
    set title = poke_title
    where id = notification_id;
    perform private.sync_poke_notification(p_profile_id);
  end if;
  -- 되찌르기였다면 내 차례가 하나 줄었다.
  perform private.sync_poke_notification(caller_id);

  return query select true, is_strong, pair.poke_count, pair.strong_count;
end;
$$;
alter function public.poke_profile(bigint) owner to postgres;

-- 프로필 버튼 상태. `waiting`이면 내가 찌르고 상대의 되찌르기를 기다리는 중이다.
create or replace function public.get_poke_state(p_profile_id bigint)
returns table (waiting boolean, poke_count integer)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  caller_id bigint := private.current_profile_id();
begin
  if auth.uid() is null or caller_id is null then
    raise exception 'accepted profile required' using errcode = '42501';
  end if;
  return query
  select coalesce(
      bool_or(pair.last_poker_profile_id = caller_id and private.poke_awaits_reply(pair.last_poked_at)),
      false
    ),
    coalesce(max(pair.poke_count), 0)
  from private.poke_pairs as pair
  where pair.low_profile_id = least(caller_id, p_profile_id)
    and pair.high_profile_id = greatest(caller_id, p_profile_id);
end;
$$;
alter function public.get_poke_state(bigint) owner to postgres;

-- 받은 콕 찌르기: 내가 되찌를 차례이고 기다리는 기간이 남은 사람, 최근 순(기능 명세 §12.5).
create or replace function public.list_my_pokes()
returns table (
  profile_id bigint,
  pub_id text,
  name text,
  avatar_path text,
  cohort smallint,
  is_returning_student boolean,
  poked_at timestamptz,
  poke_count integer,
  strong_count integer,
  last_strong boolean,
  strong_effect_pending boolean
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  caller_id bigint := private.current_profile_id();
begin
  if auth.uid() is null or caller_id is null then
    raise exception 'accepted profile required' using errcode = '42501';
  end if;
  return query
  select poker.id, poker.pub_id, poker.name, poker.avatar_path, poker.cohort,
    poker.is_returning_student, pair.last_poked_at, pair.poke_count, pair.strong_count,
    pair.last_strong, pair.strong_effect_pending
  from private.poke_pairs as pair
  join public.profiles as poker on poker.id = pair.last_poker_profile_id
  where (pair.low_profile_id = caller_id or pair.high_profile_id = caller_id)
    and pair.last_poker_profile_id <> caller_id
    and private.poke_awaits_reply(pair.last_poked_at)
    and private.pokeable_profile(poker.id)
  order by pair.last_poked_at desc, poker.id desc
  limit 100;
end;
$$;
alter function public.list_my_pokes() owner to postgres;

-- 콕 찌르기 화면을 열었다. 콕 찌르기 알림을 읽고, 보여 준 푹 찌르기 효과를 지운다. 화면이 뜰 때 한 번
-- 부른다. loader에서 부르면 되찌르기 뒤의 재검증마다 효과 표시와 읽음이 엇갈린다.
create or replace function public.mark_my_pokes_seen()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  caller_id bigint := private.current_profile_id();
begin
  if auth.uid() is null or caller_id is null then
    raise exception 'accepted profile required' using errcode = '42501';
  end if;
  update public.notifications
  set read_at = now()
  where recipient_profile_id = caller_id and kind = 'poked' and read_at is null;
  update private.poke_pairs as pair
  set strong_effect_pending = false
  where (pair.low_profile_id = caller_id or pair.high_profile_id = caller_id)
    and pair.last_poker_profile_id <> caller_id
    and pair.strong_effect_pending;
end;
$$;
alter function public.mark_my_pokes_seen() owner to postgres;

-- 추천: 최대 5명. 나를 찔렀지만 14일 동안 되찌르지 않아 받은 목록에서 빠진 사람을 먼저, 그다음 같은 기수를
-- 둔다. 어느 쪽이든 되찌르기를 기다리는 쌍(내가 기다리는 사람, 받은 목록의 사람)은 뺀다. 번갈아 찌르므로 최근
-- 14일 안에 주고받은 쌍은 늘 한쪽이 기다리는 중이라 "최근 7일 동안 주고받지 않은 사람" 조건은 따로 볼 필요가
-- 없다. 같은 묶음 안의 순서는 하루 동안 고정해 되찌르기 뒤 재검증마다 목록이 뒤섞이지 않게 한다.
create or replace function public.list_poke_suggestions()
returns table (
  profile_id bigint,
  pub_id text,
  name text,
  avatar_path text,
  cohort smallint,
  is_returning_student boolean
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  caller public.profiles;
  caller_id bigint := private.current_profile_id();
  today text := to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD');
begin
  if auth.uid() is null or caller_id is null then
    raise exception 'accepted profile required' using errcode = '42501';
  end if;
  select profile.* into caller from public.profiles as profile where profile.id = caller_id;
  return query
  select candidate.id, candidate.pub_id, candidate.name, candidate.avatar_path,
    candidate.cohort, candidate.is_returning_student
  from (
    select person.*,
      (pair.low_profile_id is not null
        and pair.last_poker_profile_id = person.id
        and not private.poke_awaits_reply(pair.last_poked_at)) as missed
    from public.profiles as person
    left join private.poke_pairs as pair
      on pair.low_profile_id = least(caller_id, person.id)
      and pair.high_profile_id = greatest(caller_id, person.id)
    where person.id <> caller_id
      and person.status = 'accepted'
      and person.deleted_at is null
      and not private.profile_suspended(person.id)
      and not (pair.low_profile_id is not null and private.poke_awaits_reply(pair.last_poked_at))
      and (
        (pair.low_profile_id is not null and pair.last_poker_profile_id = person.id)
        or (caller.cohort is not null and person.cohort = caller.cohort)
      )
  ) as candidate
  order by candidate.missed desc,
    md5(candidate.id::text || ':' || caller_id::text || ':' || today)
  limit 5;
end;
$$;
alter function public.list_poke_suggestions() owner to postgres;

-- 이름으로 찌를 사람을 찾는다. 각 사람에게 지금 찌를 수 있는지를 함께 돌려준다.
create or replace function public.search_poke_targets(p_query text)
returns table (
  profile_id bigint,
  pub_id text,
  name text,
  avatar_path text,
  cohort smallint,
  is_returning_student boolean,
  waiting boolean
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  caller_id bigint := private.current_profile_id();
  normalized_query text := lower(
    regexp_replace(btrim(coalesce(p_query, '')), '[[:space:]]+', '', 'g')
  );
begin
  if auth.uid() is null or caller_id is null then
    raise exception 'accepted profile required' using errcode = '42501';
  end if;
  if char_length(normalized_query) < 1 or char_length(normalized_query) > 50 then
    return;
  end if;
  return query
  select person.id, person.pub_id, person.name, person.avatar_path, person.cohort,
    person.is_returning_student,
    coalesce(
      pair.last_poker_profile_id = caller_id and private.poke_awaits_reply(pair.last_poked_at),
      false
    )
  from public.profiles as person
  left join private.poke_pairs as pair
    on pair.low_profile_id = least(caller_id, person.id)
    and pair.high_profile_id = greatest(caller_id, person.id)
  where person.id <> caller_id
    and person.status = 'accepted'
    and person.deleted_at is null
    and not private.profile_suspended(person.id)
    and person.search_name like '%' || normalized_query || '%'
  order by
    case
      when person.search_name = normalized_query then 0
      when person.search_name like normalized_query || '%' then 1
      else 2
    end,
    person.name, person.id
  limit 10;
end;
$$;
alter function public.search_poke_targets(text) owner to postgres;

revoke all on function private.roll_strong_poke() from public;
revoke all on function private.pokeable_profile(bigint) from public;
revoke all on function private.poke_awaits_reply(timestamptz) from public;
revoke all on function private.sync_poke_notification(bigint) from public;
revoke all on function public.poke_profile(bigint) from public, anon, authenticated;
grant execute on function public.poke_profile(bigint) to authenticated;
revoke all on function public.get_poke_state(bigint) from public, anon, authenticated;
grant execute on function public.get_poke_state(bigint) to authenticated;
revoke all on function public.list_my_pokes() from public, anon, authenticated;
grant execute on function public.list_my_pokes() to authenticated;
revoke all on function public.mark_my_pokes_seen() from public, anon, authenticated;
grant execute on function public.mark_my_pokes_seen() to authenticated;
revoke all on function public.list_poke_suggestions() from public, anon, authenticated;
grant execute on function public.list_poke_suggestions() to authenticated;
revoke all on function public.search_poke_targets(text) from public, anon, authenticated;
grant execute on function public.search_poke_targets(text) to authenticated;
