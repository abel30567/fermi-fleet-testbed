/**
 * Exact rational cosine using a precomputed factorial/Taylor coefficient table
 * and memoized rational series evaluation.
 *
 * Rationals are represented as `{ num: BigInt, den: BigInt }` in lowest terms
 * with strictly positive denominator (`den > 0n`), and zero represented as
 * `{ num: 0n, den: 1n }`.
 *
 * By the Lindemann–Weierstrass theorem, `x = 0` is the only rational argument
 * for which `cos(x)` is exactly rational (`cos(0) = 1/1`); this value is served
 * directly from a precomputed exact-value table. For all non-zero rational inputs,
 * `cos(x)` is evaluated via the truncated Maclaurin series
 * `sum_{k=0}^{n-1} (-1)^k * x^(2k) / (2k)!` using precomputed factorial tables,
 * Horner-form exact rational accumulation, even-function symmetry `cos(-x) = cos(x)`,
 * and a bounded LRU memoization cache.
 *
 * @module ops/trigonometric/cosRationalMemo
 */

/** Default minimum number of Maclaurin series terms when `terms` is not specified. */
const DEFAULT_MIN_TERMS = 12;

/** Number of precomputed even factorial entries `(2k)!` seeded at module load (`k = 0..31`). */
const INITIAL_TABLE_SIZE = 32;

/** Target truncation error bound `10^-18` used in automatic term selection. */
const AUTO_PRECISION_SCALE = 10n ** 18n;

/** Maximum number of cached rational results in the memoization table. */
const MAX_CACHE_SIZE = 1024;

/**
 * Precomputed table of even factorials: `EVEN_FACTORIALS[k] = (2k)!`.
 * Lazily extended if a computation requires `k >= EVEN_FACTORIALS.length`.
 * @type {bigint[]}
 */
const EVEN_FACTORIALS = [1n];

/**
 * Precomputed table of consecutive integer pair products:
 * `PAIR_PRODUCTS[k] = (2k - 1) * (2k)` for `k >= 1` (`PAIR_PRODUCTS[0] = 1n`).
 * Used by the Horner evaluator so each step performs a single BigInt lookup.
 * @type {bigint[]}
 */
const PAIR_PRODUCTS = [1n];

/**
 * Ensure the precomputed factorial and pair-product tables contain at least
 * `size` entries (`k = 0 .. size - 1`).
 *
 * @param {number} size - Required minimum table length.
 */
function ensureFactorialTable(size) {
	for (let k = EVEN_FACTORIALS.length; k < size; k++) {
		const pair = BigInt(2 * k - 1) * BigInt(2 * k);
		PAIR_PRODUCTS.push(pair);
		EVEN_FACTORIALS.push(EVEN_FACTORIALS[k - 1] * pair);
	}
}

// Seed precomputed tables at module load time.
ensureFactorialTable(INITIAL_TABLE_SIZE);

/**
 * Precomputed exact rational lookup table for known exact values.
 * Keys are canonical `absNum/den` strings.
 * @type {Map<string, Readonly<{ num: bigint, den: bigint }>>}
 */
const EXACT_VALUE_TABLE = new Map([
	['0/1', Object.freeze({ num: 1n, den: 1n })],
]);

/**
 * Bounded LRU memoization cache mapping `${absNum}/${den}:${terms}` to
 * frozen canonical `{ num: bigint, den: bigint }` results.
 * @type {Map<string, Readonly<{ num: bigint, den: bigint }>>}
 */
const MEMO_CACHE = new Map();

/**
 * Compute the non-negative greatest common divisor of two BigInts using
 * the Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const t = x % y;
		x = y;
		y = t;
	}
	return x;
}

/**
 * Reduce a `(num, den)` pair to canonical lowest terms with `den > 0n`
 * and zero normalized to `{ num: 0n, den: 1n }`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(num, den) {
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}
	let n = num;
	let d = den;
	if (d < 0n) {
		n = -n;
		d = -d;
	}
	const g = gcd(n, d);
	return { num: n / g, den: d / g };
}

/**
 * Validate and normalize an input rational `{ num: BigInt, den: BigInt }`.
 *
 * @param {unknown} x
 * @returns {{ num: bigint, den: bigint }}
 */
function validateRational(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Input must be a rational object of shape { num: BigInt, den: BigInt }');
	}
	const { num, den } = /** @type {{ num: unknown, den: unknown }} */ (x);
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError('Rational properties "num" and "den" must both be BigInt values');
	}
	if (den === 0n) {
		throw new RangeError('Rational denominator must not be zero');
	}
	return normalizeRational(num, den);
}

/**
 * Parse and validate the optional second parameter (either an integer term count
 * or an options object `{ terms?: number, useCache?: boolean }`).
 *
 * @param {number | { terms?: number, useCache?: boolean } | undefined} optionsOrTerms
 * @returns {{ terms: number | undefined, useCache: boolean }}
 */
function validateOptions(optionsOrTerms) {
	if (optionsOrTerms === undefined) {
		return { terms: undefined, useCache: true };
	}
	if (typeof optionsOrTerms === 'number') {
		if (!Number.isSafeInteger(optionsOrTerms) || optionsOrTerms < 1) {
			throw new RangeError('terms must be a positive safe integer');
		}
		return { terms: optionsOrTerms, useCache: true };
	}
	if (optionsOrTerms === null || typeof optionsOrTerms !== 'object' || Array.isArray(optionsOrTerms)) {
		throw new TypeError('options must be a positive integer or an options object');
	}
	const { terms, useCache = true } = /** @type {{ terms?: unknown, useCache?: unknown }} */ (optionsOrTerms);
	if (terms !== undefined) {
		if (typeof terms !== 'number' || !Number.isSafeInteger(terms) || terms < 1) {
			throw new RangeError('options.terms must be a positive safe integer');
		}
	}
	if (typeof useCache !== 'boolean') {
		throw new TypeError('options.useCache must be a boolean');
	}
	return { terms, useCache };
}

/**
 * Choose an automatic Maclaurin term count `n >= DEFAULT_MIN_TERMS` so that
 * the alternating-series remainder bound `|x|^(2n) / (2n)! < 10^-18` holds
 * in exact BigInt arithmetic.
 *
 * @param {bigint} p2 - Square of the canonical absolute numerator `|num|^2`.
 * @param {bigint} q2 - Square of the canonical denominator `den^2`.
 * @returns {number}
 */
function selectAutoTerms(p2, q2) {
	// Ensure we are past the series peak (where p2 / (q2 * (2k-1)*(2k)) < 1)
	// and the first omitted term is smaller than 10^-18.
	let k = 0;
	let pPow = 1n; // p2^k
	let qPow = 1n; // q2^k

	while (true) {
		k++;
		ensureFactorialTable(k + 1);
		pPow *= p2;
		qPow *= q2;
		if (
			k >= DEFAULT_MIN_TERMS &&
			p2 < q2 * PAIR_PRODUCTS[k] &&
			pPow * AUTO_PRECISION_SCALE < qPow * EVEN_FACTORIALS[k]
		) {
			return k;
		}
	}
}

/**
 * Evaluate the `terms`-term Maclaurin polynomial for `cos(p / q)` in exact
 * rational arithmetic using Horner's scheme and the precomputed pair-product table.
 *
 * @param {bigint} p2 - `(|num|)^2`
 * @param {bigint} q2 - `den^2`
 * @param {number} terms - Positive integer number of series terms.
 * @returns {{ num: bigint, den: bigint }}
 */
function evaluateCosSeries(p2, q2, terms) {
	ensureFactorialTable(terms);
	let num = 1n;
	let den = 1n;
	for (let k = terms - 1; k >= 1; k--) {
		const nextDen = den * q2 * PAIR_PRODUCTS[k];
		num = nextDen - num * p2;
		den = nextDen;
	}
	return normalizeRational(num, den);
}

/**
 * Read an entry from the bounded LRU memoization cache, refreshing its recency.
 *
 * @param {string} key
 * @returns {{ num: bigint, den: bigint } | undefined}
 */
function cacheGet(key) {
	const hit = MEMO_CACHE.get(key);
	if (hit === undefined) {
		return undefined;
	}
	MEMO_CACHE.delete(key);
	MEMO_CACHE.set(key, hit);
	return { num: hit.num, den: hit.den };
}

/**
 * Store a canonical rational result in the bounded LRU memoization cache.
 *
 * @param {string} key
 * @param {{ num: bigint, den: bigint }} value
 */
function cacheSet(key, value) {
	if (MEMO_CACHE.has(key)) {
		MEMO_CACHE.delete(key);
	} else if (MEMO_CACHE.size >= MAX_CACHE_SIZE) {
		const oldestKey = MEMO_CACHE.keys().next().value;
		MEMO_CACHE.delete(oldestKey);
	}
	MEMO_CACHE.set(key, Object.freeze({ num: value.num, den: value.den }));
}

/**
 * Compute `cos(x)` over exact rationals `{ num: BigInt, den: BigInt }` in
 * lowest terms using a precomputed factorial/exact-value table and memoization cache.
 *
 * @param {{ num: bigint, den: bigint }} x - Exact rational angle in radians.
 * @param {number | { terms?: number, useCache?: boolean }} [options] - Optional
 *   positive integer number of Maclaurin terms, or an options object:
 *   - `terms`: exact number of Maclaurin series terms to sum (if omitted, chosen
 *     automatically to achieve truncation error `< 10^-18` with at least 12 terms).
 *   - `useCache`: whether to read/write the memoization cache (default `true`).
 * @returns {{ num: bigint, den: bigint }} Exact rational approximation (or exact
 *   value for `x = 0`) in lowest terms with positive denominator.
 * @throws {TypeError} If `x` is not a valid `{ num: BigInt, den: BigInt }` object
 *   or if `options` has an invalid type.
 * @throws {RangeError} If `x.den === 0n` or `terms` is not a positive safe integer.
 */
export function cosRationalMemo(x, options) {
	const norm = validateRational(x);
	const { terms: requestedTerms, useCache } = validateOptions(options);

	// Exploit even symmetry: cos(-x) === cos(x)
	const absNum = norm.num < 0n ? -norm.num : norm.num;
	const exactKey = `${absNum}/${norm.den}`;

	// Serve precomputed exact rational values directly (e.g., cos(0) = 1/1).
	const exactHit = EXACT_VALUE_TABLE.get(exactKey);
	if (exactHit !== undefined) {
		return { num: exactHit.num, den: exactHit.den };
	}

	const p2 = absNum * absNum;
	const q2 = norm.den * norm.den;
	const effectiveTerms = requestedTerms ?? selectAutoTerms(p2, q2);
	const cacheKey = `${exactKey}:${effectiveTerms}`;

	if (useCache) {
		const cached = cacheGet(cacheKey);
		if (cached !== undefined) {
			return cached;
		}
	}

	const result = evaluateCosSeries(p2, q2, effectiveTerms);

	if (useCache) {
		cacheSet(cacheKey, result);
	}

	return { num: result.num, den: result.den };
}
