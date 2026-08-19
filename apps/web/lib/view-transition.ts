// Shared-element navigation (View Transitions API) via react-router's
// built-in support. The browser morphs elements whose old and new states
// carry the same `view-transition-name` — but every named element is
// lifted into the ::view-transition pseudo-layer, which paints over the
// root snapshot. So NO grid card carries a name at rest: the one
// transitioning card is named imperatively for exactly the transition
// window (nameCardForTransition on open, the pending-return-key handoff
// on close) — its artwork box as `icon-<key>` and its root cell as
// `card-<key>` — and only the detail side (hero + container) is named
// in React.
//
// react-router only honors `viewTransition` through the data router
// (`router.navigate`) — the declarative navigator that `useNavigate()`
// reaches from descendant <Routes> drops the option — so this hook goes
// straight to the RouterProvider's router. Browsers without
// `document.startViewTransition` (Firefox) just get the plain instant
// navigation: the router feature-detects and skips the transition.

import { useCallback, useContext, type CSSProperties } from "react";
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

/** `view-transition-name` for a card's root cell / the dialog panel it
 *  expands into (the container pair riding alongside the icon pair). */
export function cardTransitionName(key: string): string {
  return `card-${key}`;
}

/** `view-transition-class` shared by the cell and the dialog panel, so
 *  globals.css can style the container morph without per-key selectors. */
export const CARD_VT_CLASS = "vt-card";

/** data attributes that let the transition machinery find a card's
 *  artwork box / root cell without the card carrying live names. */
export const CARD_VT_ATTR = "data-vt-icon";
export const CELL_VT_ATTR = "data-vt-card";

/** Inline style for the detail side of the container pair (dialog panel
 *  or full-page detail card). */
export function cardTransitionStyle(key: string): CSSProperties {
  return {
    viewTransitionName: cardTransitionName(key),
    viewTransitionClass: CARD_VT_CLASS,
  } as CSSProperties;
}

function findCardParts(key: string): {
  artwork: HTMLElement | null;
  cell: HTMLElement | null;
} {
  const esc = CSS.escape(key);
  return {
    artwork: document.querySelector<HTMLElement>(`[${CARD_VT_ATTR}="${esc}"]`),
    cell: document.querySelector<HTMLElement>(`[${CELL_VT_ATTR}="${esc}"]`),
  };
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
  const { artwork, cell } = findCardParts(key);
  if (artwork) artwork.style.viewTransitionName = "";
  if (cell) {
    cell.style.viewTransitionName = "";
    cell.style.setProperty("view-transition-class", "");
  }
}

/**
 * Name a grid card for one transition window — the artwork box
 * (`icon-<key>`, pairing with the detail preview) and the root cell
 * (`card-<key>`, pairing with the dialog panel) together. Call right
 * before the navigation so both are in the captured state; the detail's
 * handoff effect (or the failsafe timeout) returns the grid to its
 * zero-named rest state. Returns false when no such card is on the page
 * (filtered grid, other route) — the navigation then degrades to the
 * plain cross-fade.
 */
export function nameCardForTransition(key: string): boolean {
  // A new transition begins: sweep any stale participant first. The close
  // path clears its destination card only via the failsafe timer, so a
  // quick follow-up open inside that window would otherwise lift the
  // previous card into the new transition's top layer (sharp, above the
  // backdrop) until the morph ends.
  for (const staleKey of [...pendingClears.keys()])
    if (staleKey !== key) clearCardTransitionName(staleKey);
  const { artwork, cell } = findCardParts(key);
  if (!artwork) return false;
  artwork.style.viewTransitionName = iconTransitionName(key);
  if (cell) {
    cell.style.viewTransitionName = cardTransitionName(key);
    cell.style.setProperty("view-transition-class", CARD_VT_CLASS);
  }
  const timer = pendingClears.get(key);
  if (timer !== undefined) clearTimeout(timer);
  pendingClears.set(
    key,
    window.setTimeout(() => clearCardTransitionName(key), 400)
  );
  return true;
}

/**
 * The return-morph destination for a detail → grid navigation. The grid
 * mounts during the router's flushSync commit, so nothing exists to name
 * before the back navigation starts — instead the back handler records
 * which card should receive the names, and the card's own mount layout
 * effect (running inside that commit, after DOM mutations, before the
 * browser captures the new state) consumes the key and names itself.
 * Popstate-initiated returns (browser back) can't pre-record and simply
 * cross-fade. The failsafe timer in nameCardForTransition returns the
 * grid to rest if no transition consumes the names.
 */
let pendingReturnKey: string | null = null;

export function setPendingReturnKey(key: string) {
  pendingReturnKey = key;
}

/** True (and consumed) when this card is the recorded return-morph
 *  destination. */
export function consumePendingReturnKey(key: string): boolean {
  if (pendingReturnKey !== key) return false;
  pendingReturnKey = null;
  return true;
}
