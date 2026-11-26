import { useRef, type ReactNode } from "react";

import { PostSearchResults } from "~/features/search/components/post-search-results";
import type { GlobalSearchTab } from "~/features/search/model/types";
import { cn } from "~/shared/lib/utils";

const TABS: { value: GlobalSearchTab; label: string }[] = [
  { value: "directory", label: "사람·그룹" },
  { value: "posts", label: "게시물" },
];

/**
 * 전역 검색 결과 영역(기능 명세 §3.6). 검색어를 제출하면 `사람·그룹 | 게시물` 탭을 두고,
 * 제출 전에는 탭 없이 `directory`(최근 항목)만 보인다. 모바일 시트와 데스크톱 드롭다운이 함께 쓴다.
 */
export function GlobalSearchResults({
  query,
  tab,
  onTabChange,
  directory,
  onPostNavigate,
}: {
  query: string;
  tab: GlobalSearchTab;
  onTabChange: (tab: GlobalSearchTab) => void;
  /** 사람·그룹 결과(제출 전에는 최근 항목). 부모가 조회 상태를 가진다. */
  directory: ReactNode;
  onPostNavigate?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const current = TABS.find((item) => item.value === tab);

  return (
    <>
      {query ? (
        <div
          role="tablist"
          aria-label="검색 결과 종류"
          className="flex shrink-0 border-b"
        >
          {TABS.map((item) => {
            const selected = item.value === tab;
            return (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onTabChange(item.value)}
                className={cn(
                  "flex-1 border-b-2 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                  selected
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
      <div
        ref={scrollRef}
        role={query ? "tabpanel" : undefined}
        aria-label={query ? current?.label : undefined}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {query && tab === "posts" ? (
          <PostSearchResults
            query={query}
            scrollRef={scrollRef}
            onNavigate={onPostNavigate}
          />
        ) : (
          directory
        )}
      </div>
    </>
  );
}
