import { data } from "react-router";

import { defineAppChrome, PageHeader } from "~/features/app-shell";
import {
  listMyPokes,
  listPokeSuggestions,
  pokeProfile,
  PokeScreen,
} from "~/features/pokes";

import type { Route } from "./+types/pokes";

export const handle = defineAppChrome({
  header: "sticky",
  bottomNav: "none",
  contentWidth: "3xl",
});

/** 받은 콕 찌르기와 추천은 서로 기다리지 않는다. 찌른 뒤 재검증이 두 목록을 함께 고친다. */
export async function clientLoader() {
  const [received, suggestions] = await Promise.all([
    listMyPokes(),
    listPokeSuggestions(),
  ]);
  return { received, suggestions };
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
      <PokeScreen
        received={loaderData.received}
        suggestions={loaderData.suggestions}
      />
    </>
  );
}
