# 0010 SWR hooks as the client data layer

Date: 2026-10-18. Status: accepted (adoption in progress).

## Context

Forty-seven dashboard pages each had their own `useEffect` + `fetch` +
`useState` block, with secondary fetches fired from inside the first one.
Every navigation refetched everything, errors were swallowed, and the
same boilerplate was the single largest source of duplicated code.

## Decision

`useApi<T>(url, options, realtimeTables)` in `src/hooks/use-api.ts` wraps
SWR with the API envelope, sensible refresh intervals and revalidation on
realtime events. Pages derive cross-data with `useMemo` from cached lists
instead of chaining requests. Search inputs are debounced with
`useDebouncedValue`. The eight main list pages are converted; detail and
AI pages follow the same pattern as they are touched.

## Consequences

- Navigating back to a list is instant and stays fresh.
- Mutations should call `mutate()` on the affected keys rather than
  refetching by hand.
