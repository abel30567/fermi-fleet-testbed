/**
 * Fixed-point scale factor (`10^18`) used to represent non-integer quotients
 * as exact BigInt values.
 * @type {bigint}
 */
export const SCALE = 10n ** 18n;

/**
 * Maximum divisor included in the precomputed reciprocal quotient/remainder table.
 * @type {number}
 */
const RECIPROCAL_TABLE_LIMIT = 256;

/**
 * Maximum magnitude for both operands in the precomputed 2D small-pair lookup table.
 * @type {number}
 */
const SMALL_PAIR_LIMIT = 32;

/**
 * Maximum number of canonical `(absA, absB)` entries retained in the LRU memo cache.
 * @type {number}
 */
const MAX_CACHE_SIZE = 4096;

/**
 * Precomputed reciprocal tables for `1 <= d <= RECIPROCAL_TABLE_LIMIT`:
 * `SCALE === RECIPROCAL_QUOT[d] * BigInt(d) + RECIPROCAL_REM[d]`.
 *
 * For any `absA >= 0n` and `1 <= d <= RECIPROCAL_TABLE_LIMIT`:
 * `(absA * SCALE) / d === absA * RECIPROCAL_QUOT[d] + (absA * RECIPROCAL_REM[d]) / d`.
 * When `RECIPROCAL_REM[d] === 0n`, division reduces to a single BigInt multiplication.
 */
const RECIPROCAL_QUOT = new Array(RECIPROCAL_TABLE_LIMIT + 1);
const RECIPROCAL_REM = new Array(RECIPROCAL_TABLE_LIMIT + 1);

for (let d = 1; d <= RECIPROCAL_TABLE_LIMIT; d++) {
	const bd = BigInt(d);
	RECIPROCAL_QUOT[d] = SCALE / bd;
	RECIPROCAL_REM[d] = SCALE % bd;
}

/**
 * Precomputed 2D lookup table of exact fixed-point magnitudes `(a * SCALE) / b`
 * for `0 <= a <= SMALL_PAIR_LIMIT` and `1 <= b <= SMALL_PAIR_LIMIT`.
 */
const SMALL_DIV_TABLE = Array.from({ length: SMALL_PAIR_LIMIT + 1 }, (_, a) => {
	const row = new Array(SMALL_PAIR_LIMIT + 1);
	const ba = BigInt(a);
	for (let b = 1; b <= SMALL_PAIR_LIMIT; b++) {
		const q = RECIPROCAL_QUOT[b];
		const r = RECIPROCAL_REM[b];
		row[b] = r === 0n ? ba * q : ba * q + (ba * r) / BigInt(b);
	}
	return row;
});

/**
 * Bounded LRU memoization cache mapping `"<absA>/<absB>"` to `(absA * SCALE) / absB`.
 * @type {Map<string, bigint>}
 */
const memoCache = new Map();

/**
 * Divides two exact `BigInt` integers and returns the result as a fixed-point
 * `BigInt` scaled by `10^18` (truncated toward zero, matching `BigInt` division
 * semantics), using precomputed small-pair and reciprocal lookup tables backed
 * by a bounded LRU memoization cache.
 *
 * Mathematically computes `trunc((a / b) * 10^18) === (a * 10n ** 18n) / b`.
 *
 * @param {bigint} a - The exact BigInt dividend.
 * @param {bigint} b - The exact non-zero BigInt divisor.
 * @returns {bigint} The fixed-point quotient scaled by `10^18`, truncated toward zero.
 * @throws {TypeError} If either `a` or `b` is not a `bigint`.
 * @throws {RangeError} If `b` is `0n` (division by zero).
 */
export function divideBigIntMemo(a, b) {
	if (typeof a !== 'bigint' || typeof b !== 'bigint') {
		throw new TypeError(
			`divideBigIntMemo expects BigInt arguments, received (${typeof a}, ${typeof b})`
		);
	}
	if (b === 0n) {
		throw new RangeError('Division by zero');
	}
	if (a === 0n) {
		return 0n;
	}

	const negative = (a < 0n) !== (b < 0n);
	const absA = a < 0n ? -a : a;
	const absB = b < 0n ? -b : b;

	// Fast paths for trivial identities.
	if (absB === 1n) {
		const mag = absA * SCALE;
		return negative ? -mag : mag;
	}
	if (absA === absB) {
		return negative ? -SCALE : SCALE;
	}

	// Fast path 1: direct O(1) lookup in the precomputed 2D small-pair table.
	if (absA <= BigInt(SMALL_PAIR_LIMIT) && absB <= BigInt(SMALL_PAIR_LIMIT)) {
		const mag = SMALL_DIV_TABLE[Number(absA)][Number(absB)];
		return negative ? -mag : mag;
	}

	// Fast path 2: bounded LRU memoization cache keyed by canonical magnitudes.
	const cacheKey = `${absA}/${absB}`;
	const cached = memoCache.get(cacheKey);
	if (cached !== undefined) {
		// Refresh recency for LRU ordering.
		memoCache.delete(cacheKey);
		memoCache.set(cacheKey, cached);
		return negative ? -cached : cached;
	}

	// Compute magnitude using the precomputed reciprocal table when possible,
	// falling back to exact BigInt scaled division for larger divisors.
	let mag;
	if (absB <= BigInt(RECIPROCAL_TABLE_LIMIT)) {
		const idx = Number(absB);
		const q = RECIPROCAL_QUOT[idx];
		const r = RECIPROCAL_REM[idx];
		mag = r === 0n ? absA * q : absA * q + (absA * r) / absB;
	} else {
		mag = (absA * SCALE) / absB;
	}

	// Store in bounded LRU cache.
	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value;
		memoCache.delete(oldestKey);
	}
	memoCache.set(cacheKey, mag);

	return negative ? -mag : mag;
}
