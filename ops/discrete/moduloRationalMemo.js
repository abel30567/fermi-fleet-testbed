/**
 * @module ops/discrete/moduloRationalMemo
 * Exact discrete modulo over rationals `{ num: bigint, den: bigint }` in lowest terms,
 * accelerated by a precomputed small-integer GCD table and bounded memoization caches
 * for GCD, rational canonicalization, and normalized `(a, b)` modulo pairs.
 */

const GCD_TABLE_LIMIT = 64;
const GCD_TABLE_STRIDE = GCD_TABLE_LIMIT + 1;
const CACHE_MAX_ENTRIES = 4096;

/**
 * Precomputed GCD lookup table for all pairs `(x, y)` with `0 <= x, y <= 64`.
 * @type {BigInt64Array}
 */
const SMALL_GCD_TABLE = new BigInt64Array(GCD_TABLE_STRIDE * GCD_TABLE_STRIDE);

for (let x = 0; x <= GCD_TABLE_LIMIT; x++) {
	for (let y = 0; y <= GCD_TABLE_LIMIT; y++) {
		let g;
		if (y === 0) {
			g = BigInt(x);
		} else if (x === 0) {
			g = BigInt(y);
		} else if (x < y) {
			g = SMALL_GCD_TABLE[y * GCD_TABLE_STRIDE + x];
		} else {
			g = SMALL_GCD_TABLE[y * GCD_TABLE_STRIDE + (x % y)];
		}
		SMALL_GCD_TABLE[x * GCD_TABLE_STRIDE + y] = g;
	}
}

/** @type {Map<string, bigint>} */
const gcdCache = new Map();

/** @type {Map<string, Readonly<{ num: bigint, den: bigint }>>} */
const normalizeCache = new Map();

/** @type {Map<string, Readonly<{ num: bigint, den: bigint }>>} */
const moduloCache = new Map();

/**
 * Insert into a bounded Map with FIFO eviction when full.
 * @template V
 * @param {Map<string, V>} cache
 * @param {string} key
 * @param {V} value
 */
function cacheSet(cache, key, value) {
	if (cache.size >= CACHE_MAX_ENTRIES) {
		const oldestKey = cache.keys().next().value;
		if (oldestKey !== undefined) {
			cache.delete(oldestKey);
		}
	}
	cache.set(key, value);
}

/**
 * Compute non-negative greatest common divisor of two BigInts using the
 * precomputed small-GCD table and memoization cache.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	if (x === 0n) return y;
	if (y === 0n) return x;
	if (x < y) {
		const tmp = x;
		x = y;
		y = tmp;
	}

	const limit = BigInt(GCD_TABLE_LIMIT);
	if (x <= limit) {
		return SMALL_GCD_TABLE[Number(x) * GCD_TABLE_STRIDE + Number(y)];
	}

	const key = `${x},${y}`;
	const cached = gcdCache.get(key);
	if (cached !== undefined) {
		return cached;
	}

	let u = x;
	let v = y;
	while (v !== 0n) {
		if (u <= limit) {
			u = SMALL_GCD_TABLE[Number(u) * GCD_TABLE_STRIDE + Number(v)];
			break;
		}
		const r = u % v;
		u = v;
		v = r;
	}

	cacheSet(gcdCache, key, u);
	return u;
}

/**
 * Validate and canonicalize a rational `{ num: bigint, den: bigint }` into lowest terms
 * with strictly positive denominator (`0/1` for zero).
 * @param {{ num: bigint, den: bigint }} value
 * @param {string} name
 * @returns {Readonly<{ num: bigint, den: bigint }>}
 */
function validateAndNormalize(value, name) {
	if (
		typeof value !== "object" ||
		value === null ||
		Array.isArray(value) ||
		typeof value.num !== "bigint" ||
		typeof value.den !== "bigint"
	) {
		throw new TypeError(
			`${name} must be a rational object { num: bigint, den: bigint }`,
		);
	}

	if (value.den === 0n) {
		throw new RangeError(`${name}.den must be non-zero`);
	}

	if (value.num === 0n) {
		return Object.freeze({ num: 0n, den: 1n });
	}

	return normalizePair(value.num, value.den);
}

/**
 * Canonicalize raw `(num, den)` with `den !== 0n` to lowest terms with `den > 0n`,
 * using the memoized reduction cache.
 * @param {bigint} rawNum
 * @param {bigint} rawDen
 * @returns {Readonly<{ num: bigint, den: bigint }>}
 */
function normalizePair(rawNum, rawDen) {
	if (rawNum === 0n) {
		return Object.freeze({ num: 0n, den: 1n });
	}

	const key = `${rawNum}/${rawDen}`;
	const cached = normalizeCache.get(key);
	if (cached !== undefined) {
		return cached;
	}

	let num = rawNum;
	let den = rawDen;
	if (den < 0n) {
		num = -num;
		den = -den;
	}

	const g = gcdBigInt(num, den);
	const reduced = Object.freeze({ num: num / g, den: den / g });
	cacheSet(normalizeCache, key, reduced);
	return reduced;
}

/**
 * Compute exact floored rational modulo `a mod b = a - b * floor(a / b)`.
 *
 * Returns a rational `{ num: bigint, den: bigint }` in lowest terms with `den > 0n`,
 * satisfying:
 * - `0 <= r < b` when `b > 0`
 * - `b < r <= 0` when `b < 0`
 * - `a == q * b + r` for integer `q = floor(a / b)`
 *
 * Uses a precomputed small-GCD table plus bounded memoization caches for GCD,
 * rational reduction, and canonical `(a, b)` modulo pairs.
 *
 * @param {{ num: bigint, den: bigint }} a - Dividend rational.
 * @param {{ num: bigint, den: bigint }} b - Non-zero divisor rational.
 * @returns {{ num: bigint, den: bigint }} Remainder in lowest terms with positive denominator.
 * @throws {TypeError} If `a` or `b` is not a `{ num: bigint, den: bigint }` object.
 * @throws {RangeError} If either denominator is zero or if `b` is zero.
 */
export function moduloRationalMemo(a, b) {
	const na = validateAndNormalize(a, "a");
	const nb = validateAndNormalize(b, "b");

	if (nb.num === 0n) {
		throw new RangeError("Division by zero: modulo divisor b must be non-zero");
	}

	if (na.num === 0n) {
		return { num: 0n, den: 1n };
	}

	const cacheKey = `${na.num}/${na.den}%${nb.num}/${nb.den}`;
	const cached = moduloCache.get(cacheKey);
	if (cached !== undefined) {
		return { num: cached.num, den: cached.den };
	}

	// a / b = (na.num * nb.den) / (na.den * nb.num) = N / D
	// Floored remainder numerator over common denominator (na.den * nb.den) is
	// R = N - floor(N / D) * D, which equals (N % D) adjusted by +D when signs differ.
	const N = na.num * nb.den;
	const D = na.den * nb.num;
	let rem = N % D;

	if (rem !== 0n && (rem < 0n) !== (D < 0n)) {
		rem += D;
	}

	const result =
		rem === 0n
			? Object.freeze({ num: 0n, den: 1n })
			: normalizePair(rem, na.den * nb.den);

	cacheSet(moduloCache, cacheKey, result);
	return { num: result.num, den: result.den };
}
