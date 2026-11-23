/**
 * @fileoverview Table-driven and memoized exact summation over rational numbers.
 *
 * Rationals are represented as `{ num: BigInt, den: BigInt }` in canonical lowest terms:
 * - `den > 0n`
 * - `gcd(|num|, den) === 1n`
 * - Zero is uniquely represented as `{ num: 0n, den: 1n }`
 *
 * Implementation highlights:
 * - Precomputed small-integer GCD lookup table (`0..64`) for O(1) small reductions.
 * - Precomputed harmonic prefix table (`H_1..H_32`) seeded into the sequence memo cache.
 * - Bounded memoization caches for normalized rational pair additions (commutative)
 *   and canonical sequence/prefix sums.
 * - Balanced pairwise (divide-and-conquer) summation for uncached slices to minimize
 *   intermediate BigInt growth.
 */

const ZERO = Object.freeze({ num: 0n, den: 1n });

// Precomputed GCD lookup table for non-negative integers in [0, SMALL_GCD_LIMIT].
const SMALL_GCD_LIMIT = 64;
const SMALL_GCD_LIMIT_BIG = BigInt(SMALL_GCD_LIMIT);
const SMALL_GCD_STRIDE = SMALL_GCD_LIMIT + 1;
const SMALL_GCD_TABLE = new Array(SMALL_GCD_STRIDE * SMALL_GCD_STRIDE);

for (let a = 0; a <= SMALL_GCD_LIMIT; a++) {
	for (let b = 0; b <= SMALL_GCD_LIMIT; b++) {
		let x = a;
		let y = b;
		while (y !== 0) {
			const t = x % y;
			x = y;
			y = t;
		}
		SMALL_GCD_TABLE[a * SMALL_GCD_STRIDE + b] = BigInt(x);
	}
}

// Bounded memoization caches.
const PAIR_CACHE_LIMIT = 8192;
const PAIR_KEY_MAX_LEN = 128;
const SEQ_CACHE_LIMIT = 4096;
const SEQ_MEMO_MAX_TERMS = 256;
const SEQ_MEMO_MAX_KEY_LEN = 2048;

/** @type {Map<string, Readonly<{ num: bigint, den: bigint }>>} */
const pairAddCache = new Map();

/** @type {Map<string, Readonly<{ num: bigint, den: bigint }>>} */
const sequenceCache = new Map();

/**
 * Inserts an entry into a bounded Map cache using FIFO eviction.
 *
 * @template K, V
 * @param {Map<K, V>} cache
 * @param {K} key
 * @param {V} value
 * @param {number} limit
 */
function cachePut(cache, key, value, limit) {
	if (cache.has(key)) {
		return;
	}
	if (cache.size >= limit) {
		const oldestKey = cache.keys().next().value;
		cache.delete(oldestKey);
	}
	cache.set(key, value);
}

/**
 * Computes the absolute value of a BigInt.
 *
 * @param {bigint} x
 * @returns {bigint}
 */
function absBigInt(x) {
	return x < 0n ? -x : x;
}

/**
 * Computes the greatest common divisor of two non-negative BigInts,
 * using the precomputed small-GCD table whenever operands enter [0, 64].
 *
 * @param {bigint} a Non-negative BigInt.
 * @param {bigint} b Non-negative BigInt.
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	while (b !== 0n) {
		if (a <= SMALL_GCD_LIMIT_BIG && b <= SMALL_GCD_LIMIT_BIG) {
			return SMALL_GCD_TABLE[Number(a) * SMALL_GCD_STRIDE + Number(b)];
		}
		const r = a % b;
		a = b;
		b = r;
	}
	return a;
}

/**
 * Validates and normalizes an input rational `{ num: BigInt, den: BigInt }`
 * to canonical lowest terms with positive denominator.
 *
 * @param {unknown} value
 * @param {string} context Description for error messages.
 * @returns {Readonly<{ num: bigint, den: bigint }>}
 */
function validateAndNormalize(value, context) {
	if (typeof value !== 'object' || value === null) {
		throw new TypeError(`${context} must be a non-null object with BigInt num and den`);
	}
	const { num, den } = /** @type {{ num: unknown, den: unknown }} */ (value);
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${context} must have BigInt properties num and den`);
	}
	if (den === 0n) {
		throw new RangeError(`${context} has zero denominator`);
	}
	if (num === 0n) {
		return ZERO;
	}
	let n = num;
	let d = den;
	if (d < 0n) {
		n = -n;
		d = -d;
	}
	const g = gcdBigInt(absBigInt(n), d);
	if (g === 1n) {
		return Object.freeze({ num: n, den: d });
	}
	return Object.freeze({ num: n / g, den: d / g });
}

/**
 * Adds two already-normalized rationals using Knuth's reduced-denominator formula
 * and a commutative memoization cache.
 *
 * @param {Readonly<{ num: bigint, den: bigint }>} a
 * @param {Readonly<{ num: bigint, den: bigint }>} b
 * @returns {Readonly<{ num: bigint, den: bigint }>}
 */
function addRationalMemo(a, b) {
	if (a.num === 0n) return b;
	if (b.num === 0n) return a;
	if (a.den === b.den && a.num === -b.num) return ZERO;

	const ka = `${a.num}/${a.den}`;
	const kb = `${b.num}/${b.den}`;
	const useCache = ka.length + kb.length <= PAIR_KEY_MAX_LEN;
	let pairKey = '';
	if (useCache) {
		pairKey = ka <= kb ? `${ka}+${kb}` : `${kb}+${ka}`;
		const cached = pairAddCache.get(pairKey);
		if (cached !== undefined) {
			return cached;
		}
	}

	// For reduced a = p/(g*u), b = q/(g*v) with g = gcd(a.den, b.den):
	// num = p*v + q*u, den = g*u*v, and gcd(|num|, den) = gcd(|num|, g).
	const g = gcdBigInt(a.den, b.den);
	const aDenOverG = a.den / g;
	const bDenOverG = b.den / g;
	const rawNum = a.num * bDenOverG + b.num * aDenOverG;

	let result;
	if (rawNum === 0n) {
		result = ZERO;
	} else if (g === 1n) {
		result = Object.freeze({ num: rawNum, den: a.den * b.den });
	} else {
		const g2 = gcdBigInt(absBigInt(rawNum), g);
		result = Object.freeze({
			num: rawNum / g2,
			den: aDenOverG * (b.den / g2),
		});
	}

	if (useCache) {
		cachePut(pairAddCache, pairKey, result, PAIR_CACHE_LIMIT);
	}
	return result;
}

/**
 * Sums a slice `terms[lo..hi)` of normalized rationals via balanced pairwise reduction.
 *
 * @param {ReadonlyArray<Readonly<{ num: bigint, den: bigint }>>} terms
 * @param {number} lo Inclusive start index.
 * @param {number} hi Exclusive end index.
 * @returns {Readonly<{ num: bigint, den: bigint }>}
 */
function sumSliceBalanced(terms, lo, hi) {
	const len = hi - lo;
	if (len <= 0) return ZERO;
	if (len === 1) return terms[lo];
	if (len === 2) return addRationalMemo(terms[lo], terms[lo + 1]);
	const mid = lo + (len >> 1);
	return addRationalMemo(
		sumSliceBalanced(terms, lo, mid),
		sumSliceBalanced(terms, mid, hi),
	);
}

// Precompute canonical harmonic partial sums H_1..H_32 into sequenceCache.
const PRECOMPUTED_HARMONIC_MAX = 32;
{
	let acc = ZERO;
	let prefixKey = '';
	for (let k = 1; k <= PRECOMPUTED_HARMONIC_MAX; k++) {
		const term = Object.freeze({ num: 1n, den: BigInt(k) });
		acc = addRationalMemo(acc, term);
		prefixKey = k === 1 ? `1/${k}` : `${prefixKey},1/${k}`;
		cachePut(sequenceCache, prefixKey, acc, SEQ_CACHE_LIMIT);
	}
}

/**
 * Sums an array of already-normalized rationals with sequence/prefix memoization.
 *
 * @param {ReadonlyArray<Readonly<{ num: bigint, den: bigint }>>} normalized
 * @returns {Readonly<{ num: bigint, den: bigint }>}
 */
function sumNormalizedMemo(normalized) {
	const n = normalized.length;
	if (n === 0) return ZERO;
	if (n === 1) return normalized[0];

	/** @type {string[]} */
	const prefixKeys = [];
	if (n <= SEQ_MEMO_MAX_TERMS) {
		let key = '';
		for (let i = 0; i < n; i++) {
			const token = `${normalized[i].num}/${normalized[i].den}`;
			const nextLen = key.length + (i === 0 ? 0 : 1) + token.length;
			if (nextLen > SEQ_MEMO_MAX_KEY_LEN) {
				break;
			}
			key = i === 0 ? token : `${key},${token}`;
			prefixKeys.push(key);
		}
	}

	// Fast path: full sequence memo hit.
	if (prefixKeys.length === n) {
		const fullHit = sequenceCache.get(prefixKeys[n - 1]);
		if (fullHit !== undefined) {
			return fullHit;
		}
	}

	// Prefix reuse: find the longest cached prefix and add the remaining tail.
	let hitIdx = -1;
	for (let i = prefixKeys.length - 1; i >= 1; i--) {
		if (sequenceCache.has(prefixKeys[i])) {
			hitIdx = i;
			break;
		}
	}

	let result;
	if (hitIdx !== -1) {
		const prefixSum = /** @type {Readonly<{ num: bigint, den: bigint }>} */ (
			sequenceCache.get(prefixKeys[hitIdx])
		);
		const tailSum = sumSliceBalanced(normalized, hitIdx + 1, n);
		result = addRationalMemo(prefixSum, tailSum);
	} else {
		result = sumSliceBalanced(normalized, 0, n);
	}

	if (prefixKeys.length === n) {
		cachePut(sequenceCache, prefixKeys[n - 1], result, SEQ_CACHE_LIMIT);
	}

	return result;
}

/**
 * Validates range bounds for 3-argument range summation mode.
 *
 * @param {unknown} start
 * @param {unknown} end
 * @returns {'number' | 'bigint'}
 */
function validateRangeBounds(start, end) {
	const startIsBig = typeof start === 'bigint';
	const endIsBig = typeof end === 'bigint';
	if (startIsBig && endIsBig) {
		return 'bigint';
	}
	const startIsSafeInt = typeof start === 'number' && Number.isSafeInteger(start);
	const endIsSafeInt = typeof end === 'number' && Number.isSafeInteger(end);
	if (startIsSafeInt && endIsSafeInt) {
		return 'number';
	}
	throw new TypeError('start and end must both be safe integers or both be BigInts');
}

/**
 * Computes the exact discrete sum of rational numbers `{ num: BigInt, den: BigInt }`
 * returned in canonical lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`, zero as `0n/1n`),
 * backed by a precomputed small-GCD table, precomputed harmonic prefix table,
 * commutative pairwise addition memoization, and sequence/prefix sum memoization.
 *
 * Supports two calling conventions:
 * 1. `summationRationalMemo(terms)` — sums an iterable (e.g. Array, Generator, Set)
 *    of `{ num: BigInt, den: BigInt }` rationals.
 * 2. `summationRationalMemo(start, end, termFn)` — sums `termFn(k)` for integer/BigInt
 *    indices `k` from `start` through `end` inclusive (returns `{ num: 0n, den: 1n }` if `start > end`).
 *
 * @overload
 * @param {Iterable<{ num: bigint, den: bigint }>} terms Iterable of exact rationals.
 * @returns {{ num: bigint, den: bigint }} Exact sum in lowest terms.
 */
/**
 * @overload
 * @param {number} start Inclusive start index (safe integer).
 * @param {number} end Inclusive end index (safe integer).
 * @param {(k: number) => { num: bigint, den: bigint }} termFn Function producing each rational term.
 * @returns {{ num: bigint, den: bigint }} Exact sum in lowest terms.
 */
/**
 * @overload
 * @param {bigint} start Inclusive start index (BigInt).
 * @param {bigint} end Inclusive end index (BigInt).
 * @param {(k: bigint) => { num: bigint, den: bigint }} termFn Function producing each rational term.
 * @returns {{ num: bigint, den: bigint }} Exact sum in lowest terms.
 */
/**
 * @param {Iterable<{ num: bigint, den: bigint }> | number | bigint} termsOrStart
 * @param {number | bigint} [end]
 * @param {(k: any) => { num: bigint, den: bigint }} [termFn]
 * @returns {{ num: bigint, den: bigint }} Exact sum in lowest terms.
 * @throws {TypeError} If arguments, iterable, bounds, termFn, or rational elements have invalid types.
 * @throws {RangeError} If any rational term has a zero denominator (`den === 0n`).
 */
export function summationRationalMemo(termsOrStart, end, termFn) {
	if (arguments.length !== 1 && arguments.length !== 3) {
		throw new TypeError(
			'summationRationalMemo expects either (terms) or (start, end, termFn)',
		);
	}

	/** @type {Readonly<{ num: bigint, den: bigint }>[]} */
	const normalized = [];

	if (arguments.length === 1) {
		if (
			termsOrStart === null ||
			typeof termsOrStart !== 'object' ||
			typeof (/** @type {any} */ (termsOrStart)[Symbol.iterator]) !== 'function'
		) {
			throw new TypeError('terms must be a non-null iterable object');
		}
		let index = 0;
		for (const item of /** @type {Iterable<unknown>} */ (termsOrStart)) {
			normalized.push(validateAndNormalize(item, `terms[${index}]`));
			index++;
		}
	} else {
		const mode = validateRangeBounds(termsOrStart, end);
		if (typeof termFn !== 'function') {
			throw new TypeError('termFn must be a function');
		}
		if (mode === 'bigint') {
			const s = /** @type {bigint} */ (termsOrStart);
			const e = /** @type {bigint} */ (end);
			for (let k = s; k <= e; k += 1n) {
				normalized.push(validateAndNormalize(termFn(k), `termFn(${k}n)`));
			}
		} else {
			const s = /** @type {number} */ (termsOrStart);
			const e = /** @type {number} */ (end);
			for (let k = s; k <= e; k += 1) {
				normalized.push(validateAndNormalize(termFn(k), `termFn(${k})`));
			}
		}
	}

	const res = sumNormalizedMemo(normalized);
	// Always return a fresh object so caller mutations cannot corrupt memoized tables.
	return { num: res.num, den: res.den };
}
