SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.notification_push_allowed (
  p_notification                 public.notifications,
  p_subscription_created_at      timestamp with time zone,
  p_subscription_expiration_time timestamp with time zone
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- 집계 알림은 행이 먼저 있고 활동이 뒤에 붙는다. 구독 뒤에 새로 붙은 답글은 그 기기로 보내야
  -- 하므로 최초 생성 시각이 아니라 마지막 활동 시각과 비교한다.
  select p_subscription_created_at <= p_notification.last_activity_at
    and (
      p_subscription_expiration_time is null
      or p_subscription_expiration_time > now()
    )
    and p_notification.kind not in ('post_reacted', 'comment_reacted', 'application_submitted')
    and (
      p_notification.category = 'moderation'
      or case p_notification.category
        when 'content' then coalesce(preference.content_push_enabled, true)
        when 'timeline' then coalesce(preference.timeline_push_enabled, true)
        when 'group' then coalesce(preference.group_push_enabled, true)
        when 'account' then coalesce(preference.account_push_enabled, true)
        when 'school' then coalesce(preference.school_push_enabled, true)
        when 'poke' then coalesce(preference.poke_push_enabled, true)
        when 'moderation' then true
      end
    )
    and (
      p_notification.group_id is null
      or p_notification.category <> 'content'
      or exists (
        select 1
        from public.group_memberships as membership
        where membership.group_id = p_notification.group_id
          and membership.profile_id = p_notification.recipient_profile_id
          and membership.notification_level <> 'none'
          and membership.content_push_enabled
      )
    )
    and (
      p_notification.kind <> 'group_posted'
      or exists (
        select 1
        from public.group_memberships as membership
        where membership.group_id = p_notification.group_id
          and membership.profile_id = p_notification.recipient_profile_id
          and membership.notification_level = 'all'
          and membership.new_post_push_enabled
      )
    )
  from (select 1) as singleton
  left join public.notification_preferences as preference
    on preference.profile_id = p_notification.recipient_profile_id;
$function$;

CREATE OR REPLACE FUNCTION private.notification_push_content (
  p_notification_id uuid
)
  RETURNS TABLE (
    title text,
    body  text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with source as (
    select notification.*,
      target_group.name as group_name,
      case
        when char_length(btrim(target_post.title)) > 40
          then '“' || left(btrim(target_post.title), 39) || '…”'
        else '“' || btrim(target_post.title) || '”'
      end as post_title,
      coalesce(notification.actor_display_name, '탈퇴한 사용자')
        || case
          when notification.actor_count > 1
            then ' 외 ' || (notification.actor_count - 1)::text || '명'
          else ''
        end as actor,
      membership.role as member_role
    from public.notifications as notification
    left join public.groups as target_group on target_group.id = notification.group_id
    left join public.posts as target_post on target_post.id = notification.post_id
    left join public.group_memberships as membership
      on membership.group_id = notification.group_id
      and membership.profile_id = notification.recipient_profile_id
    where notification.id = p_notification_id
  ), content as (
    select
      case
        when source.kind in (
          'post_commented', 'comment_replied', 'post_mentioned', 'comment_mentioned'
        ) then source.actor || coalesce(' · ' || source.group_name, '')
        when source.kind in ('timeline_posted', 'timeline_post_deleted') then source.actor
        when source.kind in ('post_moderated', 'comment_moderated', 'anonymous_activity_restricted')
          then '운영 조치'
        when source.kind = 'gongang_preempted' then '공강 예약'
        when source.kind = 'poked' then '콕 찌르기'
        when source.group_name is not null then source.group_name
        else 'KMLA Online'
      end as title,
      case source.kind
        when 'post_commented' then
          coalesce(source.post_title || '에 ', '내 게시물에 ') || '댓글을 남겼습니다.'
        when 'comment_replied' then
          coalesce(source.post_title || '에서 ', '') || '내 댓글에 답글을 남겼습니다.'
        when 'post_mentioned' then
          coalesce(source.post_title || '에서 ', '게시물에서 ') || '회원님을 멘션했습니다.'
        when 'comment_mentioned' then
          coalesce(source.post_title || '의 댓글에서 ', '댓글에서 ') || '회원님을 멘션했습니다.'
        when 'timeline_posted' then '내 타임라인에 게시물을 남겼습니다.'
        when 'timeline_post_deleted' then '타임라인에 남긴 내 게시물을 삭제했습니다.'
        -- 새 그룹 게시물 알림의 `title`은 게시물 제목이다. 메시지 그룹 카드처럼 작성자를 앞에 둔다.
        when 'group_posted' then source.actor || ': ' || source.title
        when 'group_join_requested' then source.actor || '님이 가입을 요청했습니다.'
        when 'group_join_approved' then '가입 요청이 승인되었습니다.'
        when 'group_join_rejected' then '가입 요청이 거절되었습니다.'
        -- 알림에 바뀐 역할을 남기지 않으므로 지금 역할을 쓴다. 그사이 다시 바뀌었으면 최신 역할이다.
        when 'group_role_changed' then case source.member_role
          when 'owner' then '내 역할이 소유자로 변경되었습니다.'
          when 'admin' then '내 역할이 관리자로 변경되었습니다.'
          when 'manager' then '내 역할이 매니저로 변경되었습니다.'
          when 'member' then '내 역할이 멤버로 변경되었습니다.'
          else '내 그룹 역할이 변경되었습니다.'
        end
        when 'official_group_joined' then '공식 그룹에 자동으로 가입되었습니다.'
        -- `title`은 `회원님을 콕(푹) 찔렀습니다.`다. 이름 뒤에 `님`을 붙여 문장으로 잇는다.
        when 'poked' then coalesce(source.actor_display_name, '탈퇴한 사용자') || '님'
          || case
            when source.actor_count > 1 then ' 외 ' || (source.actor_count - 1)::text || '명이 '
            else '이 '
          end || source.title
        when 'anonymous_activity_restricted' then
          coalesce(source.group_name || ' 그룹에서 ', '그룹에서 ') || '익명 활동이 제한되었습니다.'
        when 'account_approved' then '가입이 승인되었습니다. 이제 KMLA Online을 이용할 수 있습니다.'
        -- 반려 사유는 본인 메일함에만 보낸다(기능 명세 §14.6).
        when 'account_rejected' then
          '가입 신청이 반려되었습니다. 학교 프로필 설정에서 정보를 고쳐 다시 제출해 주세요.'
        when 'account_unblocked' then
          '차단이 해제되었습니다. 학교 프로필 설정에서 정보를 확인하고 다시 제출해 주세요.'
        else source.title
      end as body
    from source
  )
  -- 서비스 워커 검증 한도(제목 160자, 본문 240자)와 같다. 둘 다 code point로 센다.
  select left(content.title, 160), left(content.body, 240)
  from content;
$function$;

CREATE OR REPLACE FUNCTION private.poke_awaits_reply (
  p_last_poked_at timestamp with time zone
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select p_last_poked_at > now() - interval '14 days';
$function$;

CREATE OR REPLACE FUNCTION private.pokeable_profile (
  p_profile_id bigint
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1
    from public.profiles as profile
    where profile.id = p_profile_id
      and profile.status = 'accepted'
      and profile.deleted_at is null
      and not private.profile_suspended(profile.id)
  );
$function$;

CREATE OR REPLACE FUNCTION private.roll_strong_poke()
  RETURNS boolean
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select pg_catalog.random() < 0.01;
$function$;

CREATE OR REPLACE FUNCTION private.sync_poke_notification (
  p_recipient_profile_id bigint
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  pending integer;
begin
  select count(*) into pending
  from private.poke_pairs as pair
  join public.profiles as poker on poker.id = pair.last_poker_profile_id
  where (pair.low_profile_id = p_recipient_profile_id or pair.high_profile_id = p_recipient_profile_id)
    and pair.last_poker_profile_id <> p_recipient_profile_id
    and private.poke_awaits_reply(pair.last_poked_at)
    and poker.deleted_at is null;

  update public.notifications as notification
  set actor_count = greatest(pending, 1)
  where notification.id = (
    select event.notification_id
    from private.notification_event_keys as event
    where event.event_key = 'pokes:' || p_recipient_profile_id::text
  );
end;
$function$;

-- 반환 열이 늘어 교체할 수 없다. 같은 트랜잭션에서 지우고 다시 만든다.
DROP FUNCTION "public"."get_my_notification_preferences"();

CREATE OR REPLACE FUNCTION public.get_my_notification_preferences()
  RETURNS TABLE (
    content_push_enabled   boolean,
    timeline_push_enabled  boolean,
    group_push_enabled     boolean,
    account_push_enabled   boolean,
    school_push_enabled    boolean,
    message_preview_hidden boolean,
    poke_push_enabled      boolean
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  caller_profile_id bigint := private.current_profile_id();
begin
  if auth.uid() is null or caller_profile_id is null then
    raise exception 'accepted profile required' using errcode = '42501';
  end if;
  insert into public.notification_preferences (profile_id)
  values (caller_profile_id)
  on conflict do nothing;
  return query
  select preference.content_push_enabled, preference.timeline_push_enabled,
    preference.group_push_enabled, preference.account_push_enabled,
    preference.school_push_enabled, preference.message_preview_hidden,
    preference.poke_push_enabled
  from public.notification_preferences as preference
  where preference.profile_id = caller_profile_id;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."get_my_notification_preferences"() FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.get_poke_state (
  p_profile_id bigint
)
  RETURNS TABLE (
    waiting    boolean,
    poke_count integer
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION "public"."get_poke_state"(bigint) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.list_my_pokes()
  RETURNS TABLE (
    profile_id            bigint,
    pub_id                text,
    name                  text,
    avatar_path           text,
    cohort                smallint,
    is_returning_student  boolean,
    poked_at              timestamp with time zone,
    poke_count            integer,
    strong_count          integer,
    last_strong           boolean,
    strong_effect_pending boolean
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
    and poker.status = 'accepted'
    and poker.deleted_at is null
  order by pair.last_poked_at desc, poker.id desc
  limit 100;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."list_my_pokes"() FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.list_poke_suggestions()
  RETURNS TABLE (
    profile_id           bigint,
    pub_id               text,
    name                 text,
    avatar_path          text,
    cohort               smallint,
    is_returning_student boolean
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
      and not (
        pair.low_profile_id is not null
        and pair.last_poker_profile_id = caller_id
        and private.poke_awaits_reply(pair.last_poked_at)
      )
      and (
        (pair.low_profile_id is not null
          and pair.last_poker_profile_id = person.id
          and not private.poke_awaits_reply(pair.last_poked_at))
        or (
          caller.cohort is not null
          and person.cohort = caller.cohort
          and (pair.low_profile_id is null or pair.last_poked_at < now() - interval '7 days')
        )
      )
  ) as candidate
  order by candidate.missed desc,
    md5(candidate.id::text || ':' || caller_id::text || ':' || today)
  limit 5;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."list_poke_suggestions"() FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.mark_my_pokes_seen()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION "public"."mark_my_pokes_seen"() FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.poke_profile (
  p_profile_id bigint
)
  RETURNS TABLE (
    poked        boolean,
    strong       boolean,
    poke_count   integer,
    strong_count integer
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  caller_id bigint := private.current_profile_id();
  low_id bigint;
  high_id bigint;
  pair private.poke_pairs;
  is_strong boolean;
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
    case when is_strong then '회원님을 푹 찔렀습니다.' else '회원님을 콕 찔렀습니다.' end,
    null, null, null, null, null,
    'pokes:' || p_profile_id::text
  );
  -- 집계 경로의 emit_notification은 행위자만 바꾸고 문장은 그대로 둔다. 문장은 가장 최근 찌르기를 따른다.
  if notification_id is not null then
    update public.notifications
    set title = case when is_strong then '회원님을 푹 찔렀습니다.' else '회원님을 콕 찔렀습니다.' end
    where id = notification_id;
    perform private.sync_poke_notification(p_profile_id);
  end if;

  return query select true, is_strong, pair.poke_count, pair.strong_count;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."poke_profile"(bigint) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.resolve_my_notification_destination (
  p_notification_id uuid
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  target public.notifications;
  destination text := '/noti';
  group_slug text;
  profile_pub_id text;
begin
  if auth.uid() is null or private.current_profile_id() is null then
    raise exception 'accepted profile required' using errcode = '42501';
  end if;
  select notification.* into target
  from public.notifications as notification
  where notification.id = p_notification_id
    and notification.recipient_profile_id = private.current_profile_id()
  for update;
  if target.id is null then
    raise exception 'notification not found' using errcode = 'P0002';
  end if;

  if target.post_id is not null and private.can_read_post(target.post_id) then
    if target.group_id is not null then
      select group_record.slug into group_slug
      from public.groups as group_record
      where group_record.id = target.group_id;
      if group_slug is not null then
        destination := '/groups/' || group_slug || '/posts/' || target.post_id::text;
      end if;
    else
      select profile.pub_id into profile_pub_id
      from public.posts as post
      join public.profiles as profile on profile.id = post.timeline_profile_id
      where post.id = target.post_id;
      if profile_pub_id is not null then
        destination := '/profile/' || profile_pub_id || '/posts/' || target.post_id::text;
      end if;
    end if;
  elsif target.group_id is not null and private.is_group_member(target.group_id) then
    select group_record.slug into group_slug
    from public.groups as group_record
    where group_record.id = target.group_id;
    if group_slug is not null then destination := '/groups/' || group_slug; end if;
  elsif target.target_profile_id is not null then
    select profile.pub_id into profile_pub_id
    from public.profiles as profile
    where profile.id = target.target_profile_id
      and profile.status = 'accepted' and profile.deleted_at is null;
    if profile_pub_id is not null then destination := '/profile/' || profile_pub_id; end if;
  elsif target.kind = 'gongang_preempted' then
    destination := '/menu/gongang';
  elsif target.kind = 'poked' then
    destination := '/pokes';
  end if;

  update public.notifications set read_at = coalesce(read_at, now()) where id = target.id;
  return destination;
end;
$function$;

-- 콕 찌르기 인자가 늘었다. 기본값이 있어 이전 앱의 다섯 인자 호출도 이 함수로 풀린다.
DROP FUNCTION "public"."update_my_notification_preferences"(boolean, boolean, boolean, boolean, boolean);

CREATE OR REPLACE FUNCTION public.update_my_notification_preferences (
  p_content_push_enabled  boolean,
  p_timeline_push_enabled boolean,
  p_group_push_enabled    boolean,
  p_account_push_enabled  boolean,
  p_school_push_enabled   boolean,
  p_poke_push_enabled     boolean DEFAULT NULL::boolean
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  caller_profile_id bigint := private.current_profile_id();
begin
  if auth.uid() is null or caller_profile_id is null then
    raise exception 'accepted profile required' using errcode = '42501';
  end if;
  if pg_catalog.num_nonnulls(
    p_content_push_enabled, p_timeline_push_enabled, p_group_push_enabled,
    p_account_push_enabled, p_school_push_enabled
  ) <> 5 then
    raise exception 'notification preferences must not be null' using errcode = '22023';
  end if;
  insert into public.notification_preferences as preference (
    profile_id, content_push_enabled, timeline_push_enabled,
    group_push_enabled, account_push_enabled, school_push_enabled, poke_push_enabled
  ) values (
    caller_profile_id, p_content_push_enabled, p_timeline_push_enabled,
    p_group_push_enabled, p_account_push_enabled, p_school_push_enabled,
    coalesce(p_poke_push_enabled, true)
  ) on conflict (profile_id) do update set
    content_push_enabled = excluded.content_push_enabled,
    timeline_push_enabled = excluded.timeline_push_enabled,
    group_push_enabled = excluded.group_push_enabled,
    account_push_enabled = excluded.account_push_enabled,
    school_push_enabled = excluded.school_push_enabled,
    poke_push_enabled = coalesce(p_poke_push_enabled, preference.poke_push_enabled),
    updated_at = now();
end;
$function$;

REVOKE ALL ON FUNCTION "public"."update_my_notification_preferences"(boolean, boolean, boolean, boolean, boolean, boolean) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.withdraw_account()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  caller_auth_user_id uuid := auth.uid();
  caller public.profiles;
  conversation_id uuid;
  timeline_post_ids uuid[];
begin
  select profile.* into caller
  from public.profiles as profile
  where profile.auth_user_id = caller_auth_user_id
    and caller_auth_user_id is not null
    and profile.status = 'accepted'
    and profile.deleted_at is null
  for update;

  if caller.id is null then
    raise exception 'accepted profile required' using errcode = '42501';
  end if;

  perform private.require_recent_password_auth();

  -- 소유권 이전(`transfer_group_ownership`)도 대상 멤버십을 잠근다. 검사 전에 먼저 잠가야, 동시에
  -- 넘겨받은 소유자 행을 아래에서 지워 소유자 없는 그룹을 만드는 일이 없다.
  perform 1
  from public.group_memberships as membership
  where membership.profile_id = caller.id
  for update;

  if caller.role = 'admin' then
    -- 화면이 사유별 안내를 고르도록 hint로 구분한다.
    raise exception 'app administrator role must be released before withdrawal'
      using errcode = '55000', hint = 'app_admin';
  end if;
  if exists (
    select 1
    from public.group_memberships as membership
    where membership.profile_id = caller.id
      and membership.role = 'owner'
  ) then
    raise exception 'group ownership must be transferred before withdrawal'
      using errcode = '55000', hint = 'group_owner';
  end if;

  -- 1:1 대화는 상대의 기록으로 남기되 내 참여 기간만 닫는다. 열어 두면 상대 메시지의 안 읽은
  -- 수에 탈퇴자가 영원히 남는다. 새 메시지는 `send_message`가 거부한다.
  update public.conversation_members as member
  set left_at = clock_timestamp(),
    left_by_self = true
  from public.conversations as conversation
  where conversation.id = member.conversation_id
    and conversation.type = 'direct'
    and member.profile_id = caller.id
    and member.left_at is null;

  -- 그룹 대화는 나가며 남은 멤버에게 나갔다는 표시를 남긴다.
  for conversation_id in
    select member.conversation_id
    from public.conversation_members as member
    join public.conversations as conversation on conversation.id = member.conversation_id
    where member.profile_id = caller.id
      and member.left_at is null
      and conversation.type = 'group'
    order by member.conversation_id
  loop
    perform private.lock_group_for_member(caller.id, conversation_id);
    perform private.leave_group_conversation(caller.id, conversation_id);
  end loop;
  -- 남이 붙여 준 별명도 지운다. 탈퇴한 사람은 이름 대신 탈퇴 표시를 그리므로 남길 까닭이 없다.
  delete from private.conversation_nicknames as nickname
  where nickname.profile_id = caller.id;

  -- 타임라인 주인이 탈퇴하면 그 타임라인의 글은 아무도 읽을 수 없으므로 남의 글까지 함께 지운다.
  select coalesce(array_agg(post.id), '{}') into timeline_post_ids
  from public.posts as post
  where post.timeline_profile_id = caller.id;
  perform private.purge_posts(timeline_post_ids);

  with deleted as (
    delete from public.stories as story
    where story.profile_id = caller.id
    returning story.image_path, story.thumbnail_path
  )
  insert into private.storage_cleanup_queue as queue (bucket, object_path, reason)
  select 'story-media', path.object_path, 'story_media'
  from deleted
  cross join lateral (values (deleted.image_path), (deleted.thumbnail_path)) as path(object_path)
  where path.object_path is not null
  on conflict (bucket, object_path) do update
    set dry_run = queue.dry_run and excluded.dry_run;

  with deleted as (
    delete from public.profile_media_objects as media
    where media.profile_id = caller.id
    returning media.object_path
  )
  insert into private.storage_cleanup_queue as queue (bucket, object_path, reason)
  select 'profile-media', deleted.object_path, 'profile_media'
  from deleted
  on conflict (bucket, object_path) do update
    set dry_run = queue.dry_run and excluded.dry_run;

  with deleted as (
    delete from public.profile_media_activity_objects as activity
    where activity.profile_id = caller.id
    returning activity.object_path
  )
  insert into private.storage_cleanup_queue as queue (bucket, object_path, reason)
  select 'profile-media', deleted.object_path, 'profile_media_activity'
  from deleted
  on conflict (bucket, object_path) do update
    set dry_run = queue.dry_run and excluded.dry_run;

  delete from public.group_join_requests where profile_id = caller.id;
  delete from private.group_invites where created_by = caller.id;
  delete from public.user_timetables where profile_id = caller.id;
  delete from private.poke_pairs
  where low_profile_id = caller.id or high_profile_id = caller.id;
  delete from public.notification_preferences where profile_id = caller.id;
  delete from private.web_push_subscriptions where profile_id = caller.id;
  delete from private.notification_delivery_outbox where recipient_profile_id = caller.id;
  delete from public.notifications where recipient_profile_id = caller.id;
  delete from public.profile_permissions where profile_id = caller.id;
  delete from private.feed_sessions where profile_id = caller.id;
  delete from public.story_views where profile_id = caller.id;
  -- 지난 예약도 신청자 이름 사본을 들고 있다.
  delete from public.utility_reservations where profile_id = caller.id;
  -- 신고와 제재 기록은 묘비에 남겨도 재가입한 새 계정과 이을 수 없고(학번·Auth 연결을 지운다),
  -- 개인정보처리방침 4항이 탈퇴 때 삭제를 약속한다.
  delete from private.group_post_reports where reporter_profile_id = caller.id;
  delete from private.profile_suspensions where profile_id = caller.id;
  delete from private.group_anonymous_activity_restrictions where profile_id = caller.id;
  -- 진행 중인 회차의 신청만 풀어 다른 사람이 신청할 수 있게 한다. 마감한 회차의 신청은 배부
  -- 기록이므로 건드리지 않는다.
  update public.donation_claims as claim
  set cancelled_at = now()
  from public.donation_items as item
  join public.donation_rounds as round on round.id = item.round_id
  where item.id = claim.item_id
    and claim.profile_id = caller.id
    and claim.cancelled_at is null
    and now() >= round.opens_at
    and now() < round.closes_at;

  -- 다른 회원의 알림에 복사된 이름과 사진. 읽기 경로가 빈 이름을 "탈퇴한 사용자"로 그린다.
  update public.notifications
  set actor_display_name = null, actor_avatar_path = null
  where actor_profile_id = caller.id;

  -- 상태 전환 트리거가 공식 그룹 멤버십을 지우므로 나머지 그룹 멤버십을 그 뒤에 지운다.
  update public.profiles
  set status = 'withdrawn',
    deleted_at = now(),
    -- 사용자가 고른 공개 ID도 식별 정보다. 무작위 값으로 바꿔 묘비와 사람의 연결을 끊는다.
    pub_id = private.generate_profile_pub_id(),
    status_updated_at = now(),
    status_updated_by = caller.id,
    auth_user_id = null,
    role = 'member',
    name = '탈퇴한 사용자',
    anonymous_username = null,
    student_number = null,
    class_no = null,
    cohort = null,
    gender = null,
    academic_track = null,
    phone_number = null,
    avatar_path = null,
    cover_path = null,
    birthday = null,
    description = null,
    dorm_room = null,
    contact_email = null,
    department = null,
    is_returning_student = false
  where id = caller.id;

  delete from public.group_memberships where profile_id = caller.id;

  -- 세션과 identity는 FK CASCADE로 함께 지워진다. 이미 발급된 access token은 만료까지 남지만
  -- 프로필에 이어지지 않아 모든 RLS·RPC 검사에서 거부된다.
  delete from auth.users where id = caller_auth_user_id;

  -- 위에서 큐에 넣은 미디어를 바로 지우도록 워커를 깨운다. `purge_posts`도 깨우지만 그때는 아직
  -- 미디어가 큐에 없다. 실패해도 경로는 큐에 남아 백스톱이 받는다(삭제 및 보존 정책 §4.1).
  perform private.invoke_storage_cleanup(p_quiet => true);
end;
$function$;

ALTER TABLE "private"."poke_pairs"
  ADD CONSTRAINT "poke_pairs_high_profile_id_fkey" FOREIGN KEY (high_profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "private"."poke_pairs"
  ADD CONSTRAINT "poke_pairs_low_profile_id_fkey" FOREIGN KEY (low_profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX poke_pairs_high_recent_idx ON private.poke_pairs USING btree (high_profile_id, last_poked_at DESC);

CREATE INDEX poke_pairs_low_recent_idx ON private.poke_pairs USING btree (low_profile_id, last_poked_at DESC);

CREATE POLICY "poke_pairs_deny_client" ON "private"."poke_pairs"
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON FUNCTION "private"."poke_awaits_reply"(timestamp WITH time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."pokeable_profile"(bigint) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."roll_strong_poke"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."sync_poke_notification"(bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_my_notification_preferences"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."get_my_notification_preferences"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_my_notification_preferences"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_poke_state"(bigint) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."get_poke_state"(bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_poke_state"(bigint) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_my_pokes"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."list_my_pokes"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_my_pokes"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_poke_suggestions"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."list_poke_suggestions"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_poke_suggestions"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."mark_my_pokes_seen"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."mark_my_pokes_seen"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."mark_my_pokes_seen"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."poke_profile"(bigint) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."poke_profile"(bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."poke_profile"(bigint) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_my_notification_preferences"(boolean, boolean, boolean, boolean, boolean, boolean) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."update_my_notification_preferences"(boolean, boolean, boolean, boolean, boolean, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_my_notification_preferences"(boolean, boolean, boolean, boolean, boolean, boolean) TO "postgres";

