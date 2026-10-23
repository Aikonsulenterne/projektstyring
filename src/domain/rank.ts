// Fractional ranking keys: strings over base-36 digits compared byte-wise.
// A key is a fraction 0.<digits> without trailing zeros, so a new key can always
// be generated strictly between two neighbours without renumbering others.

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;

function digit(char: string | undefined): number {
  if (char === undefined) return 0;
  const value = DIGITS.indexOf(char);
  if (value < 0) throw new Error(`Invalid rank key character: ${char}`);
  return value;
}

/** Midpoint between fraction strings a (may be '') and b (null = 1.0). Requires a < b. */
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let i = 0;
    while (i < b.length && (a[i] ?? '0') === b[i]) i++;
    if (i > 0) return b.slice(0, i) + midpoint(a.slice(i), b.slice(i));
  }
  const da = digit(a[0]);
  const db = b !== null ? digit(b[0]) : BASE;
  if (db - da > 1) return DIGITS[Math.floor((da + db) / 2)]!;
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[da]! + midpoint(a.slice(1), null);
}

export function isValidRankKey(key: string): boolean {
  return /^[0-9a-z]*[1-9a-z]$/.test(key);
}

const APPEND_WIDTH = 4;

/** Small fixed step after `before`, so repeated appends do not grow keys quickly. */
function rankAfter(before: string): string {
  const head = before.padEnd(APPEND_WIDTH, '0').slice(0, APPEND_WIDTH);
  if (/^z+$/.test(head)) return midpoint(before, null);
  const digits = [...head].map(digit);
  let i = digits.length - 1;
  while (digits[i] === BASE - 1) digits[i--] = 0;
  digits[i]! += 1;
  // Truncating then adding one unit in the last position is strictly greater than `before`.
  return digits.map((d) => DIGITS[d]).join('').replace(/0+$/, '');
}

/** Returns a key strictly between `before` and `after` (either may be null for an open end). */
export function rankBetween(before: string | null, after: string | null): string {
  if (before !== null && after !== null && before >= after) {
    throw new Error(`rankBetween requires before < after (got ${before} >= ${after})`);
  }
  if (after === null && before !== null && before !== '') return rankAfter(before);
  return midpoint(before ?? '', after);
}

/** Evenly spaced keys for `count` items, used when (re)seeding an order. */
export function initialRanks(count: number): string[] {
  const keys: string[] = [];
  let previous: string | null = null;
  for (let i = 0; i < count; i++) {
    // Appending keeps keys short enough for fixtures and imports.
    previous = rankBetween(previous, null);
    keys.push(previous);
  }
  return keys;
}

/** Byte-wise comparison, identical to PostgreSQL COLLATE "C". */
export function compareRank(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
