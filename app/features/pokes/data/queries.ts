// 배럴(`~/features/profiles`)은 화면 컴포넌트를 전부 끌고 온다. 서명 헬퍼와 기수 표기만 필요하다.
import { createProfileMediaUrls } from "~/features/profiles/data/media";
import { formatCohort } from "~/features/profiles/model/format";
import type {
  PokePerson,
  PokeState,
  PokeSuggestionCursor,
  PokeSuggestionPage,
  ReceivedPoke,
} from "~/features/pokes/model/types";
import { getSupabase } from "~/shared/supabase/client";

interface PersonRow {
  profile_id: number;
  pub_id: string;
  name: string;
  avatar_path: string | null;
  cohort: number | null;
  is_returning_student: boolean;
}

/** 생성 타입은 RPC 열을 모두 non-null로 적지만 아바타와 기수는 실제로 비어 온다. */
async function signAvatars(rows: PersonRow[]) {
  const avatarUrls = await createProfileMediaUrls(
    rows.map((row) => row.avatar_path),
  );
  return (row: PersonRow): PokePerson => ({
    profileId: row.profile_id,
    pubId: row.pub_id,
    name: row.name,
    avatarUrl: row.avatar_path
      ? (avatarUrls.get(row.avatar_path) ?? null)
      : null,
    cohortLabel: formatCohort(row.cohort, row.is_returning_student),
  });
}

export async function listMyPokes(): Promise<ReceivedPoke[]> {
  const { data, error } = await getSupabase().rpc("list_my_pokes");
  if (error) throw error;
  const toPerson = await signAvatars(data);
  return data.map((row) => ({
    ...toPerson(row),
    pokedAt: row.poked_at,
    pokeCount: row.poke_count,
    strongCount: row.strong_count,
    lastStrong: row.last_strong,
    strongEffectPending: row.strong_effect_pending,
  }));
}

export const POKE_SUGGESTION_PAGE_SIZE = 20;

export async function listPokeSuggestions(
  cursor: PokeSuggestionCursor | null,
): Promise<PokeSuggestionPage> {
  const { data, error } = await getSupabase().rpc("list_poke_suggestions", {
    p_after_score: cursor?.score,
    p_after_id: cursor?.profileId,
    p_limit: POKE_SUGGESTION_PAGE_SIZE,
  });
  if (error) throw error;
  const last = data.at(-1);
  return {
    people: data.map(await signAvatars(data)),
    nextCursor:
      last && data.length === POKE_SUGGESTION_PAGE_SIZE
        ? { score: last.sort_score, profileId: last.profile_id }
        : null,
  };
}

export async function getPokeState(profileId: number): Promise<PokeState> {
  const { data, error } = await getSupabase().rpc("get_poke_state", {
    p_profile_id: profileId,
  });
  if (error) throw error;
  return { waiting: data[0]?.waiting ?? false };
}
