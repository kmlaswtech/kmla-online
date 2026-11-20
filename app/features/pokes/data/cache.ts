export const pokeKeys = {
  all: ["pokes"] as const,
  state: (profileId: number) => ["pokes", "state", profileId] as const,
  search: (query: string) => ["pokes", "search", query] as const,
};
