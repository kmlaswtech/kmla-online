import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { StrongPokeBurst } from "~/features/pokes/components/strong-poke-burst";
import { pokeKeys } from "~/features/pokes/data/cache";
import { pokeProfile } from "~/features/pokes/data/mutations";
import { getPokeState } from "~/features/pokes/data/queries";
import { usePokeJab } from "~/features/pokes/hooks/use-poke-jab";
import type { PokeState } from "~/features/pokes/model/types";
import { Button } from "~/shared/ui/button";

/**
 * 다른 사람 프로필의 `콕 찌르기`(기능 명세 §12.5). 상대가 되찌르기 전에는 `콕 찔렀어요`로 막는다.
 * 상태를 읽는 동안에도 누를 수 있다. 이미 찔렀으면 서버가 세지 않고 그 사실만 돌려준다.
 * 찌른 뒤에는 서버 결과로 버튼 상태를 바로 바꾼다(캐시 병합). 성공은 토스트 대신 버튼 글자가 콕콕 찌르는 모션으로 알리고, 실패만 토스트로 알린다.
 */
export function PokeButton({
  profileId,
  className,
}: {
  profileId: number;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const { data: state } = useQuery({
    queryKey: pokeKeys.state(profileId),
    queryFn: () => getPokeState(profileId),
  });
  const [poking, setPoking] = useState(false);
  const [burstKey, setBurstKey] = useState<number | null>(null);
  const [labelRef, jab] = usePokeJab<HTMLSpanElement>();
  const waiting = state?.waiting ?? false;

  async function poke() {
    setPoking(true);
    try {
      const result = await pokeProfile(profileId);
      queryClient.setQueryData<PokeState>(pokeKeys.state(profileId), {
        waiting: true,
        pokeCount: result.pokeCount,
      });
      if (result.poked) jab();
      if (result.strong) setBurstKey(Date.now());
    } catch {
      toast.error("콕 찌르지 못했습니다.");
    } finally {
      setPoking(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className={className}
        disabled={poking || waiting}
        onClick={() => void poke()}
      >
        <span ref={labelRef} className="inline-block">
          {waiting ? "콕 찔렀어요" : "콕 찌르기"}
        </span>
      </Button>
      <StrongPokeBurst playKey={burstKey} label="푹 찔렀습니다!" />
    </>
  );
}
