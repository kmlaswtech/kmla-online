import { Link } from "react-router";

import {
  encodeMentionClipboard,
  type PostMention,
} from "~/features/posts/model/mentions";
import { cn } from "~/shared/lib/utils";

/** 본문 안의 사용자 멘션(기능 명세 §8.14). 이름은 저장된 토큰이 아니라 읽기 RPC의 `mentions`에서 온다. */
export function MentionChip({
  mention,
  fallbackLabel,
}: {
  /** 본문의 ordinal로 찾은 대상. 못 찾으면 null이고 평문으로 그린다. */
  mention: PostMention | null;
  /** 토큰에 적혀 있던 이름. 대상을 못 찾았을 때만 쓴다. */
  fallbackLabel: string;
}) {
  // 대상을 못 찾는 경우는 둘이다: 개인 게시물처럼 멘션을 쓰지 않는 본문에 손으로 토큰을 친
  // 경우와, 대상이 사라진 경우. 어느 쪽이든 링크를 만들지 않고 글자로 남긴다.
  if (!mention) return <span>@{fallbackLabel}</span>;

  const label = mention.name ?? "탈퇴한 사용자";
  const className = cn(
    "rounded-sm font-medium text-primary",
    mention.pub_id && "hover:underline",
  );

  if (!mention.pub_id) return <span className={className}>@{label}</span>;
  return (
    <Link
      className={className}
      to={`/profile/${mention.pub_id}`}
      // 복사한 칩을 본문 편집기가 멘션으로 되읽는 표식이다. 프로필 주소만으로는 링크와 구분되지 않는다.
      data-mention={encodeMentionClipboard({
        pubId: mention.pub_id,
        name: label,
      })}
    >
      @{label}
    </Link>
  );
}
