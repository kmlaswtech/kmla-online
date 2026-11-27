import { lazy, Suspense, type RefObject } from "react";

import type { MentionTarget } from "~/features/posts/model/mentions";

const DesktopMarkdownEditor = lazy(
  () => import("~/features/posts/components/editor/desktop-markdown-editor"),
);

/** 폼에서 현재 본문을 읽거나 커서 위치에 멘션을 넣는다. */
export interface PostBodyInputHandle {
  /** 편집기가 준비되기 전에는 undefined를 돌려준다. */
  getValue(): string | undefined;
  /** 여러 멘션을 공백으로 이어 한 번에 넣는다. 실행 취소 한 번에 함께 사라진다. */
  insertMentions(mentions: { label: string; ordinal: number }[]): void;
}

/**
 * 편집기가 멘션을 복사·붙여넣기로 실어 나를 때 묻는 멘션 초안(`useMentionDraft()`). 주지 않으면(멘션이 없는 개인 게시물)
 * 붙여 넣은 멘션은 평문이 된다.
 */
export interface PostBodyMentionClipboard {
  /** 이 번호가 부르는 사람. 초안이 모르는 번호면 `null`. */
  targetOf(ordinal: number): MentionTarget | null;
  /** 붙여 넣은 대상들에게 이 글의 번호를 준다. 번호를 못 받은 대상은 결과에서 빠지고 평문으로 붙는다. `usedOrdinals`는 편집기 문서에 지금 남아 있는 번호다. */
  adopt(
    targets: MentionTarget[],
    usedOrdinals: number[],
  ): { pubId: string; ordinal: number }[];
}

export function PostBodyInput({
  value,
  onValueChange,
  className,
  handleRef,
  mentionClipboard,
}: {
  value: string;
  onValueChange?: (value: string) => void;
  className?: string;
  handleRef?: RefObject<PostBodyInputHandle | null>;
  mentionClipboard?: PostBodyMentionClipboard;
}) {
  return (
    <Suspense
      fallback={
        <div
          className="h-[clamp(18rem,50dvh,32rem)] rounded-md border md:h-80"
          aria-busy="true"
        />
      }
    >
      <DesktopMarkdownEditor
        initialValue={value}
        onValueChange={onValueChange}
        handleRef={handleRef}
        mentionClipboard={mentionClipboard}
        className={className}
      />
    </Suspense>
  );
}
