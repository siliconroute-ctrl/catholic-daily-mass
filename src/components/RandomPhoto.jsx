import { useMemo, useState } from "react";

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Tries a randomly-ordered pool of photo URLs, moving to the next one if a
 * file is missing (404), and finally rendering `fallback` if none exist.
 * This lets you fill in as many or as few photos as you have on hand.
 */
export default function RandomPhoto({ candidates, className, alt, fallback }) {
  const order = useMemo(() => shuffle(candidates), [candidates]);
  const [idx, setIdx] = useState(0);

  if (idx >= order.length) return fallback;

  return (
    <img
      key={order[idx]}
      src={order[idx]}
      alt={alt}
      className={className}
      onError={() => setIdx((n) => n + 1)}
    />
  );
}
