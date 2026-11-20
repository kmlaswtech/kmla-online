/** 콕 찌르기 화면에 그리는 한 사람(기능 명세 §12.5). 아바타 경로는 서명 URL로 바꿔 싣는다. */
export interface PokePerson {
  profileId: number;
  pubId: string;
  name: string;
  avatarUrl: string | null;
  cohortLabel: string | null;
}

/** 받은 콕 찌르기 한 행. 내가 되찌를 차례인 사람이다. */
export interface ReceivedPoke extends PokePerson {
  pokedAt: string;
  pokeCount: number;
  strongCount: number;
  lastStrong: boolean;
  /** 아직 보지 못한 푹 찌르기. 화면을 열 때 효과를 한 번 보여 준다. */
  strongEffectPending: boolean;
}

export interface PokeTarget extends PokePerson {
  /** 내가 찌르고 상대의 되찌르기를 기다리는 중이다. */
  waiting: boolean;
}

export interface PokeResult {
  poked: boolean;
  strong: boolean;
  pokeCount: number;
}

export interface PokeState {
  waiting: boolean;
  pokeCount: number;
}
