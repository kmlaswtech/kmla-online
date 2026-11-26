import { SearchIcon, XIcon } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";

import { DirectorySearchPanel } from "~/features/search/components/directory-search-panel";
import { GlobalSearchResults } from "~/features/search/components/global-search-results";
import { searchDirectory } from "~/features/search/data/queries";
import {
  hasMinimumSearchLength,
  normalizeSearchInput,
  parseGlobalSearchTab,
} from "~/features/search/model/format";
import type {
  DirectorySearchResult,
  GlobalSearchTab,
} from "~/features/search/model/types";
import { useSearchDialogParam } from "~/shared/hooks/use-search-dialog-param";
import { Button } from "~/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/shared/ui/dialog";
import { Input } from "~/shared/ui/input";

const DIALOG_CLASS =
  "flex h-svh w-full max-w-full sm:max-w-full flex-col gap-0 overflow-hidden rounded-none bg-background p-0 ring-0 top-0 left-0 translate-x-0 translate-y-0";

interface SettledSearch {
  query: string;
  result: DirectorySearchResult;
  error: string | null;
}

/** 모바일 전용 진입점(홈 헤더의 검색 아이콘)에서만 연다. 데스크톱은
 * `GlobalSearchDropdown`을 쓰므로 이 dialog는 데스크톱에서 열리지 않는다. */
export function GlobalSearchDialog() {
  const { open, submittedQuery, tab, closeSearch, submitQuery, selectTab } =
    useSearchDialogParam();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeSearch()}>
      <DialogContent
        showCloseButton={false}
        className={DIALOG_CLASS}
        {...(submittedQuery ? {} : { initialFocus: inputRef })}
      >
        <SearchPanel
          submittedQuery={submittedQuery}
          tab={parseGlobalSearchTab(tab)}
          // 기본 탭은 주소에 두지 않는다.
          onSelectTab={(next) => selectTab(next === "directory" ? null : next)}
          inputRef={inputRef}
          onSubmitQuery={submitQuery}
          onClose={closeSearch}
        />
      </DialogContent>
    </Dialog>
  );
}

function SearchPanel({
  submittedQuery,
  tab,
  onSelectTab,
  inputRef,
  onSubmitQuery,
  onClose,
}: {
  submittedQuery: string;
  tab: GlobalSearchTab;
  onSelectTab: (tab: GlobalSearchTab) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  onSubmitQuery: (query: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(submittedQuery);
  const [composing, setComposing] = useState(false);
  const [settled, setSettled] = useState<SettledSearch | null>(null);
  const settledQuery = settled?.query;

  useEffect(() => {
    // 게시물 탭에서는 사람·그룹을 묻지 않는다. 그 탭으로 돌아올 때 이미 받은 검색어면 다시 묻지 않는다.
    if (!submittedQuery || tab !== "directory") return;
    if (settledQuery === submittedQuery) return;

    let current = true;
    void (async () => {
      try {
        const result = await searchDirectory(submittedQuery);
        if (current) setSettled({ query: submittedQuery, result, error: null });
      } catch {
        if (current)
          setSettled({
            query: submittedQuery,
            result: { people: [], groups: [] },
            error: "검색 결과를 불러오지 못했습니다.",
          });
      }
    })();

    return () => {
      current = false;
    };
  }, [settledQuery, submittedQuery, tab]);

  const current = settled?.query === submittedQuery ? settled : null;
  const loading = submittedQuery !== "" && current === null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (composing) return;
    const normalized = normalizeSearchInput(query);
    if (!hasMinimumSearchLength(normalized)) return;
    onSubmitQuery(normalized);
  };

  return (
    <>
      <DialogHeader className="flex-row items-center gap-2 border-b p-3">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="검색 닫기"
          onClick={onClose}
        >
          <XIcon />
        </Button>
        <form onSubmit={submit} className="flex-1">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={(event) => {
                setQuery(event.currentTarget.value);
                setComposing(false);
              }}
              autoComplete="off"
              placeholder="사람 · 그룹 · 게시물 검색"
              aria-label="사람 · 그룹 · 게시물 검색어"
              className="h-9 rounded-full border-0 bg-muted pl-9 shadow-none [&::-webkit-search-cancel-button]:appearance-none"
              type="search"
            />
          </div>
        </form>
        <DialogTitle className="sr-only">전역 검색</DialogTitle>
        <DialogDescription className="sr-only">
          사람과 그룹을 이름으로, 가입한 그룹의 게시물을 내용으로 검색합니다.
        </DialogDescription>
      </DialogHeader>

      <GlobalSearchResults
        query={submittedQuery}
        tab={tab}
        onTabChange={onSelectTab}
        directory={
          <DirectorySearchPanel
            query={submittedQuery}
            loading={loading}
            result={current?.result ?? null}
            error={current?.error ?? null}
          />
        }
      />
    </>
  );
}
