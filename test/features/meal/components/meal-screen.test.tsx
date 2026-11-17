import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MealScreen } from "~/features/meal/components/meal-screen";
import {
  getDefaultMeal,
  getKoreaDate,
  type MealDay,
} from "~/features/meal/data/neis";
import { renderRoute } from "../../../router";

const LEGEND = { name: "알레르기 유발 식품" };
const TOGGLE = { name: "알레르기 표시" };

function dayWith(items: MealDay["meals"][number]["items"]): MealDay {
  return {
    date: "20260826",
    unavailable: false,
    meals: [
      {
        code: "1",
        label: getDefaultMeal(),
        items,
        servings: "",
        calories: "",
        origin: [],
        nutrition: [],
      },
    ],
  };
}

function dish(name: string) {
  const item = screen
    .getAllByRole("listitem")
    .find((li) => li.textContent?.startsWith(name));
  if (!item) throw new Error(`no dish ${name}`);
  return item;
}

function renderMeal(day: MealDay) {
  return renderRoute(() => (
    <MealScreen initialDate={day.date} initialDay={day} />
  ));
}

const STEW_DAY = dayWith([
  { name: "돈육김치찌개", allergens: ["5", "9", "10"] },
  { name: "쌀밥", allergens: [] },
  { name: "우유", allergens: ["2"] },
]);

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("MealScreen allergens", () => {
  it("hides allergen info until the toggle is turned on", () => {
    renderMeal(STEW_DAY);

    expect(screen.getByRole("switch", TOGGLE)).not.toBeChecked();
    expect(dish("돈육김치찌개")).toHaveTextContent(/^돈육김치찌개$/);
    expect(screen.queryByRole("list", LEGEND)).not.toBeInTheDocument();
  });

  it("shows allergen numbers per dish and a legend when turned on", async () => {
    renderMeal(STEW_DAY);
    await userEvent.click(screen.getByRole("switch", TOGGLE));

    const stew = dish("돈육김치찌개");
    expect(within(stew).getByText("5·9·10")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    // 번호는 화면용이고 보조기기에는 이름을 읽힌다.
    expect(stew).toHaveTextContent("알레르기: 대두, 새우, 돼지고기");
    expect(dish("쌀밥")).toHaveTextContent(/^쌀밥$/);

    const legend = screen.getByRole("list", LEGEND);
    expect(
      within(legend)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["2 우유", "5 대두", "9 새우", "10 돼지고기"]);
  });

  it("remembers the toggle on this device", async () => {
    const { unmount } = renderMeal(STEW_DAY);
    await userEvent.click(screen.getByRole("switch", TOGGLE));
    unmount();

    renderMeal(STEW_DAY);

    expect(await screen.findByRole("list", LEGEND)).toBeVisible();
  });

  it("omits the legend when no dish lists allergens", async () => {
    renderMeal(dayWith([{ name: "쌀밥", allergens: [] }]));
    await userEvent.click(screen.getByRole("switch", TOGGLE));

    expect(screen.queryByRole("list", LEGEND)).not.toBeInTheDocument();
  });
});

describe("MealScreen weeks", () => {
  /** NEIS가 날짜마다 그 날짜 이름의 메뉴 하나를 돌려주는 것처럼 꾸민다. */
  function stubNeis() {
    const fetchMock = vi.fn((url: string) => {
      const date = new URL(url).searchParams.get("MLSV_YMD") ?? "";
      return Promise.resolve(
        Response.json({
          mealServiceDietInfo: [
            { head: [] },
            {
              row: [
                {
                  MMEAL_SC_CODE: "1",
                  MLSV_YMD: date,
                  DDISH_NM: `${date} 메뉴`,
                },
              ],
            },
          ],
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  function renderWeek(initialDate: string) {
    const day: MealDay = { date: initialDate, unavailable: false, meals: [] };
    return renderRoute(() => (
      <MealScreen initialDate={initialDate} initialDay={day} />
    ));
  }

  const pressed = (name: string) =>
    expect(screen.getByRole("button", { name })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

  it("moves one week back and one week forward, keeping the weekday", async () => {
    const fetchMock = stubNeis();
    const { user } = renderWeek("20261118");
    pressed("11월 18일 수요일");

    await user.click(screen.getByRole("button", { name: "이전 주" }));
    pressed("11월 11일 수요일");
    expect(
      screen.queryByRole("button", { name: "11월 18일 수요일" }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("MLSV_YMD=20261111"),
    );
    // 지난주까지만 볼 수 있다.
    expect(screen.getByRole("button", { name: "이전 주" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "다음 주" }));
    await user.click(screen.getByRole("button", { name: "다음 주" }));
    pressed("11월 25일 수요일");
    // 다음 주까지만 볼 수 있다.
    expect(screen.getByRole("button", { name: "다음 주" })).toBeDisabled();
  });

  it("marks today in the date strip", () => {
    stubNeis();
    const today = getKoreaDate();
    renderWeek(today);

    expect(screen.getByRole("button", { current: "date" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("crosses a month boundary", async () => {
    stubNeis();
    const { user } = renderWeek("20261202");

    await user.click(screen.getByRole("button", { name: "이전 주" }));
    pressed("11월 25일 수요일");
  });
});
