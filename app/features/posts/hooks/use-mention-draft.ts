import { useCallback, useRef, useState } from "react";

import {
  MENTION_LIMIT,
  assignMentionOrdinals,
  countMentionTargets,
  mentionOrdinals,
  normalizeMentions,
  toMentionDraft,
  type MentionCandidate,
  type MentionDraftEntry,
  type MentionTarget,
  type PostMention,
} from "~/features/posts/model/mentions";

/**
 * 작성 중인 멘션 대상(기능 명세 §8.14). 번호를 올려 가며 쌓고 제출 직전 `normalizeMentions()`가 남은 토큰만 1부터 다시 매기므로,
 * 본문에서 토큰을 지워도 따로 지울 필요가 없다. 같은 사람은 쓰던 번호를 돌려준다.
 */
export function useMentionDraft(initial: PostMention[] = []) {
  const [entries, setEntries] = useState<MentionDraftEntry[]>(() =>
    toMentionDraft(initial),
  );
  const entriesRef = useRef(entries);

  const adopt = useCallback(
    (targets: MentionTarget[], usedOrdinals: number[]): MentionDraftEntry[] => {
      const { entries: next, assigned } = assignMentionOrdinals(
        entriesRef.current,
        targets,
        usedOrdinals,
      );
      if (next !== entriesRef.current) {
        entriesRef.current = next;
        setEntries(next);
      }
      return assigned;
    },
    [],
  );

  /** 고른 사람들에게 번호를 주고 초안에 올린다(`assignMentionOrdinals()`). 이 번호로 본문에 토큰을 넣는다. */
  const register = useCallback(
    (candidates: MentionCandidate[], body: string): MentionDraftEntry[] =>
      adopt(
        candidates.map(({ pub_id, name }) => ({ pubId: pub_id, name })),
        mentionOrdinals(body),
      ),
    [adopt],
  );

  /** 이 번호가 부르는 사람. 복사할 때 편집기가 클립보드에 실을 대상을 찾는다. */
  const targetOf = useCallback((ordinal: number): MentionTarget | null => {
    const entry = entriesRef.current.find((item) => item.ordinal === ordinal);
    return entry ? { pubId: entry.pubId, name: entry.name } : null;
  }, []);

  const reset = useCallback((mentions: PostMention[]) => {
    const next = toMentionDraft(mentions);
    entriesRef.current = next;
    setEntries(next);
  }, []);

  return { entries, register, adopt, targetOf, reset };
}

/** 본문에 지금 남아 있는 대상 수로 계산한 남은 자리. */
export function remainingMentions(
  body: string,
  entries: MentionDraftEntry[],
): number {
  return Math.max(0, MENTION_LIMIT - countMentionTargets(body, entries));
}

/** 본문에 실제로 남아 있는 대상의 공개 ID. 상한에서도 중복 선택을 열어 둘 때 쓴다. */
export function activeMentionPubIds(
  body: string,
  entries: MentionDraftEntry[],
): string[] {
  return normalizeMentions(body, entries).pubIds;
}
