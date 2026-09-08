import RandomPhoto from "./RandomPhoto.jsx";

/** Church exteriors — shown on the entrance screen. Fill any of these slots
 *  with your own photos; empty slots are skipped automatically. */
export const EXTERIOR_PHOTOS = [
  "/church-1.jpg",
  "/church-2.jpg",
  "/church-3.jpg",
  "/church-4.jpg",
  "/church-5.jpg",
  "/church-6.jpg",
];

/** Church interiors (altar, Mass in progress) — shown once the person taps
 *  "Enter Today's Mass". */
export const INTERIOR_PHOTOS = [
  "/church-interior-1.jpg",
  "/church-interior-2.jpg",
  "/church-interior-3.jpg",
  "/church-interior-4.jpg",
  "/church-interior-5.jpg",
  "/church-interior-6.jpg",
];

export function HeroArt({ className = "", photos = EXTERIOR_PHOTOS, alt = "A Catholic church" }) {
  return (
    <RandomPhoto
      candidates={photos}
      className={className}
      alt={alt}
      fallback={<EucharistArt className={className} />}
    />
  );
}

export default function EucharistArt({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 240"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="The Blessed Sacrament"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <radialGradient id="glow-hero" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#F6EFDF" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#E9C77B" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#E9C77B" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="240" height="240" fill="#6E1423" />
      <circle cx="120" cy="100" r="92" fill="url(#glow-hero)" />
      <g stroke="#A87B2D" strokeWidth="2.5" strokeLinecap="round" opacity="0.75">
        {Array.from({ length: 16 }).map((_, i) => {
          const angle = (i * Math.PI * 2) / 16;
          const inner = 46;
          const outer = i % 2 === 0 ? 86 : 70;
          const x1 = 120 + Math.cos(angle) * inner;
          const y1 = 100 + Math.sin(angle) * inner;
          const x2 = 120 + Math.cos(angle) * outer;
          const y2 = 100 + Math.sin(angle) * outer;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
      </g>
      <circle cx="120" cy="100" r="38" fill="#F6EFDF" stroke="#6E1423" strokeWidth="2" />
      <path d="M120 78c-8 6-13 14-13 22s5 16 13 22c8-6 13-14 13-22s-5-16-13-22z" fill="none" stroke="#6E1423" strokeWidth="1.4" opacity="0.55" />
      <path d="M120 138v34" stroke="#A87B2D" strokeWidth="6" strokeLinecap="round" />
      <path d="M90 202c0-16 13-24 30-24s30 8 30 24" fill="none" stroke="#A87B2D" strokeWidth="6" strokeLinecap="round" />
      <path d="M76 214h88" stroke="#6E1423" strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}
