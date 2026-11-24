export const pokeKeys = {
  all: ["pokes"] as const,
  state: (profileId: number) => ["pokes", "state", profileId] as const,
};
