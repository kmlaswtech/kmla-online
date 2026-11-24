import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listMyPokes: vi.fn(),
  listPokeSuggestions: vi.fn(),
  pokeProfile: vi.fn(),
}));

vi.mock("~/features/pokes", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...mocks,
}));
// 추천 첫 페이지는 쿼리 캐시가 데이터 함수를 직접 부른다.
vi.mock("~/features/pokes/data/queries", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listPokeSuggestions: mocks.listPokeSuggestions,
}));

import { resetQueryClientForTests } from "~/shared/lib/query-client";
import { clientAction, clientLoader } from "~/routes/app/pokes";

function submit(fields: Record<string, string>) {
  return clientAction({
    request: new Request("https://example.com/pokes", {
      method: "POST",
      body: new URLSearchParams(fields),
    }),
  } as never);
}

describe("pokes route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetQueryClientForTests();
    mocks.listMyPokes.mockResolvedValue([]);
    mocks.listPokeSuggestions.mockResolvedValue({
      people: [],
      nextCursor: null,
    });
  });

  it("loads received pokes and the first suggestion page together", async () => {
    let releaseSuggestions = () => undefined as void;
    mocks.listPokeSuggestions.mockReturnValue(
      new Promise((resolve) => {
        releaseSuggestions = () => resolve({ people: [], nextCursor: null });
      }),
    );
    const loading = clientLoader();
    // 받은 목록을 기다리는 동안 추천 첫 페이지도 이미 나가 있다.
    expect(mocks.listMyPokes).toHaveBeenCalledOnce();
    await vi.waitFor(() =>
      expect(mocks.listPokeSuggestions).toHaveBeenCalledWith(null),
    );
    releaseSuggestions();
    await expect(loading).resolves.toEqual({ received: [] });
  });

  it("pokes a member and reports whether it turned into a strong poke", async () => {
    mocks.pokeProfile.mockResolvedValue({
      poked: true,
      strong: true,
    });

    await expect(submit({ intent: "poke", profileId: "42" })).resolves.toEqual({
      poked: true,
      strong: true,
      profileId: 42,
    });
    expect(mocks.pokeProfile).toHaveBeenCalledWith(42);
  });

  it("rejects a malformed member id without calling the server", async () => {
    const result = await submit({ intent: "poke", profileId: "abc" });
    expect(result).toMatchObject({ init: { status: 400 } });
    expect(mocks.pokeProfile).not.toHaveBeenCalled();
  });

  it("rejects a member id too large to send exactly", async () => {
    // 2^53 + 1은 Number로 바꾸면 2^53이 되어 다른 회원을 가리킨다.
    const result = await submit({
      intent: "poke",
      profileId: "9007199254740993",
    });
    expect(result).toMatchObject({ init: { status: 400 } });
    expect(mocks.pokeProfile).not.toHaveBeenCalled();
  });

  it("explains a failed poke", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.pokeProfile.mockRejectedValue(new Error("offline"));

    const result = await submit({ intent: "poke", profileId: "42" });
    expect(result).toMatchObject({
      data: { error: "콕 찌르지 못했습니다." },
      init: { status: 503 },
    });
  });
});
