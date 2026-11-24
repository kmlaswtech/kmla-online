import { data } from "react-router";

import { defineAppChrome, PageHeader } from "~/features/app-shell";
import {
  listMyPokes,
  pokeProfile,
  PokeScreen,
  pokeSuggestionsQuery,
} from "~/features/pokes";
import { getQueryClient } from "~/shared/lib/query-client";

import type { Route } from "./+types/pokes";

export const handle = defineAppChrome({
  header: "sticky",
  bottomNav: "none",
  contentWidth: "3xl",
});

/** 받은 콕 찌르기와 추천 첫 페이지는 서로 기다리지 않는다. 찌른 뒤 재검증은 받은 목록만 다시 읽는다. */
export async function clientLoader() {
  // 추천 첫 페이지는 쿼리 캐시에 채워 두고, 화면이 같은 캐시에서 다음 페이지를 이어 읽는다.
  const [received] = await Promise.all([
    listMyPokes(),
    getQueryClient().ensureInfiniteQueryData(pokeSuggestionsQuery()),
  ]);
  return { received };
}

export async function clientAction({ request }: Route.ClientActionArgs) {
  const formData = await request.formData();
  const rawProfileId = formData.get("profileId");
  const profileId =
    typeof rawProfileId === "string" && /^[1-9][0-9]*$/.test(rawProfileId)
      ? Number(rawProfileId)
      : null;
  if (
    formData.get("intent") !== "poke" ||
    profileId === null ||
    !Number.isSafeInteger(profileId)
  ) {
    return data({ error: "지원하지 않는 요청입니다." }, { status: 400 });
  }

  try {
    const result = await pokeProfile(profileId);
    return { poked: result.poked, strong: result.strong, profileId };
  } catch (error) {
    console.error("Failed to poke", error);
    return data({ error: "콕 찌르지 못했습니다." }, { status: 503 });
  }
}

export default function PokesPage({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <PageHeader title="콕 찌르기" back />
      <PokeScreen received={loaderData.received} />
    </>
  );
}
