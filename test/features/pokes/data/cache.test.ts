import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { pokeKeys, resetPokeSuggestions } from "~/features/pokes/data/cache";

describe("resetPokeSuggestions", () => {
  it("drops the stacked suggestion pages so a refresh starts from the first page", async () => {
    const client = new QueryClient();
    client.setQueryData(pokeKeys.suggestions(), {
      pages: [
        { people: [], nextCursor: { score: 0.5, profileId: 7 } },
        { people: [], nextCursor: null },
      ],
      pageParams: [null, { score: 0.5, profileId: 7 }],
    });

    await resetPokeSuggestions(client);

    expect(client.getQueryData(pokeKeys.suggestions())).toBeUndefined();
  });
});
