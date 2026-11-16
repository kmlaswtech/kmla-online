SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_external_identity()
  RETURNS TABLE (
    profile_id bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select caller.profile_id
  from (select private.current_profile_id() as profile_id) as caller
  where caller.profile_id is not null;
$function$;

REVOKE ALL ON FUNCTION "public"."get_external_identity"() FROM PUBLIC, "anon", "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_external_identity"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."get_external_identity"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_external_identity"() TO "postgres";
