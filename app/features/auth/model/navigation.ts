import type { AuthProfile } from "~/features/auth/model/types";

/** 연계 서비스(OAuth) 동의 화면. `supabase/config.toml`의 `authorization_url_path`와 같아야 한다. */
export const OAUTH_CONSENT_PATH = "/oauth/consent";

export function sanitizeLoginNext(value: string | null): string | null {
  if (!value?.startsWith("/") || value.startsWith("//")) return null;

  try {
    const url = new URL(value, "https://kmla.online");
    if (url.origin !== "https://kmla.online") return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function isOAuthConsentPath(path: string): boolean {
  return new URL(path, "https://kmla.online").pathname === OAUTH_CONSENT_PATH;
}

export function getProfileDestination(
  profile: AuthProfile | null,
  next?: string | null,
): string {
  const safeNext = sanitizeLoginNext(next ?? null);
  // 동의 화면은 승인 대기·가입 차단 회원에게도 안내와 거부를 보여 줘야 연계 서비스가 결과를 받는다.
  // 가입을 마치지 않았으면 거부한 뒤 가입을 이어 갈 길이 없으므로 학교 프로필 설정이 먼저다.
  // 그 밖의 경로는 승인 회원만 돌려보낸다.
  if (
    safeNext &&
    isOAuthConsentPath(safeNext) &&
    (profile?.status === "pending" ||
      profile?.status === "blocked" ||
      profile?.status === "accepted")
  ) {
    return safeNext;
  }
  if (!profile || profile.status === "draft") return "/setup";
  if (profile.status === "pending") return "/pending";
  if (profile.status === "blocked") return "/blocked";
  if (profile.status === "accepted") return safeNext ?? "/";
  return "/login";
}
