// Shared type aliases for recharts callback signatures.
// recharts exposes ValueType = number | string | ReadonlyArray<number | string>
// and NameType = number | string. We use the concrete union here to avoid
// importing internal recharts types and to keep formatter params narrow.

/** Value passed to recharts Tooltip/formatter callbacks (may be undefined). */
export type RechartsValue = number | string | ReadonlyArray<number | string> | undefined;

/** Name passed to recharts Tooltip/formatter callbacks (may be undefined). */
export type RechartsName = number | string | undefined;

/** Value passed to recharts tickFormatter callbacks (axis ticks). */
export type RechartsTickValue = number | string | Date;