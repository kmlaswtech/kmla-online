import { forwardRef } from "react";

import pokeHandSvg from "~/features/pokes/components/poke-hand.svg?raw";
import { cn } from "~/shared/lib/utils";

// 버튼은 `size-` 클래스가 없는 하위 svg를 `size-4`로 줄인다. 크기는 감싸는 span이 정하므로 svg는 그 칸을 채운다.
const markup = pokeHandSvg.replace("<svg ", '<svg class="size-full" ');

/**
 * 오른쪽을 가리키는 손. 콕 찌르기는 손가락이 옆으로 찌르는 모션이라 lucide의 위를 가리키는 `Pointer`
 * 대신 직접 그린다. 그림은 `poke-hand.svg`에서 편집하고, 선은 메시지 좋아요와 같은 `primary`다.
 * 인라인으로 넣어야 글자색과 모션이 svg에 닿는다.
 */
export const PokeHand = forwardRef<HTMLSpanElement, { className?: string }>(
  function PokeHand({ className }, ref) {
    return (
      <span
        ref={ref}
        aria-hidden="true"
        className={cn(
          "inline-block aspect-square w-5 shrink-0 text-primary",
          className,
        )}
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    );
  },
);
