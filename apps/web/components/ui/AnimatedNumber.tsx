"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

/** Compteur qui défile jusqu'à `value` (easing expo-out, ~1 s). */
export function AnimatedNumber({
  value,
  duration = 1100,
  decimals = 0,
  className,
  style,
}: {
  value: number;
  duration?: number;
  decimals?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const [display, setDisplay] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setDisplay(origin + (value - origin) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <span className={className} style={style}>
      {display.toLocaleString("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  );
}
