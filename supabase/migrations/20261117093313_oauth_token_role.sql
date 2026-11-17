-- 선언형 스키마는 클러스터 역할을 다루지 않는다. 원격에는 여기서 만들고, 로컬·shadow DB는
-- `supabase/roles.sql`이 먼저 만든다(그래서 IF NOT EXISTS다).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oauth_member_check') THEN
    CREATE ROLE oauth_member_check NOLOGIN NOINHERIT;
  END IF;
END
$$;

GRANT oauth_member_check TO authenticator;

SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.oauth_access_token_hook (
  event jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select case
    when coalesce(event -> 'claims' ->> 'client_id', '') <> ''
      then jsonb_set(event, '{claims,role}', '"oauth_member_check"')
    else event
  end;
$function$;

REVOKE ALL ON FUNCTION "public"."oauth_access_token_hook"(jsonb) FROM PUBLIC, "anon", "authenticated", "service_role";

REVOKE ALL ON FUNCTION "public"."get_external_identity"() FROM "oauth_member_check";

GRANT EXECUTE ON FUNCTION "public"."get_external_identity"() TO "oauth_member_check";

REVOKE ALL ON FUNCTION "public"."oauth_access_token_hook"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."oauth_access_token_hook"(jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."oauth_access_token_hook"(jsonb) TO "supabase_auth_admin";

GRANT USAGE ON SCHEMA "public" TO "supabase_auth_admin";

GRANT USAGE ON SCHEMA "public" TO "oauth_member_check";
