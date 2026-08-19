import { Link, type LinkProps } from "react-router";
import { useTransitionNavigate } from "@/lib/view-transition";

/**
 * <Link> that navigates through the data router with the View Transitions
 * morph. A real anchor, so cmd/ctrl/middle-click, copy-link, and target
 * semantics all keep working — only a plain unmodified left click is
 * intercepted. (The stock `viewTransition` prop can't be used here: links
 * inside descendant <Routes> reach the declarative navigator, which drops
 * the option — see lib/view-transition.ts.)
 */
export function TransitionLink({
  to,
  state,
  replace,
  onClick,
  target,
  ...rest
}: LinkProps) {
  const navigate = useTransitionNavigate();
  return (
    <Link
      to={to}
      state={state}
      replace={replace}
      target={target}
      onClick={(e) => {
        onClick?.(e);
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.altKey ||
          e.ctrlKey ||
          e.shiftKey ||
          (target && target !== "_self")
        )
          return;
        e.preventDefault();
        navigate(to, { state, replace });
      }}
      {...rest}
    />
  );
}
