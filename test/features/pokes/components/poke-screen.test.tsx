import { screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReceivedPoke } from "~/features/pokes/model/types";
import { renderRoute } from "../../../router";

const mocks = vi.hoisted(() => ({ markMyPokesSeen: vi.fn() }));

vi.mock("~/features/pokes/data/mutations", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...mocks,
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
      <PokeScreen received={received} suggestions={[]} />
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
});
