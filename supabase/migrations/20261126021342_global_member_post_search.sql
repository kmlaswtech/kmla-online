SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.search_member_group_posts (
  p_query               text,
  p_cursor_published_at timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_cursor_post_id      uuid                     DEFAULT NULL::uuid,
  p_limit               integer                  DEFAULT 20
)
  RETURNS TABLE (
    post_id      uuid,
    group_slug   text,
    group_name   text,
    title        text,
    body         text,
    author_name  text,
    is_staff     boolean,
    published_at timestamp with time zone
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  caller_profile_id bigint := private.current_profile_id();
  normalized_query text := lower(
    regexp_replace(btrim(coalesce(p_query, '')), '[[:space:]]+', '', 'g')
  );
begin
  if auth.uid() is null or caller_profile_id is null then
    raise exception 'accepted profile required' using errcode = '42501';
  end if;
  -- 전역 검색의 다른 탭과 같은 최소 길이다. 한 글자는 거의 모든 글에 걸린다.
  if char_length(normalized_query) < 2 then
    return;
  end if;

  return query
  select
    post.id, target_group.slug, target_group.name, post.title, post.body,
    -- 화면에 보일 이름 하나만 보낸다. 운영진 명의는 실제 작성자 이름에 표시를 붙인다(§8.6).
    case
      when post.author_identity = 'anonymous' then '익명'
      when post.author_identity = 'staff' then coalesce(profile.name, '운영진')
      else profile.name
    end,
    post.author_identity = 'staff',
    post.published_at
  from public.group_memberships as membership
  join public.groups as target_group on target_group.id = membership.group_id
  join public.posts as post on post.group_id = membership.group_id
  -- 실제 작성자는 운영진 명의의 이름에만 쓴다. 다른 글은 찾지 않는다.
  left join private.post_authors as author
    on author.post_id = post.id and post.author_identity = 'staff'
  left join public.profiles as profile
    on (
      (post.author_identity = 'identified' and profile.id = post.display_author_profile_id)
      or (post.author_identity = 'staff' and profile.id = author.profile_id)
    )
    and profile.status = 'accepted'
    and profile.deleted_at is null
  where membership.profile_id = caller_profile_id
    and post.kind = 'group'
    and post.published_at is not null
    and (
      post.search_text like '%' || normalized_query || '%'
      or profile.search_name like '%' || normalized_query || '%'
    )
    and (
      p_cursor_post_id is null
      or (post.published_at, post.id) < (p_cursor_published_at, p_cursor_post_id)
    )
  order by post.published_at desc, post.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$function$;

REVOKE ALL ON FUNCTION "public"."search_member_group_posts"(text, timestamp WITH time zone, uuid, integer) FROM PUBLIC, "anon", "service_role";

GRANT EXECUTE ON FUNCTION "public"."search_member_group_posts"(text, timestamp WITH time zone, uuid, integer) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."search_member_group_posts"(text, timestamp WITH time zone, uuid, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."search_member_group_posts"(text, timestamp WITH time zone, uuid, integer) TO "postgres";
