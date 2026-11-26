import { describe, expect, it, vi } from "vitest";

vi.mock("~/features/search/data/queries", () => ({
  searchDirectory: vi.fn(),
  searchMemberGroupPosts: vi.fn(),
}));
vi.mock("~/features/search/hooks/use-recent-search-entries", () => ({
  useRecentSearchEntries: vi.fn().mockReturnValue([]),
}));

import { GlobalSearchDropdown } from "~/features/search/components/global-search-dropdown";
import {
  searchDirectory,
  searchMemberGroupPosts,
} from "~/features/search/data/queries";
import { renderRoute, screen, waitFor } from "../../../router";

describe("GlobalSearchDropdown", () => {
  it("stays closed until the input is focused", () => {
    renderRoute(() => <GlobalSearchDropdown />);
    expect(screen.queryByText("최근 항목")).not.toBeInTheDocument();
  });

  it("does not search until Enter, and rejects fewer than two characters", async () => {
    const { user } = renderRoute(() => <GlobalSearchDropdown />);
    const input = screen.getByRole("searchbox", {
      name: "사람 · 그룹 · 게시물 검색",
    });

    await user.click(input);
    await user.type(input, "김");
    expect(searchDirectory).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");
    expect(searchDirectory).not.toHaveBeenCalled();

    await user.type(input, "민");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(searchDirectory).toHaveBeenCalledWith("김민"));
  });

  it("closes on outside click", async () => {
    vi.mocked(searchDirectory).mockResolvedValue({ people: [], groups: [] });
    const { user } = renderRoute(() => (
      <div>
        <GlobalSearchDropdown />
        <button type="button">밖</button>
      </div>
    ));

    await user.click(
      screen.getByRole("searchbox", { name: "사람 · 그룹 · 게시물 검색" }),
    );
    expect(screen.getByText(/검색해 보세요/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "밖" }));
    expect(screen.queryByText(/검색해 보세요/)).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const { user } = renderRoute(() => <GlobalSearchDropdown />);
    const input = screen.getByRole("searchbox", {
      name: "사람 · 그룹 · 게시물 검색",
    });
    await user.click(input);
    expect(screen.getByText(/검색해 보세요/)).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByText(/검색해 보세요/)).not.toBeInTheDocument();
  });

  it("searches posts only on the posts tab and keeps them after opening one", async () => {
    vi.mocked(searchDirectory).mockResolvedValue({ people: [], groups: [] });
    vi.mocked(searchMemberGroupPosts).mockResolvedValue({
      results: [
        {
          postId: "post-1",
          path: "/groups/science/posts/post-1",
          groupName: "과학부",
          title: "축제 준비 회의",
          bodyText: "이번 축제 부스 배치를 정합니다",
          authorName: "김관리",
          staff: true,
          publishedAt: "2026-11-25T00:00:00Z",
        },
      ],
      nextCursor: null,
    });
    // 셸 헤더처럼 화면을 옮겨도 같은 드롭다운이 남게 모든 주소에 띄운다.
    const { user } = renderRoute(() => <GlobalSearchDropdown />, {
      path: "*",
      initialEntries: ["/"],
    });
    const input = screen.getByRole("searchbox", {
      name: "사람 · 그룹 · 게시물 검색",
    });

    await user.click(input);
    await user.type(input, "축제{Enter}");
    await waitFor(() => expect(searchDirectory).toHaveBeenCalledWith("축제"));
    expect(searchMemberGroupPosts).not.toHaveBeenCalled();

    await user.click(screen.getByRole("tab", { name: "게시물" }));
    expect(await screen.findByText("과학부")).toBeInTheDocument();
    expect(searchMemberGroupPosts).toHaveBeenCalledWith("축제", null);
    expect(
      screen.getByRole("img", { name: "운영진 명의" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: /축제 준비 회의/ }));
    expect(screen.queryByText("과학부")).not.toBeInTheDocument();

    await user.click(input);
    expect(screen.getByRole("tab", { name: "게시물" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("과학부")).toBeInTheDocument();
    expect(input).toHaveValue("축제");
  });
});
