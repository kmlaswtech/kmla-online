import { describe, expect, it } from "vitest";

import LinksPage from "~/routes/app/menu/links";
import { renderRoute, screen, within } from "../../../router";

function renderLinks() {
  return renderRoute(LinksPage, { path: "/menu/links" });
}

function linkList() {
  return within(screen.getByRole("list", { name: "링크 모음" }));
}

describe("links route", () => {
  it("lists the Research Hub first, then the services not yet open", () => {
    renderLinks();

    expect(
      linkList()
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining("KMLA Research Hub"),
      expect.stringContaining("큼온 위키"),
      expect.stringContaining("KMLA News"),
    ]);
  });
  it("opens the Research Hub in a new tab", () => {
    renderLinks();

    const links = linkList().getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName("KMLA Research Hub (새 탭)");
    expect(links[0]).toHaveAttribute("href", "https://minjok.net/paper/");
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(links[0]).toHaveAttribute("rel", "noreferrer");
  });
  it.each(["큼온 위키", "KMLA News"])(
    "shows %s as not yet available without a link",
    (label) => {
      renderLinks();

      const item = linkList().getByText(label).closest("li");
      expect(item).toHaveAttribute("aria-disabled", "true");
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
