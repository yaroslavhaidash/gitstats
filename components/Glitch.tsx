"use client";

import { useEffect, useState } from "react";

const NOISE = "#%&$*@/\\<>~^";

function corrupt(text: string, from: number, len: number): string {
  const chars = text.split("");
  for (let i = from; i < Math.min(from + len, chars.length); i++) {
    if (chars[i] !== " ") chars[i] = NOISE[Math.floor(Math.random() * NOISE.length)];
  }
  return chars.join("");
}

/**
 * Every few seconds a burst of noise appears in `text` and sweeps a few characters to the right,
 * like a corrupted terminal line, then heals. Off under prefers-reduced-motion.
 */
export function Glitch({ text, className = "", every = [4000, 9000] }: { text: string; className?: string; every?: [number, number] }) {
  const [shown, setShown] = useState(text);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));
    const burst = () => {
      // A narrow band that walks a few characters, ~140ms per step, then lingers briefly before healing.
      const width = 2 + Math.floor(Math.random() * 2);
      const steps = 3 + Math.floor(Math.random() * 3);
      const start = Math.floor(Math.random() * Math.max(1, text.length - width - steps));
      for (let s = 0; s < steps; s++) later(() => setShown(corrupt(text, start + s, width)), s * 140);
      later(() => setShown(text), steps * 140 + 220);
      later(burst, every[0] + Math.random() * (every[1] - every[0]));
    };
    later(burst, 1500 + Math.random() * 2500);
    return () => timers.forEach(clearTimeout);
  }, [text, every]);
  return <span className={className}>{shown}</span>;
}
