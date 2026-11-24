SET local check_function_bodies = off;

DROP FUNCTION "public"."list_poke_suggestions"();

CREATE OR REPLACE FUNCTION private.poke_suggestion_noise (
  p_viewer_id bigint,
  p_person_id bigint
)
  RETURNS double precision
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select ('x' || substr(md5(
    p_person_id::text || ':' || p_viewer_id::text || ':'
      || to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD')
  ), 1, 8))::bit(32)::bigint / 4294967296.0;
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
$function$;

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
    and private.pokeable_profile(poker.id)
  order by pair.last_poked_at desc, poker.id desc
  limit 100;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_poke_suggestions (
  p_after_score double precision DEFAULT NULL::double precision,
  p_after_id    bigint           DEFAULT NULL::bigint,
  p_limit       integer          DEFAULT 20
)
  RETURNS TABLE (
    profile_id           bigint,
    pub_id               text,
    name                 text,
    avatar_path          text,
    cohort               smallint,
    is_returning_student boolean,
    sort_score           double precision
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  caller public.profiles;
  caller_id bigint := private.current_profile_id();
begin
  if auth.uid() is null or caller_id is null then
    raise exception 'accepted profile required' using errcode = '42501';
  end if;
  select profile.* into caller from public.profiles as profile where profile.id = caller_id;
  return query
  select candidate.id, candidate.pub_id, candidate.name, candidate.avatar_path,
    candidate.cohort, candidate.is_returning_student, candidate.score
  from (
    select person.*,
      case
        when caller.cohort is not null and person.cohort = caller.cohort
          and person.gender = caller.gender then 0.0
        when (caller.cohort is not null and person.cohort = caller.cohort)
          or (caller.cohort is not null and abs(person.cohort - caller.cohort) = 1
            and person.gender = caller.gender)
          or person.type = 'teacher' then 0.7
        else 2.0
      end + private.poke_suggestion_noise(caller_id, person.id) as score
    from public.profiles as person
    left join private.poke_pairs as pair
      on pair.low_profile_id = least(caller_id, person.id)
      and pair.high_profile_id = greatest(caller_id, person.id)
    where person.id <> caller_id
      and person.status = 'accepted'
      and person.deleted_at is null
      and not private.profile_suspended(person.id)
      and not (pair.low_profile_id is not null and private.poke_awaits_reply(pair.last_poked_at))
  ) as candidate
  where p_after_score is null
    or (candidate.score, candidate.id) > (p_after_score, p_after_id)
  order by candidate.score, candidate.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$function$;

REVOKE ALL ON FUNCTION "public"."list_poke_suggestions"(double precision, bigint, integer) FROM PUBLIC, "anon", "service_role";

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
$function$;

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
  poked_profile_ids bigint[];
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
  with deleted_pairs as (
    delete from private.poke_pairs as pair
    where pair.low_profile_id = caller.id or pair.high_profile_id = caller.id
    returning pair.*
  )
  select array_agg(
    case when deleted_pairs.low_profile_id = caller.id
      then deleted_pairs.high_profile_id else deleted_pairs.low_profile_id end
  ) into poked_profile_ids
  from deleted_pairs
  where deleted_pairs.last_poker_profile_id = caller.id;
  -- 내가 찌르고 기다리던 사람의 콕 찌르기 알림 인원에서 나를 뺀다.
  perform private.sync_poke_notification(poked_profile_id)
  from unnest(poked_profile_ids) as poked_profile_id;
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

REVOKE ALL ON FUNCTION "private"."poke_suggestion_noise"(bigint, bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."list_poke_suggestions"(double precision, bigint, integer) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."list_poke_suggestions"(double precision, bigint, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_poke_suggestions"(double precision, bigint, integer) TO "postgres";
