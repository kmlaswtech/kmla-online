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

/** 추천 다음 페이지의 시작점. 서버가 정한 정렬 값과 회원 id다. */
export interface PokeSuggestionCursor {
  score: number;
  profileId: number;
}

export interface PokeSuggestionPage {
  people: PokePerson[];
  /** 페이지가 덜 찼으면 `null`이다. */
  nextCursor: PokeSuggestionCursor | null;
}

export interface PokeResult {
  poked: boolean;
  strong: boolean;
}

export interface PokeState {
  waiting: boolean;
}
