import { useInfiniteQuery } from "@tanstack/react-query";
import type { RefObject } from "react";
import { Link, useNavigation } from "react-router";

import { StaffMark } from "~/features/posts";
import { memberGroupPostSearchQuery } from "~/features/search/data/cache";
import type { PostSearchResult } from "~/features/search/model/types";
import { RelativeTime } from "~/shared/components/relative-time";
import { SearchExcerpt } from "~/shared/components/search-excerpt";
import { useInfiniteScroll } from "~/shared/hooks/use-infinite-scroll";
import { cn } from "~/shared/lib/utils";
import { Button } from "~/shared/ui/button";
import { ListRowSkeleton } from "~/shared/ui/skeleton";
import { Spinner } from "~/shared/ui/spinner";

/** 전역 검색의 게시물 탭(기능 명세 §3.6). 가입한 그룹의 게시물을 최신순으로 20개씩 이어 받는다. */
export function PostSearchResults({
  query,
  scrollRef,
  onNavigate,
}: {
  query: string;
  /** 셸의 `<main>`이 아니라 검색 패널이 스크롤한다. 무한 스크롤은 이 상자의 바닥을 본다. */
  scrollRef: RefObject<HTMLElement | null>;
  /** 데스크톱 드롭다운은 패널만 닫고 검색어·탭·결과를 남긴다. */
  onNavigate?: () => void;
}) {
  const search = useInfiniteQuery(memberGroupPostSearchQuery(query));
  const navigation = useNavigation();
  // 상세 loader가 도는 동안 누른 행이 알린다. 모바일 검색 화면은 그 사이 그대로 떠 있다.
  const openingPath =
    navigation.state === "loading" ? navigation.location.pathname : null;
  const sentinelRef = useInfiniteScroll(() => void search.fetchNextPage(), {
    // 다음 페이지가 실패한 채 sentinel이 보이면 observer가 다시 걸릴 때마다 곧장 재요청한다. 재시도는 버튼이 맡는다.
    enabled: search.hasNextPage && !search.isFetchNextPageError,
    pending: search.isFetchingNextPage,
    root: scrollRef,
  });

  if (search.isPending) {
    return (
      <ListRowSkeleton
        label="검색 결과를"
        rows={3}
        className="p-2"
        rowClassName="px-2 py-2"
      />
    );
  }

  // 다음 페이지만 실패했으면 data가 남아 있다. 그때는 읽던 목록을 지우지 않는다.
  if (search.isError && !search.data) {
    return (
      <p role="alert" className="p-6 text-center text-sm text-destructive">
        검색 결과를 불러오지 못했습니다.
      </p>
    );
  }

  const results = search.data?.pages.flatMap((page) => page.results) ?? [];
  if (results.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        &ldquo;{query}&rdquo;에 대한 게시물이 없습니다.
      </p>
    );
  }

  return (
    <div className="p-2">
      <ul aria-label="게시물 검색 결과" className="flex flex-col gap-0.5">
        {results.map((post) => (
          <li key={post.postId}>
            <PostSearchRow
              post={post}
              query={query}
              opening={openingPath === post.path}
              onNavigate={onNavigate}
            />
          </li>
        ))}
      </ul>
      {search.isFetchNextPageError ? (
        <div className="flex flex-col items-center gap-2 py-3">
          <p role="alert" className="text-sm text-destructive">
            다음 결과를 불러오지 못했습니다.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void search.fetchNextPage()}
          >
            다시 시도
          </Button>
        </div>
      ) : search.hasNextPage ? (
        <div ref={sentinelRef} className="flex justify-center py-4">
          {search.isFetchingNextPage ? <Spinner /> : null}
        </div>
      ) : null}
    </div>
  );
}

function PostSearchRow({
  post,
  query,
  opening,
  onNavigate,
}: {
  post: PostSearchResult;
  query: string;
  opening: boolean;
  onNavigate?: () => void;
}) {
  return (
    // 그룹 밖에서 여는 상세라 `FROM_GROUP` state를 싣지 않는다. 그래야 상세가 그룹 링크를 보인다(§8.8).
    <Link
      to={post.path}
      onClick={onNavigate}
      aria-busy={opening || undefined}
      className={cn(
        "flex flex-col gap-0.5 rounded-md px-2 py-2 hover:bg-muted",
        opening && "bg-muted",
      )}
    >
      <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
        <span className="min-w-0 truncate font-medium text-foreground">
          {post.groupName}
        </span>
        <span aria-hidden="true">·</span>
        <span className="min-w-0 truncate">{post.authorName}</span>
        {post.staff ? <StaffMark className="size-3.5" /> : null}
        <span aria-hidden="true">·</span>
        <RelativeTime value={post.publishedAt} className="shrink-0" />
      </span>
      <span className="flex items-center gap-2">
        <span className="line-clamp-1 min-w-0 flex-1 text-sm font-medium [overflow-wrap:anywhere]">
          {post.title}
        </span>
        {opening ? <Spinner aria-label="여는 중" className="shrink-0" /> : null}
      </span>
      {/* 제목에서만 찾았으면 본문 앞부분을 그대로 보인다. */}
      <SearchExcerpt
        text={post.bodyText}
        term={query}
        className="text-muted-foreground"
      />
    </Link>
  );
}
