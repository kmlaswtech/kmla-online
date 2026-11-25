import { useCallback, useRef } from "react";

/**
 * 버튼 글자가 옆으로 두 번 콕콕 찌르는 모션. 찌르기가 받아들여졌다는 표시라 토스트를 띄우지 않는다.
 * 동작 줄이기를 켠 기기에서는 움직이지 않는다.
 */
export function usePokeJab<Element extends globalThis.Element>() {
  const ref = useRef<Element>(null);
  const jab = useCallback(() => {
    const element = ref.current;
    if (!element?.animate) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    element.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(6px)", offset: 0.2 },
        { transform: "translateX(-1px)", offset: 0.45 },
        { transform: "translateX(6px)", offset: 0.65 },
        { transform: "translateX(0)" },
      ],
      { duration: 480, easing: "ease-out" },
    );
  }, []);
  return [ref, jab] as const;
}
