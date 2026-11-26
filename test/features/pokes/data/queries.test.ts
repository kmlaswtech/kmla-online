import { beforeEach, describe, expect, it, vi } from "vitest";

const { createProfileMediaUrls, getSupabase } = vi.hoisted(() => ({
  createProfileMediaUrls: vi.fn(),
  getSupabase: vi.fn(),
}));

vi.mock("~/features/profiles/data/media", () => ({ createProfileMediaUrls }));
vi.mock("~/shared/supabase/client", () => ({ getSupabase }));

import {
  listPokeSuggestions,
  POKE_SUGGESTION_PAGE_SIZE,
} from "~/features/pokes/data/queries";

function row(id: number, score: number) {
  return {
    profile_id: id,
    pub_id: `member-${id}`,
    name: `회원${id}`,
    avatar_path: null,
    cohort: 30,
    is_returning_student: false,
    sort_score: score,
  };
}

describe("listPokeSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createProfileMediaUrls.mockResolvedValue(new Map());
  });

  it("continues from the last person of a full page", async () => {
    const rows = Array.from({ length: POKE_SUGGESTION_PAGE_SIZE }, (_, index) =>
      row(index + 1, index / 100),
    );
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
    getSupabase.mockReturnValue({ rpc });

    const page = await listPokeSuggestions({ score: 0.5, profileId: 7 });

    expect(rpc).toHaveBeenCalledWith("list_poke_suggestions", {
      p_after_score: 0.5,
      p_after_id: 7,
      p_limit: POKE_SUGGESTION_PAGE_SIZE,
    });
    expect(page.people[0]).toEqual({
      profileId: 1,
      pubId: "member-1",
      name: "회원1",
      avatarUrl: null,
      cohortLabel: "30기",
    });
    expect(page.nextCursor).toEqual({
      score: (POKE_SUGGESTION_PAGE_SIZE - 1) / 100,
      profileId: POKE_SUGGESTION_PAGE_SIZE,
    });
  });

  it("starts from the top and stops after a short page", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [row(3, 0.2)], error: null });
    getSupabase.mockReturnValue({ rpc });

    const page = await listPokeSuggestions(null);

    expect(rpc).toHaveBeenCalledWith("list_poke_suggestions", {
      p_after_score: undefined,
      p_after_id: undefined,
      p_limit: POKE_SUGGESTION_PAGE_SIZE,
    });
    expect(page.nextCursor).toBeNull();
  });
});
