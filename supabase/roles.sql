-- 클러스터 역할. 선언형 스키마(`schemas/`)는 역할을 관리하지 않으므로 로컬 DB와 shadow DB는 이 파일로 만든다.
-- 원격에는 같은 역할을 만드는 migration이 있다(`*_oauth_token_role.sql`). 다시 실행해도 안전해야 한다.

-- 연계 서비스용 OAuth 액세스 토큰의 DB 역할(`schemas/12-authorization.sql`).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oauth_member_check') THEN
    CREATE ROLE oauth_member_check NOLOGIN NOINHERIT;
  END IF;
END
$$;

GRANT oauth_member_check TO authenticator;
