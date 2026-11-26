export interface DirectoryPersonResult {
  kind: "profile";
  id: string; // pub_id
  name: string;
  avatarPath: string | null;
  avatarUrl: string | null;
}

export interface DirectoryGroupResult {
  kind: "group";
  id: string; // slug
  name: string;
  avatarPath: string | null; // group icon_path, resolved the same way as a profile avatar
  avatarUrl: string | null;
}

export type DirectoryResult = DirectoryPersonResult | DirectoryGroupResult;

export interface DirectorySearchResult {
  people: DirectoryPersonResult[];
  groups: DirectoryGroupResult[];
}

/** 전역 검색 게시물 탭의 한 행(기능 명세 §3.6). 여러 그룹에서 섞여 나오므로 그룹을 함께 싣는다. */
export interface PostSearchResult {
  postId: string;
  /** 게시물 상세 주소. */
  path: string;
  groupName: string;
  title: string;
  /** 마크다운을 걷어 낸 본문. 행마다 렌더할 때 다시 파싱하지 않도록 받을 때 한 번 만든다. */
  bodyText: string;
  /** 실명·운영진 명의는 작성자 이름, 익명은 `익명`. */
  authorName: string;
  /** 운영진 명의면 이름 옆에 표시를 단다(기능 명세 §8.6). */
  staff: boolean;
  publishedAt: string;
}

export interface PostSearchCursor {
  publishedAt: string;
  postId: string;
}

export interface PostSearchPage {
  results: PostSearchResult[];
  nextCursor: PostSearchCursor | null;
}

export type GlobalSearchTab = "directory" | "posts";
