import { describe, expect, it } from "vitest";

import LinksPage from "~/routes/app/menu/links";
import { renderRoute, screen, within } from "../../../router";

function renderLinks() {
  return renderRoute(LinksPage, { path: "/menu/links" });
}

function linkGroups() {
  return within(screen.getByRole("navigation", { name: "링크 모음" }))
    .getAllByRole("list")
    .map((list) =>
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    );
}

describe("links route", () => {
  it("groups the services, then the Research Hub, then the school sites", () => {
    renderLinks();

    expect(linkGroups()).toEqual([
      [
        expect.stringContaining("큼온 위키"),
        expect.stringContaining("Minjok Herald"),
      ],
      [expect.stringContaining("KMLA Research Hub")],
      [
        expect.stringContaining("홈페이지"),
        expect.stringContaining("인트라넷"),
        expect.stringContaining("리로스쿨"),
      ],
    ]);
  });
  it.each([
    ["KMLA Research Hub", "https://minjok.net/paper/"],
    ["홈페이지", "https://www.minjok.hs.kr/"],
    ["인트라넷", "https://old.minjok.hs.kr/members/login.php"],
    ["리로스쿨", "https://minjok.riroschool.kr/"],
  ])("opens %s in a new tab", (label, href) => {
    renderLinks();

    const link = screen.getByRole("link", { name: `${label} (새 탭)` });
    expect(link).toHaveAttribute("href", href);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });
  it.each(["큼온 위키", "Minjok Herald"])(
    "shows %s as not yet available without a link",
    (label) => {
      renderLinks();

      const item = screen.getByText(label).closest("li");
      expect(item).toHaveAttribute("aria-disabled", "true");
      expect(within(item!).queryByRole("link")).not.toBeInTheDocument();
      expect(within(item!).getByText("준비 중")).toBeInTheDocument();
    },
  );
  it("titles the screen 링크 모음", () => {
    renderLinks();

    expect(
      screen.getAllByRole("heading", { name: "링크 모음" }).length,
    ).toBeGreaterThan(0);
  });
});
