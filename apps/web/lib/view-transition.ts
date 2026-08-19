// Shared-element navigation (View Transitions API) via react-router's
// built-in support. The browser morphs elements whose old and new states
// carry the same `view-transition-name` — but every named element is
// lifted into the ::view-transition pseudo-layer, which paints over the
// root snapshot. So NO grid card carries a name at rest: the one
// transitioning card is named imperatively for exactly the transition
// window (see nameCardForTransition / useIconTransitionHandoff), and the
// detail preview is the only element named in React.
//
// react-router only honors `viewTransition` through the data router
// (`router.navigate`) — the declarative navigator that `useNavigate()`
// reaches from descendant <Routes> drops the option — so this hook goes
// straight to the RouterProvider's router. Browsers without
// `document.startViewTransition` (Firefox) just get the plain instant
// navigation: the router feature-detects and skips the transition.

import { useCallback, useContext, useLayoutEffect } from "react";
import {
  UNSAFE_DataRouterContext,
  useNavigate,
  type NavigateOptions,
  type To,
} from "react-router";

export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * `navigate` with the shared-element morph. Reduced-motion users skip the
 * transition entirely (globals.css also disables the animations as a
 * belt-and-braces guard). Pop navigations (`navigate(-1)` — the modal
 * close) animate automatically: the router replays a transition recorded
 * for the original push.
 */
export function useTransitionNavigate() {
  const router = useContext(UNSAFE_DataRouterContext)?.router;
  const fallback = useNavigate();
  return useCallback(
    (to: To | number, opts?: NavigateOptions) => {
      if (!router) {
        // Not under a RouterProvider (tests): plain navigation.
        if (typeof to === "number") fallback(to);
        else fallback(to, opts);
        return;
      }
      if (typeof to === "number") void router.navigate(to);
      else
        void router.navigate(to, {
          ...opts,
          // Skip the morph for reduced-motion users, and in hidden
          // documents, where startViewTransition aborts with an
          // InvalidStateError react-router leaves unhandled.
          viewTransition: !prefersReducedMotion() && !document.hidden,
        });
    },
    [router, fallback]
  );
}

/** `view-transition-name` for a card's artwork / the detail preview it
 *  morphs into. Keys are bundle slugs (or the platform id for glass-less
 *  platforms), unique per grid. */
export function iconTransitionName(key: string): string {
  return `icon-${key}`;
}

/** data attribute that lets the transition machinery find a card's
 *  artwork box without the card carrying a live name. */
export const CARD_VT_ATTR = "data-vt-icon";

function findCardArtwork(key: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[${CARD_VT_ATTR}="${CSS.escape(key)}"]`
  );
}

/** Failsafe timers: whoever names a card schedules its return to rest in
 *  case no transition (or unmount effect) cleans it up. */
const pendingClears = new Map<string, number>();

export function clearCardTransitionName(key: string) {
  const timer = pendingClears.get(key);
  if (timer !== undefined) {
    clearTimeout(timer);
    pendingClears.delete(key);
  }
  const el = findCardArtwork(key);
  if (el) el.style.viewTransitionName = "";
}

/**
 * Name a grid card's artwork for one transition window. Call right
 * before the navigation so the element is named in the captured state;
 * the detail's handoff effect (or the failsafe timeout) returns the grid
 * to its zero-named rest state. Returns false when no such card is on
 * the page (filtered grid, other route) — callers can then skip the
 * morph and let the navigation be a plain fade.
 */
export function nameCardForTransition(key: string): boolean {
  const el = findCardArtwork(key);
  if (!el) return false;
  el.style.viewTransitionName = iconTransitionName(key);
  const timer = pendingClears.get(key);
  if (timer !== undefined) clearTimeout(timer);
  pendingClears.set(
    key,
    window.setTimeout(() => clearCardTransitionName(key), 1000)
  );
  return true;
}

/**
 * The card ↔ detail-preview name handoff, from the preview's side. React
 * layout effects run inside the router's flushSync update — after the
 * browser captures the old state, before it captures the new one — which
 * is the only window where both snapshots stay duplicate-free:
 *
 * - mount (open commit): the preview owns `icon-<key>` now; shed the
 *   name the click handler put on the grid card, so the new capture has
 *   one named element, not two.
 * - unmount (close/back commit): hand the name to the grid card so the
 *   return morph has a destination. No card on the page (docs route,
 *   filtered grid, full-page detail) is fine — the preview simply exits
 *   with the cross-fade.
 *
 * Pass null to opt out (a preview that never morphs).
 */
export function useIconTransitionHandoff(key: string | null) {
  useLayoutEffect(() => {
    if (key === null) return;
    clearCardTransitionName(key);
    return () => {
      nameCardForTransition(key);
    };
  }, [key]);
}
