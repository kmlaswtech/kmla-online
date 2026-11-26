import { searchExcerpt } from "~/shared/lib/search-excerpt";
import { cn } from "~/shared/lib/utils";

/** 검색 결과 본문 두 줄. 찾은 말을 굵게 표시하고, 뒤쪽에서 찾았으면 앞을 줄여 두 줄 안에 보이게 한다. */
export function SearchExcerpt({
  text,
  term,
  className,
}: {
  text: string;
  term: string;
  className?: string;
}) {
  const { before, match, after } = searchExcerpt(text, term);
  return (
    <span
      className={cn(
        "line-clamp-2 text-sm [overflow-wrap:anywhere] break-keep",
        className,
      )}
    >
      {before}
      {match ? (
        <mark className="rounded-sm bg-primary/15 font-semibold text-foreground">
          {match}
        </mark>
      ) : null}
      {after}
    </span>
  );
}
