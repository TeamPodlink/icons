# Changelog

## 0.2.0

### Breaking

- Removed `PodlinkProvider`, `usePodlinkConfig`, `PodlinkConfig`, and `PodlinkProviderProps` from `@podlink/icons/react`.
- React icons and badges are now prop-only and can render from Next.js App Router Server Components.

### Migration

- Pass defaults directly to `PlatformIcon` and `PlatformBadge`, or create app-local wrapper components for shared defaults.
- Use `@podlink/icons` for framework-agnostic SVG data and metadata in server-only helpers.

### Changed

- Added npm package metadata: `homepage`, `repository`, and `bugs`.
