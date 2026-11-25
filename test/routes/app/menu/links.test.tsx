import { describe, expect, it } from "vitest";

import LinksPage from "~/routes/app/menu/links";
import { renderRoute, screen, within } from "../../../router";

function renderLinks() {
  return renderRoute(LinksPage, { path: "/menu/links" });
}

describe("links route", () => {
  it("lists the wiki and Research Hub as new-tab links in order", () => {
    renderLinks();

    const list = within(screen.getByRole("list", { name: "링크 모음" }));
    expect(
      list.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining("큼온 위키"),
      expect.stringContaining("KMLA Research Hub"),
      expect.stringContaining("KMLA News"),
    ]);
    for (const [name, href] of [
      ["큼온 위키", "https://wiki.kmla.online/"],
      ["KMLA Research Hub", "https://minjok.net/paper/"],
    ]) {
      const link = list.getByRole("link", { name: `${name} (새 탭)` });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noreferrer");
    }
  });
  it("shows KMLA News as not yet available without a link", () => {
    renderLinks();

    const list = within(screen.getByRole("list", { name: "링크 모음" }));
    expect(list.getAllByRole("link")).toHaveLength(2);
    const news = list.getByText("KMLA News").closest("li");
    expect(news).toHaveAttribute("aria-disabled", "true");
    expect(within(news!).getByText("준비 중")).toBeInTheDocument();
  });
  it("titles the screen 링크 모음", () => {
    renderLinks();

    expect(
      screen.getAllByRole("heading", { name: "링크 모음" }).length,
    ).toBeGreaterThan(0);
  });
});
