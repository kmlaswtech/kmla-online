import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { PokeHand } from "~/features/pokes/components/poke-hand";

const BURST_MS = 1400;
/** 손이 들어와 처음 꽂히는 시점. 충격·글자가 여기에 맞춰 터진다. */
const IMPACT_MS = 420;
const SPARK_COUNT = 10;

function prefersReducedMotion(): boolean {
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}

/**
 * 푹 찌르기 효과(기능 명세 §12.5). 큰 손이 화면 왼쪽에서 들어와 가운데를 옆으로 두 번 찌르고, 찌른
 * 자리에서 충격파와 파편이 튀며 `푹!`이 뜬다. 라이브러리 없이 Web Animations
 * API로 그린다. 동작 줄이기를 켠 기기에서는 움직임 없이 손과 글자만 잠깐 보인다.
 * 화면 낭독기에는 `label` 한 문장만 알린다.
 */
export function StrongPokeBurst({
  playKey,
  label,
}: {
  /** 바뀔 때마다 한 번 재생한다. `null`이면 아무것도 그리지 않는다. */
  playKey: number | null;
  label: string;
}) {
  const [finishedKey, setFinishedKey] = useState<number | null>(null);
  const visibleKey =
    playKey !== null && playKey !== finishedKey ? playKey : null;
  const handRef = useRef<HTMLSpanElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const sparksRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visibleKey === null) return;
    const timer = window.setTimeout(() => setFinishedKey(visibleKey), BURST_MS);
    return () => window.clearTimeout(timer);
  }, [visibleKey]);

  useEffect(() => {
    if (visibleKey === null) return;
    const reduced = prefersReducedMotion();
    const animations: Animation[] = [];
    const play = (
      element: Element | null | undefined,
      frames: Keyframe[],
      options: KeyframeAnimationOptions,
    ) => {
      if (element)
        animations.push(element.animate(frames, { fill: "both", ...options }));
    };
    const at = (ms: number) => ms / BURST_MS;

    if (reduced) {
      const fade = [
        { opacity: 0 },
        { opacity: 1, offset: 0.15 },
        { opacity: 1, offset: 0.85 },
        { opacity: 0 },
      ];
      play(handRef.current, fade, { duration: BURST_MS });
      play(textRef.current, fade, { duration: BURST_MS });
    } else {
      // 들어오기 → 첫 찌르기(충격) → 살짝 빼기 → 두 번째 찌르기 → 빠지기
      play(
        handRef.current,
        [
          { transform: "translateX(-110vw)" },
          { transform: "translateX(-40px)", offset: at(IMPACT_MS - 120) },
          { transform: "translateX(6px)", offset: at(IMPACT_MS) },
          { transform: "translateX(-50px)", offset: at(IMPACT_MS + 220) },
          { transform: "translateX(6px)", offset: at(IMPACT_MS + 320) },
          { transform: "translateX(-20px)", offset: at(BURST_MS - 300) },
          { transform: "translateX(-110vw)" },
        ],
        { duration: BURST_MS, easing: "cubic-bezier(.3,.7,.4,1)" },
      );
      play(
        ringRef.current,
        [
          { transform: "scale(0.2)", opacity: 0.9 },
          { transform: "scale(2.6)", opacity: 0 },
        ],
        { duration: 520, delay: IMPACT_MS, easing: "ease-out" },
      );
      Array.from(sparksRef.current?.children ?? []).forEach((spark, index) => {
        // 손이 왼쪽에서 오므로 파편은 오른쪽 반원으로 튄다.
        const angle = -Math.PI / 2 + (index / (SPARK_COUNT - 1)) * Math.PI;
        const distance = 70 + (index % 3) * 28;
        play(
          spark,
          [
            { transform: "translate(0, 0) scale(1)", opacity: 1 },
            {
              transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) scale(0.2)`,
              opacity: 0,
            },
          ],
          {
            duration: 560,
            delay: IMPACT_MS,
            easing: "cubic-bezier(.2,.8,.3,1)",
          },
        );
      });
      play(
        textRef.current,
        [
          { transform: "scale(0.3) rotate(-12deg)", opacity: 0 },
          { transform: "scale(1.25) rotate(4deg)", opacity: 1, offset: 0.25 },
          { transform: "scale(1) rotate(0deg)", opacity: 1, offset: 0.75 },
          { transform: "scale(1.1)", opacity: 0 },
        ],
        { duration: BURST_MS - IMPACT_MS, delay: IMPACT_MS },
      );
      navigator.vibrate?.([0, IMPACT_MS, 40, 180, 60]);
    }

    return () => {
      for (const animation of animations) animation.cancel();
    };
  }, [visibleKey]);

  if (visibleKey === null) return null;

  return createPortal(
    <div
      key={visibleKey}
      className="pointer-events-none fixed inset-0 z-[100] overflow-hidden"
    >
      <span role="status" className="sr-only">
        {label}
      </span>
      {/* 손끝이 화면 가운데에 닿도록 손의 오른쪽 끝을 가운데에 둔다. */}
      <div className="absolute top-1/2 right-1/2 -translate-y-1/2">
        {/* 선만 있는 손이라 겹친 손가락과 뒤 화면이 비치지 않게 면을 배경색으로 채운다. */}
        <PokeHand
          ref={handRef}
          className="block w-[min(70vw,320px)] drop-shadow-xl [&_path]:fill-background [&_rect]:fill-background"
        />
      </div>
      <div
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 -translate-1/2"
      >
        <div
          ref={ringRef}
          className="size-24 rounded-full border-[6px] border-amber-400 opacity-0"
        />
      </div>
      <div
        ref={sparksRef}
        aria-hidden="true"
        className="absolute top-1/2 left-1/2"
      >
        {Array.from({ length: SPARK_COUNT }, (_, index) => (
          <span
            key={index}
            className="absolute size-2.5 -translate-1/2 rounded-full bg-amber-400 opacity-0 odd:bg-rose-500"
          />
        ))}
      </div>
      <div
        ref={textRef}
        aria-hidden="true"
        className="absolute top-[calc(50%-7rem)] left-1/2 -ml-8 opacity-0 select-none"
      >
        <span className="block rounded-2xl bg-rose-600 px-5 py-2 text-5xl font-black tracking-tight text-white shadow-xl">
          푹!
        </span>
      </div>
    </div>,
    document.body,
  );
}
