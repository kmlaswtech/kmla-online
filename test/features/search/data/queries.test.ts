import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/shared/supabase/client", () => ({
  getSupabase: vi.fn(),
}));
vi.mock("~/features/profiles/data/media", () => ({
  createProfileMediaUrls: vi.fn(),
}));
vi.mock("~/features/groups/data/files", () => ({
  createGroupMediaUrls: vi.fn(),
}));

import { createGroupMediaUrls } from "~/features/groups/data/files";
import { createProfileMediaUrls } from "~/features/profiles/data/media";
import {
  resolveRecentSearchEntryUrls,
  searchDirectory,
  searchMemberGroupPosts,
} from "~/features/search/data/queries";
import { getSupabase } from "~/shared/supabase/client";

describe("searchDirectory", () => {
  beforeEach(() => {
    vi.mocked(createProfileMediaUrls).mockResolvedValue(new Map());
    vi.mocked(createGroupMediaUrls).mockResolvedValue(new Map());
  });

  it("buckets rows by kind and resolves avatars from the matching bucket", async () => {
    vi.mocked(getSupabase).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            result_kind: "profile",
            result_id: "person-1",
            result_name: "김민준",
            avatar_path: "avatar/path-1",
            sort_rank: 0,
          },
          {
            result_kind: "group",
            result_id: "group-1",
            result_name: "화학 스터디",
            avatar_path: "icon/path-1",
            sort_rank: 1,
          },
        ],
        error: null,
      }),
    } as never);
    vi.mocked(createProfileMediaUrls).mockResolvedValue(
      new Map([["avatar/path-1", "https://signed/avatar-1"]]),
    );
    vi.mocked(createGroupMediaUrls).mockResolvedValue(
      new Map([["icon/path-1", "https://signed/icon-1"]]),
    );

    const result = await searchDirectory("김민");

    expect(result.people).toEqual([
      {
        kind: "profile",
        id: "person-1",
        name: "김민준",
        avatarPath: "avatar/path-1",
        avatarUrl: "https://signed/avatar-1",
      },
    ]);
    expect(result.groups).toEqual([
      {
        kind: "group",
        id: "group-1",
        name: "화학 스터디",
        avatarPath: "icon/path-1",
        avatarUrl: "https://signed/icon-1",
      },
    ]);
    expect(createProfileMediaUrls).toHaveBeenCalledWith(["avatar/path-1"]);
    expect(createGroupMediaUrls).toHaveBeenCalledWith(["icon/path-1"]);
  });

  it("throws on an RPC error", async () => {
    vi.mocked(getSupabase).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("boom") }),
    } as never);

    await expect(searchDirectory("김민")).rejects.toThrow("boom");
  });
});

describe("resolveRecentSearchEntryUrls", () => {
  beforeEach(() => {
    vi.mocked(createProfileMediaUrls).mockResolvedValue(new Map());
    vi.mocked(createGroupMediaUrls).mockResolvedValue(new Map());
  });

  it("resolves each entry through the bucket matching its kind", async () => {
    vi.mocked(createProfileMediaUrls).mockResolvedValue(
      new Map([["avatar/1", "https://signed/avatar-1"]]),
    );
    vi.mocked(createGroupMediaUrls).mockResolvedValue(
      new Map([["icon/1", "https://signed/icon-1"]]),
    );

    const urls = await resolveRecentSearchEntryUrls([
      { kind: "profile", id: "p1", name: "김민준", avatarPath: "avatar/1" },
      { kind: "group", id: "g1", name: "화학 스터디", avatarPath: "icon/1" },
      { kind: "profile", id: "p2", name: "이서연", avatarPath: null },
    ]);

    expect(urls.get("profile:avatar/1")).toBe("https://signed/avatar-1");
    expect(urls.get("group:icon/1")).toBe("https://signed/icon-1");
    expect(createProfileMediaUrls).toHaveBeenCalledWith(["avatar/1", null]);
    expect(createGroupMediaUrls).toHaveBeenCalledWith(["icon/1"]);
  });
});

describe("searchMemberGroupPosts", () => {
  const row = (index: number, identity = "identified") => ({
    post_id: `post-${index}`,
    group_slug: "science",
    group_name: "과학부",
    title: `제목 ${index}`,
    body: "**굵은** 본문",
    author_name: identity === "anonymous" ? "익명" : "김관리",
    is_staff: identity === "staff",
    published_at: `2026-11-${String(26 - (index % 20)).padStart(2, "0")}T00:00:00Z`,
  });

  it("maps rows and continues only after a full page", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: Array.from({ length: 20 }, (_, index) => row(index)),
        error: null,
      })
      .mockResolvedValueOnce({ data: [row(20, "anonymous")], error: null });
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never);

    const first = await searchMemberGroupPosts("과학", null);
    expect(rpc).toHaveBeenLastCalledWith("search_member_group_posts", {
      p_query: "과학",
      p_limit: 20,
    });
    expect(first.results[0]).toEqual({
      postId: "post-0",
      path: "/groups/science/posts/post-0",
      groupName: "과학부",
      title: "제목 0",
      bodyText: "굵은 본문",
      authorName: "김관리",
      staff: false,
      publishedAt: row(0).published_at,
    });
    expect(first.nextCursor).toEqual({
      publishedAt: row(19).published_at,
      postId: "post-19",
    });

    const second = await searchMemberGroupPosts("과학", first.nextCursor);
    expect(rpc).toHaveBeenLastCalledWith("search_member_group_posts", {
      p_query: "과학",
      p_limit: 20,
      p_cursor_published_at: row(19).published_at,
      p_cursor_post_id: "post-19",
    });
    expect(second.results[0]?.authorName).toBe("익명");
    expect(second.nextCursor).toBeNull();
  });

  it("marks staff posts so the row can show the staff mark", async () => {
    vi.mocked(getSupabase).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: [row(0, "staff")], error: null }),
    } as never);

    const page = await searchMemberGroupPosts("과학", null);
    expect(page.results[0]).toMatchObject({
      authorName: "김관리",
      staff: true,
    });
  });
});
