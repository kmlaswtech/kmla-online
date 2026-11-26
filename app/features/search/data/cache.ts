import { infiniteQueryOptions } from "@tanstack/react-query";

import { searchMemberGroupPosts } from "~/features/search/data/queries";
import type { PostSearchCursor } from "~/features/search/model/types";

const searchKeys = {
  all: ["search"] as const,
  directory: (query: string) =>
    [...searchKeys.all, "directory", query] as const,
  posts: (query: string) => [...searchKeys.all, "posts", query] as const,
};

export function memberGroupPostSearchQuery(query: string) {
  return infiniteQueryOptions({
    queryKey: searchKeys.posts(query),
    queryFn: ({ pageParam }) => searchMemberGroupPosts(query, pageParam),
    initialPageParam: null as PostSearchCursor | null,
    getNextPageParam: (page) => page.nextCursor,
  });
}
