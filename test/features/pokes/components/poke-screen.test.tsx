import { screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReceivedPoke } from "~/features/pokes/model/types";
import { renderRoute } from "../../../router";

const mocks = vi.hoisted(() => ({
  markMyPokesSeen: vi.fn(),
  listPokeSuggestions: vi.fn(),
}));

vi.mock("~/features/pokes/data/mutations", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  markMyPokesSeen: mocks.markMyPokesSeen,
}));
vi.mock("~/features/pokes/data/queries", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listPokeSuggestions: mocks.listPokeSuggestions,
}));

import { PokeScreen } from "~/features/pokes/components/poke-screen";

function receivedPoke(overrides: Partial<ReceivedPoke>): ReceivedPoke {
  return {
    profileId: 1,
    pubId: "kim",
    name: "김철수",
    avatarUrl: null,
    cohortLabel: null,
    pokedAt: "2026-11-20T00:00:00.000Z",
    pokeCount: 1,
    strongCount: 0,
    lastStrong: false,
    strongEffectPending: false,
    ...overrides,
  };
}

/** `재검증`을 누르면 loader 재검증처럼 받은 목록을 `next`로 바꿔 넣는다. */
function Harness({ next }: { next: ReceivedPoke[] }) {
  const [received, setReceived] = useState<ReceivedPoke[]>([receivedPoke({})]);
  return (
    <>
      <button type="button" onClick={() => setReceived(next)}>
        재검증
      </button>
      <PokeScreen received={received} />
    </>
  );
}

const strongPoke = receivedPoke({
  profileId: 2,
  pubId: "lee",
  name: "이영희",
  pokedAt: "2026-11-24T00:00:00.000Z",
  strongCount: 1,
  lastStrong: true,
  strongEffectPending: true,
});

describe("PokeScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.markMyPokesSeen.mockResolvedValue(undefined);
    mocks.listPokeSuggestions.mockResolvedValue({
      people: [],
      nextCursor: null,
    });
    Element.prototype.animate = vi.fn(
      () => ({ cancel: () => undefined }) as unknown as Animation,
    );
  });

  it("reads and shows a strong poke that arrives while the screen is open", async () => {
    const { user } = renderRoute(() => (
      <Harness next={[strongPoke, receivedPoke({})]} />
    ));
    await waitFor(() => expect(mocks.markMyPokesSeen).toHaveBeenCalledOnce());

    await user.click(await screen.findByRole("button", { name: "재검증" }));

    expect(
      await screen.findByText("이영희님이 회원님을 푹 찔렀습니다!"),
    ).toBeInTheDocument();
    await waitFor(() => expect(mocks.markMyPokesSeen).toHaveBeenCalledTimes(2));
  });

  it("does not read again when a revalidation brings nothing new", async () => {
    const { user } = renderRoute(() => <Harness next={[receivedPoke({})]} />);
    await waitFor(() => expect(mocks.markMyPokesSeen).toHaveBeenCalledOnce());

    await user.click(await screen.findByRole("button", { name: "재검증" }));

    expect(mocks.markMyPokesSeen).toHaveBeenCalledOnce();
  });

  it("leaves out the received section when nobody is waiting on me", () => {
    renderRoute(() => <PokeScreen received={[]} />);

    expect(
      screen.queryByRole("region", { name: "받은 콕 찌르기" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("지금 되찌를 사람이 없어요."),
    ).not.toBeInTheDocument();
  });

  it("does not suggest someone who is already waiting in the received list", async () => {
    mocks.listPokeSuggestions.mockResolvedValue({
      people: [
        {
          profileId: 1,
          pubId: "kim",
          name: "김철수",
          avatarUrl: null,
          cohortLabel: null,
        },
        {
          profileId: 3,
          pubId: "park",
          name: "박민수",
          avatarUrl: null,
          cohortLabel: null,
        },
      ],
      nextCursor: null,
    });
    renderRoute(() => <PokeScreen received={[receivedPoke({})]} />);

    const suggestions = await screen.findByRole("region", { name: "추천" });
    expect(within(suggestions).getByText("박민수")).toBeInTheDocument();
    expect(within(suggestions).queryByText("김철수")).not.toBeInTheDocument();
  });
});
