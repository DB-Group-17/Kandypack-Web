'use client';

/**
 * @file components/LocalDateTime.tsx
 * @description Date-time text that is always shown in the viewer's own timezone, for use inside
 * server components (Docs/11_ui-rules.md §12).
 *
 * Why it exists: a server component formats on the server, whose timezone (UTC in production)
 * is not the viewer's. This client component renders the same text on the server for the first
 * paint (in UTC), then switches to the browser's local time right after hydration, so every page
 * shows the same local time.
 * Client pages should call `formatDateTime` from `@/lib/format` directly instead.
 */

import React, { useSyncExternalStore } from 'react';
import { formatDateTime, type DateInput } from '@/lib/format';

interface LocalDateTimeProps {
  /** Date-like value from the API (ISO string, date-only string, MySQL datetime or Date). */
  value: DateInput;
}

/** The value never changes after load, so there is nothing to subscribe to. */
const subscribe = (): (() => void) => () => {};

/**
 * Renders `value` as "Oct 12, 2026, 01:30 PM" in the viewer's timezone.
 *
 * `useSyncExternalStore` supplies two snapshots: the server snapshot (used for the server render
 * and for hydration) is formatted in UTC so it is identical on both sides, and the client snapshot
 * is formatted in the viewer's timezone, which React switches to right after hydration.
 *
 * @param props.value - The value to format
 * @returns A span with the formatted text
 */
export default function LocalDateTime({ value }: LocalDateTimeProps): React.JSX.Element {
  const text = useSyncExternalStore(
    subscribe,
    () => formatDateTime(value),
    () => formatDateTime(value, 'UTC')
  );
  return <span>{text}</span>;
}
