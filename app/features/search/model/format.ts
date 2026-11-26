import type { GlobalSearchTab } from "~/features/search/model/types";

export function normalizeSearchInput(value: string): string {
  return value.normalize("NFC").trim();
}

export function hasMinimumSearchLength(value: string): boolean {
  return Array.from(normalizeSearchInput(value)).length >= 2;
}

/** 주소의 탭 값. 사람·그룹이 기본 탭이라 주소에 두지 않으며, 모르는 값도 그 탭으로 읽는다. */
export function parseGlobalSearchTab(value: string | null): GlobalSearchTab {
  return value === "posts" ? "posts" : "directory";
}
