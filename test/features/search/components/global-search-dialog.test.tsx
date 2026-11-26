import { act } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { useNavigate, useSearchParams } from "react-router";

vi.mock("~/features/search/data/queries", () => ({
  searchDirectory: vi.fn().mockResolvedValue({ people: [], groups: [] }),
  searchMemberGroupPosts: vi.fn().mockResolvedValue({
    results: [
      {
        postId: "post-1",
        path: "/groups/science/posts/post-1",
        groupName: "과학부",
        title: "축제 준비 회의",
        bodyText: "본문",
        authorName: "김관리",
        staff: false,
        publishedAt: "2026-11-25T00:00:00Z",
      },
    ],
    nextCursor: null,
  }),
}));
vi.mock("~/features/search/hooks/use-recent-search-entries", () => ({
  useRecentSearchEntries: vi.fn().mockReturnValue([]),
}));

import { GlobalSearchDialog } from "~/features/search/components/global-search-dialog";
import {
  searchDirectory,
  searchMemberGroupPosts,
} from "~/features/search/data/queries";
import { useSearchDialogParam } from "~/shared/hooks/use-search-dialog-param";
import { renderRoute, screen, waitFor } from "../../../router";

let goBack: () => void = () => {
  throw new Error("HomeRoute가 아직 mount되지 않았다.");
};

function HomeRoute() {
  const [searchParams] = useSearchParams();
  const { openSearch } = useSearchDialogParam();
  const navigate = useNavigate();

  useEffect(() => {
    goBack = () => void navigate(-1);
  }, [navigate]);

  return (
    <>
      <output data-testid="search-open">
        {searchParams.get("search") ?? ""}
      </output>
      <output data-testid="search-tab">
        {searchParams.get("searchTab") ?? ""}
      </output>
      <button type="button" onClick={openSearch}>
        검색 열기
      </button>
      <GlobalSearchDialog />
    </>
  );
}

function renderHome(entry = "/") {
  return renderRoute(HomeRoute, { path: "/", initialEntries: [entry] });
}

describe("GlobalSearchDialog", () => {
  it("opens full screen and searches only after Enter", async () => {
    const { user } = renderHome();
    await user.click(screen.getByRole("button", { name: "검색 열기" }));

    const input = await screen.findByRole("searchbox", {
      name: "사람 · 그룹 · 게시물 검색어",
    });
    await user.type(input, "김민");
    expect(searchDirectory).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");
    await waitFor(() => expect(searchDirectory).toHaveBeenCalledWith("김민"));
  });

  it("closes on the back button instead of leaving home", async () => {
    const { user } = renderHome();
    await user.click(screen.getByRole("button", { name: "검색 열기" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    act(() => {
      goBack();
    });

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("search-open")).toBeEmptyDOMElement();
  });

  it("closes with the X button", async () => {
    const { user } = renderHome();
    await user.click(screen.getByRole("button", { name: "검색 열기" }));
    await user.click(await screen.findByRole("button", { name: "검색 닫기" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("keeps the posts tab in the address so returning restores it", async () => {
    const { user } = renderHome();
    await user.click(screen.getByRole("button", { name: "검색 열기" }));
    const input = await screen.findByRole("searchbox", {
      name: "사람 · 그룹 · 게시물 검색어",
    });
    await user.type(input, "축제{Enter}");

    await user.click(await screen.findByRole("tab", { name: "게시물" }));
    expect(await screen.findByText("과학부")).toBeInTheDocument();
    expect(searchMemberGroupPosts).toHaveBeenCalledWith("축제", null);
    expect(screen.getByTestId("search-tab")).toHaveTextContent("posts");
    expect(
      screen.getByRole("link", { name: /축제 준비 회의/ }),
    ).toHaveAttribute("href", "/groups/science/posts/post-1");

    // 새 검색어를 내도 보던 탭을 유지한다.
    await user.clear(input);
    await user.type(input, "축제 준비{Enter}");
    await waitFor(() =>
      expect(searchMemberGroupPosts).toHaveBeenCalledWith("축제 준비", null),
    );
    expect(screen.getByRole("tab", { name: "게시물" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("starts on the people and groups tab", async () => {
    renderHome("/?search=1&q=%EC%B6%95%EC%A0%9C");
    expect(
      await screen.findByRole("tab", { name: "사람·그룹" }),
    ).toHaveAttribute("aria-selected", "true");
  });
});
