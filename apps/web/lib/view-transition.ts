// Shared-element navigation (View Transitions API) via react-router's
// built-in support. The router morphs elements whose old and new states
// carry the same `view-transition-name`: grid card artwork is named
// `icon-<key>` and the detail preview reuses the name, so opening a card
// expands its artwork into the dialog and closing reverses the morph.
//
// react-router only honors `viewTransition` through the data router
// (`router.navigate`) — the declarative navigator that `useNavigate()`
// reaches from descendant <Routes> drops the option — so this hook goes
// straight to the RouterProvider's router. Browsers without
// `document.startViewTransition` (Firefox) just get the plain instant
// navigation: the router feature-detects and skips the transition.

import { createContext, useCallback, useContext } from "react";
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

/** `view-transition-name` for a directory card's artwork / the detail
 *  preview it morphs into. Keys are bundle slugs (or the platform id for
 *  glass-less platforms), unique per grid. */
export function iconTransitionName(key: string): string {
  return `icon-${key}`;
}

/**
 * The platform whose detail modal is currently open over the grid (null
 * otherwise). While the modal is up, its preview owns the platform's
 * transition names — the grid card underneath must drop its name, since
 * a duplicate `view-transition-name` in the captured frame makes the
 * browser skip the whole transition. Provided by <App/>, which sees the
 * real location (cards render under the background location).
 */
export const OpenDetailContext = createContext<string | null>(null);

export function useOpenDetailPlatformId(): string | null {
  return useContext(OpenDetailContext);
}
