/**
 * Exact rational addition using precomputed small-value tables and an LRU memoization cache.
 *
 * Rationals are represented as `{ num: BigInt, den: BigInt }` and results are always returned
 * in canonical lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`, and `0` as `{ num: 0n, den: 1n }`).
 *
 * @module ops/arithmetic/addRationalMemo
 */

const SMALL_GCD_MAX = 64;
const SMALL_GCD_STRIDE = SMALL_GCD_MAX + 1;

/**
 * Precomputed GCD lookup table for non-negative integers in [0, SMALL_GCD_MAX].
 * @type {Uint8Array}
 */
const SMALL_GCD_TABLE = (() => {
	const table = new Uint8Array(SMALL_GCD_STRIDE * SMALL_GCD_STRIDE);
	for (let i = 0; i <= SMALL_GCD_MAX; i++) {
		for (let j = 0; j <= SMALL_GCD_MAX; j++) {
			let a = i;
			let b = j;
			while (b !== 0) {
				const t = a % b;
				a = b;
				b = t;
			}
			table[i * SMALL_GCD_STRIDE + j] = a;
		}
	}
	return table;
})();

const SMALL_GCD_MAX_BIGINT = BigInt(SMALL_GCD_MAX);

/**
 * Computes the non-negative greatest common divisor of two BigInts,
 * using `SMALL_GCD_TABLE` once operands fit within `[0, SMALL_GCD_MAX]`.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		if (x <= SMALL_GCD_MAX_BIGINT && y <= SMALL_GCD_MAX_BIGINT) {
			return BigInt(SMALL_GCD_TABLE[Number(x) * SMALL_GCD_STRIDE + Number(y)]);
		}
		const t = x % y;
		x = y;
		y = t;
	}
	return x;
}

/**
 * Validates and normalizes a rational object `{ num: bigint, den: bigint }`
 * into canonical lowest terms with `den > 0n`.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(value, name) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`${name} must be an object with bigint num and den properties`);
	}
	const { num, den } = value;
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${name}.num and ${name}.den must both be bigint`);
	}
	if (den === 0n) {
		throw new RangeError(`${name}.den must not be 0n`);
	}
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}

	let n = num;
	let d = den;
	if (d < 0n) {
		n = -n;
		d = -d;
	}

	const g = gcdBigInt(n, d);
	if (g === 1n) {
		return { num: n, den: d };
	}
	return { num: n / g, den: d / g };
}

/**
 * Computes the exact reduced sum of two already-normalized rationals.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function computeSumNormalized(a, b) {
	if (a.num === 0n) {
		return { num: b.num, den: b.den };
	}
	if (b.num === 0n) {
		return { num: a.num, den: a.den };
	}

	const g = gcdBigInt(a.den, b.den);
	const d1 = a.den / g;
	const d2 = b.den / g;
	const num = a.num * d2 + b.num * d1;
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}

	const g2 = gcdBigInt(num, g);
	return {
		num: num / g2,
		den: d1 * (b.den / g2),
	};
}

/**
 * Builds a canonical commutative cache key for two normalized rationals.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {string}
 */
function makeCacheKey(a, b) {
	const aFirst = a.num < b.num || (a.num === b.num && a.den <= b.den);
	const first = aFirst ? a : b;
	const second = aFirst ? b : a;
	return `${first.num}/${first.den}+${second.num}/${second.den}`;
}

/**
 * Precomputed addition table for canonical small rationals (`|num| <= 6`, `1 <= den <= 6`).
 * @type {Map<string, Readonly<{ num: bigint, den: bigint }>>}
 */
const PRECOMPUTED_SUM_TABLE = (() => {
	const table = new Map();
	const SMALL_LIMIT = 6;
	/** @type {Array<{ num: bigint, den: bigint }>} */
	const rationals = [];

	for (let d = 1; d <= SMALL_LIMIT; d++) {
		for (let n = -SMALL_LIMIT; n <= SMALL_LIMIT; n++) {
			if (n === 0 && d !== 1) continue;
			if (SMALL_GCD_TABLE[Math.abs(n) * SMALL_GCD_STRIDE + d] !== 1) continue;
			rationals.push({ num: BigInt(n), den: BigInt(d) });
		}
	}

	for (let i = 0; i < rationals.length; i++) {
		for (let j = i; j < rationals.length; j++) {
			const a = rationals[i];
			const b = rationals[j];
			const key = makeCacheKey(a, b);
			const sum = computeSumNormalized(a, b);
			table.set(key, Object.freeze(sum));
		}
	}

	return table;
})();

const MAX_MEMO_ENTRIES = 4096;

/**
 * Bounded LRU memoization cache for sums not covered by `PRECOMPUTED_SUM_TABLE`.
 * @type {Map<string, Readonly<{ num: bigint, den: bigint }>>}
 */
const MEMO_CACHE = new Map();

/**
 * Adds two exact rational numbers `{ num: BigInt, den: BigInt }` and returns
 * their sum in canonical lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`).
 *
 * Uses a precomputed small-GCD table, a precomputed small-rational sum table,
 * and a bounded commutative LRU memoization cache for larger rationals.
 *
 * @param {{ num: bigint, den: bigint }} a - First rational addend.
 * @param {{ num: bigint, den: bigint }} b - Second rational addend.
 * @returns {{ num: bigint, den: bigint }} The exact sum in lowest terms.
 * @throws {TypeError} If `a` or `b` is not an object with `bigint` `num` and `den` properties.
 * @throws {RangeError} If `a.den === 0n` or `b.den === 0n`.
 */
export function addRationalMemo(a, b) {
	const normA = normalizeRational(a, 'a');
	const normB = normalizeRational(b, 'b');

	if (normA.num === 0n) {
		return { num: normB.num, den: normB.den };
	}
	if (normB.num === 0n) {
		return { num: normA.num, den: normA.den };
	}

	const key = makeCacheKey(normA, normB);

	const precomputed = PRECOMPUTED_SUM_TABLE.get(key);
	if (precomputed !== undefined) {
		return { num: precomputed.num, den: precomputed.den };
	}

	const cached = MEMO_CACHE.get(key);
	if (cached !== undefined) {
		MEMO_CACHE.delete(key);
		MEMO_CACHE.set(key, cached);
		return { num: cached.num, den: cached.den };
	}

	const sum = computeSumNormalized(normA, normB);
	if (MEMO_CACHE.size >= MAX_MEMO_ENTRIES) {
		const oldestKey = MEMO_CACHE.keys().next().value;
		MEMO_CACHE.delete(oldestKey);
	}
	MEMO_CACHE.set(key, Object.freeze({ num: sum.num, den: sum.den }));
	return sum;
}
