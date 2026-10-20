/**
 * Shared Recharts styling. Previously each dashboard page carried its own
 * copy of these objects (16 copies, 4 slightly different palettes).
 */

/** Pass as `contentStyle` on a Recharts <Tooltip>. */
export const darkTooltipStyle = {
  backgroundColor: "#111827",
  border: "1px solid #1F2937",
  borderRadius: "8px",
  color: "#F9FAFB",
  fontSize: "12px",
} as const;

/** Spread onto a Recharts <Tooltip> when both content and item styles are needed. */
export const darkTooltipProps = {
  contentStyle: darkTooltipStyle,
  itemStyle: { color: "#E2E8F0" },
} as const;
