/**
 * Exact rational vector dot product with precomputed small-GCD lookup table
 * and bounded canonical memoization caches.
 *
 * Each rational is represented as `{ num: bigint, den: bigint }` with `den !== 0n`.
 * Results are always returned in canonical lowest terms with `den > 0n`
 * (and `{ num: 0n, den: 1n }` for zero).
 *
 * @module ops/vector/dotProductRationalMemo
 */

/**
 * @typedef {Object} Rational
 * @property {bigint} num - Exact integer numerator.
 * @property {bigint} den - Exact non-zero integer denominator.
 */

const SMALL_GCD_LIMIT = 64;
const SMALL_GCD_STRIDE = SMALL_GCD_LIMIT + 1;
const SMALL_GCD_LIMIT_BIGINT = BigInt(SMALL_GCD_LIMIT);

/**
 * Precomputed lookup table for gcd(a, b) with 0 <= a, b <= SMALL_GCD_LIMIT.
 * @type {Uint8Array}
 */
const SMALL_GCD_TABLE = (() => {
	const table = new Uint8Array(SMALL_GCD_STRIDE * SMALL_GCD_STRIDE);
	for (let i = 0; i <= SMALL_GCD_LIMIT; i++) {
		table[i * SMALL_GCD_STRIDE] = i;
		table[i] = i;
	}
	for (let i = 1; i <= SMALL_GCD_LIMIT; i++) {
		for (let j = 1; j <= SMALL_GCD_LIMIT; j++) {
			table[i * SMALL_GCD_STRIDE + j] =
				i >= j
					? table[(i - j) * SMALL_GCD_STRIDE + j]
					: table[i * SMALL_GCD_STRIDE + (j - i)];
		}
	}
	return table;
})();

const ZERO_RATIONAL = Object.freeze({ num: 0n, den: 1n });
const MAX_DOT_CACHE_SIZE = 1024;
const MAX_PRODUCT_CACHE_SIZE = 4096;

/**
 * Memoization cache for canonical vector-pair dot products.
 * Keys are unordered canonical vector pair signatures (`min(kU,kV)|max(kU,kV)`).
 * Values are frozen canonical `{ num, den }` records.
 * @type {Map<string, Readonly<Rational>>}
 */
const dotProductCache = new Map();

/**
 * Memoization cache for pairwise products of canonical rationals.
 * Keys are unordered canonical rational pair signatures (`min(a,b)*max(a,b)`).
 * @type {Map<string, Readonly<Rational>>}
 */
const productCache = new Map();

/**
 * Computes the greatest common divisor of two non-negative BigInts,
 * using the precomputed small-GCD table whenever both operands fit.
 *
 * @param {bigint} a - Non-negative integer.
 * @param {bigint} b - Non-negative integer.
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	while (b !== 0n) {
		if (a <= SMALL_GCD_LIMIT_BIGINT && b <= SMALL_GCD_LIMIT_BIGINT) {
			return BigInt(SMALL_GCD_TABLE[Number(a) * SMALL_GCD_STRIDE + Number(b)]);
		}
		const r = a % b;
		a = b;
		b = r;
	}
	return a;
}

/**
 * Stores a key/value entry in a bounded Map using FIFO eviction.
 *
 * @template K, V
 * @param {Map<K, V>} cache
 * @param {number} maxSize
 * @param {K} key
 * @param {V} value
 */
function cacheSet(cache, maxSize, key, value) {
	if (cache.size >= maxSize) {
		const oldestKey = cache.keys().next().value;
		cache.delete(oldestKey);
	}
	cache.set(key, value);
}

/**
 * Validates and normalizes a rational object to canonical lowest terms (`den > 0n`).
 *
 * @param {unknown} value
 * @param {string} vectorName
 * @param {number} index
 * @returns {{ num: bigint, den: bigint, key: string }}
 */
function validateAndNormalizeRational(value, vectorName, index) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(
			`Expected rational object { num: bigint, den: bigint } at ${vectorName}[${index}]`,
		);
	}

	const { num, den } = /** @type {Record<string, unknown>} */ (value);
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(
			`Expected bigint num and den at ${vectorName}[${index}]`,
		);
	}
	if (den === 0n) {
		throw new RangeError(
			`Denominator must be non-zero at ${vectorName}[${index}]`,
		);
	}

	if (num === 0n) {
		return { num: 0n, den: 1n, key: '0/1' };
	}

	let n = num;
	let d = den;
	if (d < 0n) {
		n = -n;
		d = -d;
	}

	const absN = n < 0n ? -n : n;
	const g = gcdBigInt(absN, d);
	if (g > 1n) {
		n /= g;
		d /= g;
	}

	return { num: n, den: d, key: `${n}/${d}` };
}

/**
 * Validates a vector of rationals and returns its canonicalized elements and signature key.
 *
 * @param {unknown} vec
 * @param {string} name
 * @returns {{ items: Array<{ num: bigint, den: bigint, key: string }>, key: string }}
 */
function validateAndNormalizeVector(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`Expected ${name} to be an array of rationals`);
	}

	const len = vec.length;
	const items = new Array(len);
	const keyParts = new Array(len);

	for (let i = 0; i < len; i++) {
		if (!(i in vec)) {
			throw new TypeError(`Sparse array hole at ${name}[${i}]`);
		}
		const normalized = validateAndNormalizeRational(vec[i], name, i);
		items[i] = normalized;
		keyParts[i] = normalized.key;
	}

	return { items, key: keyParts.join(',') };
}

/**
 * Multiplies two already-normalized rationals with memoized pairwise products
 * and cross-cancellation to keep intermediate BigInts small.
 *
 * @param {{ num: bigint, den: bigint, key: string }} a
 * @param {{ num: bigint, den: bigint, key: string }} b
 * @returns {Readonly<Rational>}
 */
function multiplyCanonicalMemo(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return ZERO_RATIONAL;
	}

	const pairKey = a.key <= b.key ? `${a.key}*${b.key}` : `${b.key}*${a.key}`;
	const cached = productCache.get(pairKey);
	if (cached !== undefined) {
		return cached;
	}

	const absANum = a.num < 0n ? -a.num : a.num;
	const absBNum = b.num < 0n ? -b.num : b.num;

	const g1 = gcdBigInt(absANum, b.den);
	const g2 = gcdBigInt(absBNum, a.den);

	const num = (a.num / g1) * (b.num / g2);
	const den = (a.den / g2) * (b.den / g1);

	const result = Object.freeze({ num, den });
	cacheSet(productCache, MAX_PRODUCT_CACHE_SIZE, pairKey, result);
	return result;
}

/**
 * Adds two canonical rationals (both in lowest terms with positive denominators)
 * and returns their sum in canonical lowest terms.
 *
 * @param {Readonly<Rational>} a
 * @param {Readonly<Rational>} b
 * @returns {Readonly<Rational>}
 */
function addCanonical(a, b) {
	if (b.num === 0n) {
		return a;
	}
	if (a.num === 0n) {
		return b;
	}

	const g = gcdBigInt(a.den, b.den);
	const aDenReduced = a.den / g;
	const bDenReduced = b.den / g;

	const sumNum = a.num * bDenReduced + b.num * aDenReduced;
	if (sumNum === 0n) {
		return ZERO_RATIONAL;
	}

	// Since gcd(|a.num|, a.den) = 1, gcd(|b.num|, b.den) = 1, and gcd(aDenReduced, bDenReduced) = 1,
	// any common factor of sumNum and (aDenReduced * bDenReduced * g) must divide g.
	const absSumNum = sumNum < 0n ? -sumNum : sumNum;
	const h = g === 1n ? 1n : gcdBigInt(absSumNum, g);

	return Object.freeze({
		num: sumNum / h,
		den: aDenReduced * bDenReduced * (g / h),
	});
}

/**
 * Computes the exact vector dot product of two equal-length arrays of rationals
 * `{ num: bigint, den: bigint }`, returning the result in lowest terms with a
 * positive denominator.
 *
 * Uses a precomputed small-GCD table, canonical pairwise product memoization,
 * and commutative canonical vector-pair memoization. Always returns a fresh
 * `{ num, den }` object so caller mutations cannot corrupt internal caches.
 *
 * @param {ReadonlyArray<Rational>} u - First vector of exact rationals.
 * @param {ReadonlyArray<Rational>} v - Second vector of exact rationals.
 * @returns {Rational} Exact dot product in lowest terms (`den > 0n`).
 * @throws {TypeError} If either input is not an array or contains invalid rational elements.
 * @throws {RangeError} If vector lengths differ or any rational has a zero denominator.
 */
export function dotProductRationalMemo(u, v) {
	const normU = validateAndNormalizeVector(u, 'u');
	const normV = validateAndNormalizeVector(v, 'v');

	if (normU.items.length !== normV.items.length) {
		throw new RangeError(
			`Vector length mismatch: u has length ${normU.items.length}, v has length ${normV.items.length}`,
		);
	}

	if (normU.items.length === 0) {
		return { num: 0n, den: 1n };
	}

	const cacheKey =
		normU.key <= normV.key
			? `${normU.key}|${normV.key}`
			: `${normV.key}|${normU.key}`;

	const cached = dotProductCache.get(cacheKey);
	if (cached !== undefined) {
		return { num: cached.num, den: cached.den };
	}

	let acc = ZERO_RATIONAL;
	for (let i = 0; i < normU.items.length; i++) {
		const term = multiplyCanonicalMemo(normU.items[i], normV.items[i]);
		if (term.num !== 0n) {
			acc = addCanonical(acc, term);
		}
	}

	const frozenResult = acc === ZERO_RATIONAL ? ZERO_RATIONAL : acc;
	cacheSet(dotProductCache, MAX_DOT_CACHE_SIZE, cacheKey, frozenResult);
	return { num: frozenResult.num, den: frozenResult.den };
}
