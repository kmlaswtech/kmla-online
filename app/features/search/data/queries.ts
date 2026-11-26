import { createGroupMediaUrls } from "~/features/groups/data/files";
import { extractPostPlainText, groupPostPath } from "~/features/posts";
import { createProfileMediaUrls } from "~/features/profiles/data/media";
import type { RecentSearchEntry } from "~/features/search/model/recent-searches";
import type {
  DirectoryGroupResult,
  DirectoryPersonResult,
  DirectorySearchResult,
  PostSearchCursor,
  PostSearchPage,
} from "~/features/search/model/types";
import { getSupabase } from "~/shared/supabase/client";

export async function searchDirectory(
  query: string,
): Promise<DirectorySearchResult> {
  const { data, error } = await getSupabase().rpc("search_directory", {
    p_query: query,
  });
  if (error) throw error;

  const rows = data ?? [];
  const peopleRows = rows.filter((row) => row.result_kind === "profile");
  const groupRows = rows.filter((row) => row.result_kind === "group");

  const [avatarUrls, iconUrls] = await Promise.all([
    createProfileMediaUrls(peopleRows.map((row) => row.avatar_path)),
    createGroupMediaUrls(groupRows.map((row) => row.avatar_path)),
  ]);

  const people: DirectoryPersonResult[] = peopleRows.map((row) => ({
    kind: "profile",
    id: row.result_id,
    name: row.result_name,
    avatarPath: row.avatar_path,
    avatarUrl: row.avatar_path
      ? (avatarUrls.get(row.avatar_path) ?? null)
      : null,
  }));

  const groups: DirectoryGroupResult[] = groupRows.map((row) => ({
    kind: "group",
    id: row.result_id,
    name: row.result_name,
    avatarPath: row.avatar_path,
    avatarUrl: row.avatar_path ? (iconUrls.get(row.avatar_path) ?? null) : null,
  }));

  return { people, groups };
}

/** 한 번에 받는 게시물 수(기능 명세 §3.6). */
export const POST_SEARCH_PAGE_SIZE = 20;

export async function searchMemberGroupPosts(
  query: string,
  cursor: PostSearchCursor | null,
): Promise<PostSearchPage> {
  const { data, error } = await getSupabase().rpc("search_member_group_posts", {
    p_query: query,
    p_limit: POST_SEARCH_PAGE_SIZE,
    ...(cursor
      ? {
          p_cursor_published_at: cursor.publishedAt,
          p_cursor_post_id: cursor.postId,
        }
      : {}),
  });
  if (error) throw error;

  const results = (data ?? []).map((row) => ({
    postId: row.post_id,
    path: groupPostPath(row.group_slug, row.post_id),
    groupName: row.group_name,
    title: row.title,
    bodyText: extractPostPlainText(row.body),
    authorName: row.author_name,
    staff: row.is_staff,
    publishedAt: row.published_at,
  }));
  const last = results.at(-1);
  return {
    results,
    // 꽉 찬 페이지일 때만 다음이 있다고 본다. 마지막 페이지가 딱 20개면 빈 요청이 한 번 더 나간다.
    nextCursor:
      last && results.length === POST_SEARCH_PAGE_SIZE
        ? { publishedAt: last.publishedAt, postId: last.postId }
        : null,
  };
}

export async function resolveRecentSearchEntryUrls(
  entries: RecentSearchEntry[],
): Promise<Map<string, string>> {
  const profilePaths = entries
    .filter((entry) => entry.kind === "profile")
    .map((entry) => entry.avatarPath);
  const groupPaths = entries
    .filter((entry) => entry.kind === "group")
    .map((entry) => entry.avatarPath);

  const [profileUrls, groupUrls] = await Promise.all([
    createProfileMediaUrls(profilePaths),
    createGroupMediaUrls(groupPaths),
  ]);

  const combined = new Map<string, string>();
  for (const [path, url] of profileUrls) combined.set(`profile:${path}`, url);
  for (const [path, url] of groupUrls) combined.set(`group:${path}`, url);
  return combined;
}
