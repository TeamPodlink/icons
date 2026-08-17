// A tiny liquid-glass-ish squircle mark.
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="lg-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7cb8ff" />
          <stop offset="1" stopColor="#3b6fe0" />
        </linearGradient>
        <linearGradient id="lg-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <path
        d="M32 2C10 2 2 10 2 32s8 30 30 30 30-8 30-30S54 2 32 2Z"
        fill="url(#lg-body)"
      />
      <circle cx="32" cy="32" r="15" fill="url(#lg-glass)" />
      <path
        d="M32 2C10 2 2 10 2 32s8 30 30 30 30-8 30-30S54 2 32 2Z"
        stroke="#ffffff"
        strokeOpacity="0.5"
        strokeWidth="1.5"
      />
    </svg>
  );
}
