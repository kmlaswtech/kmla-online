import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useFetcher } from "react-router";
import { toast } from "sonner";

// 배럴은 알림 화면 컴포넌트를 끌고 온다. 뱃지 키만 필요하다.
import { notificationKeys } from "~/features/notifications/data/cache";
import { StrongPokeBurst } from "~/features/pokes/components/strong-poke-burst";
import { pokeKeys } from "~/features/pokes/data/cache";
import { markMyPokesSeen } from "~/features/pokes/data/mutations";
import { usePokeJab } from "~/features/pokes/hooks/use-poke-jab";
import type { PokePerson, ReceivedPoke } from "~/features/pokes/model/types";
import { RelativeTime } from "~/shared/components/relative-time";
import { UserAvatar } from "~/shared/components/user-avatar";
import { Badge } from "~/shared/ui/badge";
import { Button } from "~/shared/ui/button";

/** `clientAction`이 돌려주는 모양. 라우트 모듈의 타입을 feature가 가져오지 않도록 여기서 적는다. */
export type PokeActionData =
  { poked: boolean; strong: boolean; profileId: number } | { error: string };

/**
 * 방금 찌른 사람은 재검증으로 목록에서 빠져도 이 화면에 있는 동안 `콕 찔렀어요`로 남긴다. 행이 바로 사라지면
 * 손 모션이 끊기고, 누른 자리가 갑자기 다른 사람으로 바뀐다.
 */
function keepPoked<Item extends PokePerson>(
  previous: Item[],
  next: Item[],
  poked: ReadonlySet<number>,
): Item[] {
  const nextById = new Map(next.map((item) => [item.profileId, item]));
  const kept = previous.flatMap((item) => {
    const fresh = nextById.get(item.profileId);
    if (fresh) return [fresh];
    return poked.has(item.profileId) ? [item] : [];
  });
  const keptIds = new Set(kept.map((item) => item.profileId));
  return [...next.filter((item) => !keptIds.has(item.profileId)), ...kept];
}

function useKeptList<Item extends PokePerson>(
  items: Item[],
  poked: ReadonlySet<number>,
): Item[] {
  const [source, setSource] = useState(items);
  const [view, setView] = useState(items);
  if (source !== items) {
    setSource(items);
    setView(keepPoked(view, items, poked));
  }
  return view;
}

/**
 * 콕 찌르기 화면(기능 명세 §12.5). 받은 콕 찌르기와 추천을 차례로 둔다.
 * 찌르기는 라우트 `clientAction`으로 보내고 loader 재검증으로 목록을 고친다. 성공은 손 모션으로만 알리고
 * 토스트는 실패에만 띄운다.
 */
export function PokeScreen({
  received,
  suggestions,
}: {
  received: ReceivedPoke[];
  suggestions: PokePerson[];
}) {
  const queryClient = useQueryClient();
  const [poked, setPoked] = useState<ReadonlySet<number>>(() => new Set());
  const receivedView = useKeptList(received, poked);
  const suggestionView = useKeptList(suggestions, poked);
  // 받은 목록에 새 찌르기가 들어오면 읽음 처리하고, 보지 못한 푹 찌르기는 효과를 한 번 보여 준다. 처음 열 때와
  // 화면을 켜 둔 채 찔려 Realtime 재검증으로 목록이 바뀔 때 모두 해당한다. 되찌르기 뒤 재검증처럼 새 찌르기가
  // 없으면 건너뛴다. loader에서 읽음 처리하면 재검증마다 효과 표시와 읽음이 엇갈린다.
  const [seenPokes, setSeenPokes] = useState<ReadonlySet<string> | null>(null);
  const [readRequest, setReadRequest] = useState(0);
  const [burst, setBurst] = useState<{ key: number; label: string } | null>(
    null,
  );
  const showBurst = (label: string) =>
    setBurst((current) => ({ key: (current?.key ?? 0) + 1, label }));
  const receivedKeys = received.map(
    (poke) => `${poke.profileId}:${poke.pokedAt}`,
  );
  if (seenPokes === null || receivedKeys.some((key) => !seenPokes.has(key))) {
    const strong = received.find(
      (poke, index) =>
        poke.strongEffectPending && !seenPokes?.has(receivedKeys[index]),
    );
    setSeenPokes(new Set([...(seenPokes ?? []), ...receivedKeys]));
    setReadRequest((count) => count + 1);
    if (strong) {
      showBurst(`${strong.name}님이 회원님을 푹 찔렀습니다!`);
    }
  }

  useEffect(() => {
    if (readRequest === 0) return;
    markMyPokesSeen()
      .then(() =>
        queryClient.invalidateQueries({ queryKey: notificationKeys.badge() }),
      )
      .catch(() => undefined);
  }, [readRequest, queryClient]);

  function handleResult(data: PokeActionData) {
    if ("error" in data) {
      toast.error(data.error);
      return;
    }
    setPoked((current) => new Set(current).add(data.profileId));
    void queryClient.invalidateQueries({ queryKey: pokeKeys.all });
    if (data.strong) {
      showBurst("푹 찔렀습니다!");
    }
  }

  return (
    <div className="flex flex-col gap-8 px-4 pt-4 pb-10 sm:px-0">
      {/* 되찌를 사람이 없으면 구역째 두지 않는다. 빈 안내 문구는 남는 공간만 차지한다. */}
      {receivedView.length > 0 ? (
        <PokeSection title="받은 콕 찌르기">
          {receivedView.map((poke) => (
            <PokeRow
              key={poke.profileId}
              person={poke}
              waiting={poked.has(poke.profileId)}
              meta={
                <>
                  <RelativeTime value={poke.pokedAt} />
                  <span aria-hidden="true">·</span>
                  <span>{poke.pokeCount}번째</span>
                  {poke.strongCount > 0 ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>푹 {poke.strongCount}번</span>
                    </>
                  ) : null}
                </>
              }
              badge={
                poke.lastStrong ? (
                  <Badge className="bg-rose-600 text-white">푹</Badge>
                ) : null
              }
              onResult={handleResult}
            />
          ))}
        </PokeSection>
      ) : null}

      {suggestionView.length > 0 ? (
        <PokeSection title="추천">
          {suggestionView.map((person) => (
            <PokeRow
              key={person.profileId}
              person={person}
              waiting={poked.has(person.profileId)}
              meta={person.cohortLabel}
              onResult={handleResult}
            />
          ))}
        </PokeSection>
      ) : null}

      <StrongPokeBurst
        playKey={burst?.key ?? null}
        label={burst?.label ?? ""}
      />
    </div>
  );
}

function PokeSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-1">
      <h2 className="px-1 pb-1 text-sm font-semibold text-muted-foreground">
        {title}
      </h2>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

function PokeRow({
  person,
  meta,
  badge,
  waiting,
  onResult,
}: {
  person: PokePerson;
  meta?: ReactNode;
  badge?: ReactNode;
  waiting: boolean;
  onResult: (data: PokeActionData) => void;
}) {
  const fetcher = useFetcher<PokeActionData>({
    key: `poke:${person.profileId}`,
  });
  const [labelRef, jab] = usePokeJab<HTMLSpanElement>();
  const reported = useRef<PokeActionData | undefined>(undefined);
  const submitting = fetcher.state !== "idle";

  // 결과는 한 번만 알린다. 재검증으로 목록이 바뀌기 전에 `data`가 먼저 들어온다.
  useEffect(() => {
    const result = fetcher.data;
    if (!result || result === reported.current) return;
    reported.current = result;
    if ("poked" in result && result.poked) jab();
    onResult(result);
  }, [fetcher.data, jab, onResult]);

  return (
    <li className="flex items-center gap-3 rounded-lg px-1 py-2">
      <Link
        to={`/profile/${person.pubId}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <UserAvatar src={person.avatarUrl} name={person.name} size="lg" />
        <span className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium">{person.name}</span>
            {badge}
          </span>
          {meta ? (
            <span className="flex min-w-0 items-center gap-1 truncate text-[13px] text-muted-foreground">
              {meta}
            </span>
          ) : null}
        </span>
      </Link>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={submitting || waiting}
        onClick={() =>
          void fetcher.submit(
            { intent: "poke", profileId: String(person.profileId) },
            { method: "post", action: "/pokes" },
          )
        }
      >
        <span ref={labelRef} className="inline-block">
          {waiting ? "콕 찔렀어요" : "콕 찌르기"}
        </span>
      </Button>
    </li>
  );
}
