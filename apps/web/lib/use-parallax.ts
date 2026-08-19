import { useEffect, useRef } from "react";

// atvImg-spirit pointer parallax for the detail's glass preview (our own
// small hook, no dependency): rotateX/rotateY from the pointer's position
// over the element, a specular shine following the pointer, slight
// lift + drop-shadow, and a smooth spring-back on leave. Mouse/pen only —
// touch taps pass through untouched — and prefers-reduced-motion
// disables the whole effect. The icon is the hero: tilt stays subtle.

const MAX_TILT_DEG = 7;
const PERSPECTIVE_PX = 800;
const LIFT_SCALE = 1.04;

/**
 * Attach to a hoverable artwork box: `ref` goes on the element to tilt,
 * `shineRef` on an absolutely-positioned overlay inside it (the moving
 * specular highlight). Styles are written imperatively per pointer frame
 * (rAF-coalesced) so tracking never re-renders React.
 */
export function useParallax<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const shineRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let point: { x: number; y: number } | null = null;

    const frame = () => {
      raf = 0;
      if (!point) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const px = Math.min(1, Math.max(0, (point.x - r.left) / r.width));
      const py = Math.min(1, Math.max(0, (point.y - r.top) / r.height));
      const rx = (0.5 - py) * 2 * MAX_TILT_DEG;
      const ry = (px - 0.5) * 2 * MAX_TILT_DEG;
      el.style.transition = "transform 120ms ease-out, filter 200ms ease-out";
      el.style.transform = `perspective(${PERSPECTIVE_PX}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${LIFT_SCALE})`;
      el.style.filter = "drop-shadow(0 14px 28px rgba(0, 0, 0, 0.3))";
      const shine = shineRef.current;
      if (shine) {
        shine.style.opacity = "1";
        shine.style.background = `radial-gradient(circle at ${(px * 100).toFixed(1)}% ${(py * 100).toFixed(1)}%, rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0.06) 45%, transparent 65%)`;
      }
    };

    const active = (e: PointerEvent) =>
      !reduced.matches && e.pointerType !== "touch";

    const onMove = (e: PointerEvent) => {
      if (!active(e)) return;
      point = { x: e.clientX, y: e.clientY };
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const rest = () => {
      point = null;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      // Spring back: one eased transition to flat, slight overshoot.
      el.style.transition =
        "transform 500ms cubic-bezier(0.23, 1.2, 0.32, 1), filter 500ms ease-out";
      el.style.transform = "";
      el.style.filter = "";
      const shine = shineRef.current;
      if (shine) shine.style.opacity = "0";
    };
    const onLeave = (e: PointerEvent) => {
      if (!active(e)) return;
      rest();
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("pointercancel", onLeave);
    // Flatten mid-hover if the user flips reduced-motion on.
    reduced.addEventListener("change", rest);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointercancel", onLeave);
      reduced.removeEventListener("change", rest);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return { ref, shineRef };
}
