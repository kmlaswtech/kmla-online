import { infiniteQueryOptions, type QueryClient } from "@tanstack/react-query";

import { listPokeSuggestions } from "~/features/pokes/data/queries";
import type { PokeSuggestionCursor } from "~/features/pokes/model/types";

export const pokeKeys = {
  states: () => ["pokes", "state"] as const,
  state: (profileId: number) => ["pokes", "state", profileId] as const,
  suggestions: () => ["pokes", "suggestions"] as const,
};

/**
 * 추천은 하루 동안 순서가 고정되므로 잠깐 신선하다고 본다. 리페치는 쌓인 페이지를 전부 다시 읽으므로 찌르기나 알림
 * 신호로 무효화하지 않는다. 방금 찌른 사람은 화면이 `콕 찔렀어요`로 남기고, 받은 목록에 들어온 사람은 화면이 뺀다.
 */
const SUGGESTION_STALE_TIME = 5 * 60 * 1000;

export function pokeSuggestionsQuery() {
  return infiniteQueryOptions({
    queryKey: pokeKeys.suggestions(),
    queryFn: ({ pageParam }) => listPokeSuggestions(pageParam),
    initialPageParam: null as PokeSuggestionCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: SUGGESTION_STALE_TIME,
  });
}

/**
 * 당겨서 새로고침은 쌓인 추천 페이지를 다시 읽지 않고 첫 페이지부터 새로 시작한다. 무효화는 쌓인 페이지를 전부 다시
 * 읽는다.
 */
export function resetPokeSuggestions(queryClient: QueryClient) {
  return queryClient.resetQueries({ queryKey: pokeKeys.suggestions() });
}
