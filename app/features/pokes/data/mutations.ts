import type { PokeResult } from "~/features/pokes/model/types";
import { getSupabase } from "~/shared/supabase/client";

/** 찌르기. 내가 마지막으로 찔렀으면 서버가 세지 않고 `poked: false`를 돌려준다. 푹 찌르기는 서버가 정한다. */
export async function pokeProfile(profileId: number): Promise<PokeResult> {
  const { data, error } = await getSupabase().rpc("poke_profile", {
    p_profile_id: profileId,
  });
  if (error) throw error;
  const result = data[0];
  if (!result) throw new Error("Poke result is unavailable");
  return {
    poked: result.poked,
    strong: result.strong,
    pokeCount: result.poke_count,
  };
}

/** 콕 찌르기 화면이 뜰 때 한 번. 알림을 읽고 보여 준 푹 찌르기 효과를 지운다. */
export async function markMyPokesSeen(): Promise<void> {
  const { error } = await getSupabase().rpc("mark_my_pokes_seen");
  if (error) throw error;
}
