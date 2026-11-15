SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_external_identity()
  RETURNS TABLE (
    profile_id           bigint,
    type                 public.profile_type,
    cohort               smallint,
    is_returning_student boolean
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select profile.id, profile.type, profile.cohort, profile.is_returning_student
  from public.profiles as profile
  where profile.id = private.current_profile_id();
$function$;

REVOKE ALL ON FUNCTION "public"."get_external_identity"() FROM PUBLIC, "anon", "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_external_identity"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."get_external_identity"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_external_identity"() TO "postgres";
