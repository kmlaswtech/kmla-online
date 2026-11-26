import { useCallback } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";

const OPEN_PARAM = "search";
const QUERY_PARAM = "q";
// 그룹 화면과 그룹 홈이 `tab`을 이미 쓴다. 이 훅이 그 이름을 지우면 그룹 검색을 닫을 때 보던 탭을 잃는다.
const TAB_PARAM = "searchTab";

/** dialog를 연 것이 우리라는 표식. 뒤로가기로 닫을 수 있는지 판단하는 근거다. */
interface SearchDialogLocationState {
  searchDialogPushed?: boolean;
}

export interface SearchDialogState {
  /** 검색 dialog가 열려 있는가. */
  open: boolean;
  /** 제출된 검색어. 아직 제출하지 않았으면 빈 문자열이다. */
  submittedQuery: string;
  /** 결과 탭. 탭을 두는 검색만 쓰며, 고르지 않았으면 `null`이다. */
  tab: string | null;
  openSearch: () => void;
  closeSearch: () => void;
  submitQuery: (query: string) => void;
  selectTab: (tab: string | null) => void;
}

/**
 * 검색 dialog의 열림 상태를 URL에 둔다(`?search=1`, 제출한 검색어는 `?q=`).
 *
 * 모바일에서 검색은 전체화면 시트라 사용자는 습관적으로 뒤로가기로 닫는다. 열림 상태가
 * component state에만 있으면 그 뒤로가기가 닫을 것을 찾지 못해 화면 자체를 떠난다. 열 때
 * history entry를 하나 push해 두면 뒤로가기가 그 entry만 pop해서 검색만 닫힌다.
 *
 * 검색어까지 URL에 두는 이유는 결과에서 게시물이나 프로필로 들어갔다가 돌아오는 길 때문이다.
 * 돌아온 entry가 검색어를 들고 있어야 결과 목록이 그대로 복원된다.
 *
 * 제출은 push가 아니라 replace다. 그래야 검색어를 몇 번 바꾸든 검색 오버레이가 남기는 entry는
 * 하나고, 뒤로가기 한 번이면 원래 화면으로 돌아온다.
 *
 * 결과 탭을 두는 검색(전역 검색)은 고른 탭도 `?searchTab=`에 둔다. 검색어와 같은 이유로, 결과에서
 * 들어갔다 돌아오면 보던 탭이 남아야 한다.
 *
 * 그룹 게시물 검색과 인명 검색이 같은 훅을 쓴다. 둘은 그룹 상세와 홈에 각각 붙어 한 화면에
 * 함께 뜨지 않으므로, param과 표식을 공유해도 서로의 것을 열거나 닫지 않는다.
 */
export function useSearchDialogParam(): SearchDialogState {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as SearchDialogLocationState | null;
  const open = searchParams.get(OPEN_PARAM) === "1";
  // 손으로 주소를 고쳐 들어올 수도 있으므로 제출 경로와 같은 정규화를 읽을 때 한 번 더 건다.
  const submittedQuery = open
    ? (searchParams.get(QUERY_PARAM)?.normalize("NFC").trim() ?? "")
    : "";
  const tab = open ? searchParams.get(TAB_PARAM) : null;

  const openSearch = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.set(OPEN_PARAM, "1");
    // 새로 여는 검색은 언제나 빈 입력창에서 시작한다. 그룹 게시물 검색은 명세가 못박아 뒀고
    // (기능 명세 §8.9), 인명 검색도 같은 시트라 다르게 둘 이유가 없다.
    next.delete(QUERY_PARAM);
    next.delete(TAB_PARAM);
    void setSearchParams(next, {
      preventScrollReset: true,
      state: { searchDialogPushed: true } satisfies SearchDialogLocationState,
    });
  }, [searchParams, setSearchParams]);

  const closeSearch = useCallback(() => {
    // 우리가 push한 entry라면 뒤로가기로 닫는 게 맞다 — 그래야 브라우저 뒤로가기가 방금 닫은
    // 검색을 다시 띄우지 않는다. 검색이 열린 주소로 곧장 들어온 경우엔 pop할 entry가 없어서
    // 앱 밖으로 나가 버리므로, 그때만 param을 지운다.
    if (locationState?.searchDialogPushed) {
      void navigate(-1);
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete(OPEN_PARAM);
    next.delete(QUERY_PARAM);
    next.delete(TAB_PARAM);
    void setSearchParams(next, { replace: true, preventScrollReset: true });
  }, [locationState, navigate, searchParams, setSearchParams]);

  const submitQuery = useCallback(
    (query: string) => {
      const next = new URLSearchParams(searchParams);
      next.set(OPEN_PARAM, "1");
      if (query) next.set(QUERY_PARAM, query);
      else next.delete(QUERY_PARAM);
      // `location.state`를 그대로 넘긴다. replace는 state를 승계하지 않아서, 넘기지 않으면
      // 검색 한 번에 표식이 사라지고 닫기 버튼이 뒤로가기 대신 param만 지운다.
      void setSearchParams(next, {
        replace: true,
        preventScrollReset: true,
        state: locationState,
      });
    },
    [locationState, searchParams, setSearchParams],
  );

  // 탭도 검색어처럼 주소에 둬야 결과에서 들어갔다 돌아왔을 때 보던 탭이 남는다. 제출과 같은 이유로 replace다.
  const selectTab = useCallback(
    (nextTab: string | null) => {
      const next = new URLSearchParams(searchParams);
      if (nextTab) next.set(TAB_PARAM, nextTab);
      else next.delete(TAB_PARAM);
      void setSearchParams(next, {
        replace: true,
        preventScrollReset: true,
        state: locationState,
      });
    },
    [locationState, searchParams, setSearchParams],
  );

  return {
    open,
    submittedQuery,
    tab,
    openSearch,
    closeSearch,
    submitQuery,
    selectTab,
  };
}
