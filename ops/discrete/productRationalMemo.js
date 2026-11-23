/**
 * Exact discrete product over rational numbers `{ num: bigint, den: bigint }`
 * in lowest terms using a table-driven, precomputed, and memoized engine.
 *
 * Precomputation & memoization layers:
 * 1. Precomputed small-integer GCD lookup table (`0..64`) for O(1) small reductions.
 * 2. Bounded memoization cache for normalizing individual unreduced rationals.
 * 3. Bounded memoization cache for cross-cancelled multiplication of reduced rationals.
 * 4. Canonical factor-multiset memoization cache with O(1) reciprocal cancellation
 *    and balanced binary-splitting multiplication.
 *
 * Zero external dependencies; ESM; Node 20+.
 */

const SMALL_GCD_LIMIT = 64;
const SMALL_GCD_STRIDE = SMALL_GCD_LIMIT + 1;
const SMALL_GCD_LIMIT_BIG = BigInt(SMALL_GCD_LIMIT);

/**
 * Precomputed lookup table of gcd(a, b) for 0 <= a, b <= SMALL_GCD_LIMIT.
 * @type {Uint8Array}
 */
const SMALL_GCD_TABLE = (() => {
	const table = new Uint8Array(SMALL_GCD_STRIDE * SMALL_GCD_STRIDE);
	for (let a = 0; a <= SMALL_GCD_LIMIT; a++) {
		for (let b = 0; b <= SMALL_GCD_LIMIT; b++) {
			let x = a;
			let y = b;
			while (y !== 0) {
				const t = x % y;
				x = y;
				y = t;
			}
			table[a * SMALL_GCD_STRIDE + b] = x;
		}
	}
	return table;
})();

const MAX_REDUCE_CACHE = 4096;
const MAX_MUL_CACHE = 4096;
const MAX_SEQ_CACHE = 2048;

/** @type {Map<string, Readonly<{ num: bigint, den: bigint }>>} */
const REDUCE_CACHE = new Map();

/** @type {Map<string, Readonly<{ num: bigint, den: bigint }>>} */
const MUL_CACHE = new Map();

/** @type {Map<string, Readonly<{ num: bigint, den: bigint }>>} */
const SEQ_CACHE = new Map();

/**
 * Insert into a bounded LRU-like Map cache.
 * @template V
 * @param {Map<string, V>} cache
 * @param {number} limit
 * @param {string} key
 * @param {V} value
 */
function cacheSet(cache, limit, key, value) {
	if (cache.size >= limit) {
		const oldestKey = cache.keys().next().value;
		cache.delete(oldestKey);
	}
	cache.set(key, value);
}

/**
 * Compute greatest common divisor of two non-negative BigInts,
 * using the precomputed lookup table whenever both operands fit in `0..64`.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		if (x <= SMALL_GCD_LIMIT_BIG && y <= SMALL_GCD_LIMIT_BIG) {
			return BigInt(SMALL_GCD_TABLE[Number(x) * SMALL_GCD_STRIDE + Number(y)]);
		}
		const t = x % y;
		x = y;
		y = t;
	}
	return x;
}

/**
 * Validate a single rational object `{ num: bigint, den: bigint }`.
 * @param {unknown} term
 * @param {number|bigint} index
 */
function validateRational(term, index) {
	if (term === null || typeof term !== 'object' || Array.isArray(term)) {
		throw new TypeError(`Term at index ${index} must be a rational object { num: bigint, den: bigint }`);
	}
	const { num, den } = /** @type {{ num: unknown, den: unknown }} */ (term);
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`Term at index ${index} must have bigint num and den properties`);
	}
	if (den === 0n) {
		throw new RangeError(`Term at index ${index} has zero denominator`);
	}
}

/**
 * Normalize a validated rational `(num, den)` to lowest terms with `den > 0n`,
 * backed by `REDUCE_CACHE`.
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Readonly<{ num: bigint, den: bigint }>}
 */
function normalizeRationalMemo(num, den) {
	if (num === 0n) {
		return Object.freeze({ num: 0n, den: 1n });
	}
	const key = `${num}/${den}`;
	const cached = REDUCE_CACHE.get(key);
	if (cached !== undefined) {
		return cached;
	}

	let n = num;
	let d = den;
	if (d < 0n) {
		n = -n;
		d = -d;
	}
	const absN = n < 0n ? -n : n;
	const g = gcdBigInt(absN, d);
	const normalized = Object.freeze({ num: n / g, den: d / g });
	cacheSet(REDUCE_CACHE, MAX_REDUCE_CACHE, key, normalized);
	return normalized;
}

/**
 * Multiply two positive normalized rationals `(a.num/a.den) * (b.num/b.den)`
 * using cross-cancellation and `MUL_CACHE`.
 * Both inputs must satisfy `num > 0n`, `den > 0n`, `gcd(num, den) === 1n`.
 * @param {Readonly<{ num: bigint, den: bigint }>} a
 * @param {Readonly<{ num: bigint, den: bigint }>} b
 * @returns {Readonly<{ num: bigint, den: bigint }>}
 */
function mulPositiveNormalizedMemo(a, b) {
	if (a.num === 1n && a.den === 1n) return b;
	if (b.num === 1n && b.den === 1n) return a;

	const keyA = `${a.num}/${a.den}`;
	const keyB = `${b.num}/${b.den}`;
	const key = keyA <= keyB ? `${keyA}*${keyB}` : `${keyB}*${keyA}`;
	const cached = MUL_CACHE.get(key);
	if (cached !== undefined) {
		return cached;
	}

	const g1 = gcdBigInt(a.num, b.den);
	const g2 = gcdBigInt(b.num, a.den);
	const result = Object.freeze({
		num: (a.num / g1) * (b.num / g2),
		den: (a.den / g2) * (b.den / g1),
	});
	cacheSet(MUL_CACHE, MAX_MUL_CACHE, key, result);
	return result;
}

/**
 * Raise a positive normalized rational to a positive integer exponent.
 * Since gcd(num, den) === 1, gcd(num^exp, den^exp) === 1 with no further reduction needed.
 * @param {Readonly<{ num: bigint, den: bigint }>} base
 * @param {number} exp
 * @returns {Readonly<{ num: bigint, den: bigint }>}
 */
function powPositiveNormalized(base, exp) {
	if (exp === 1) return base;
	const e = BigInt(exp);
	return Object.freeze({
		num: base.num ** e,
		den: base.den ** e,
	});
}

/**
 * Multiply a non-empty slice of positive normalized rationals using
 * balanced binary splitting and memoized cross-cancellation.
 * @param {Array<Readonly<{ num: bigint, den: bigint }>>} factors
 * @param {number} lo
 * @param {number} hi
 * @returns {Readonly<{ num: bigint, den: bigint }>}
 */
function productBinarySplit(factors, lo, hi) {
	if (lo === hi) {
		return factors[lo];
	}
	if (lo + 1 === hi) {
		return mulPositiveNormalizedMemo(factors[lo], factors[hi]);
	}
	const mid = (lo + hi) >>> 1;
	const left = productBinarySplit(factors, lo, mid);
	const right = productBinarySplit(factors, mid + 1, hi);
	return mulPositiveNormalizedMemo(left, right);
}

/**
 * Compute the exact discrete product over exact rationals `{ num: bigint, den: bigint }`,
 * returning a freshly allocated `{ num: bigint, den: bigint }` in lowest terms (`den > 0n`).
 *
 * Supports two calling conventions:
 * 1. `productRationalMemo(terms)` — where `terms` is an array of `{ num: bigint, den: bigint }`.
 * 2. `productRationalMemo(start, end, termFn)` — where `start` and `end` are both safe integers
 *    or both `bigint`s, and `termFn(k)` returns `{ num: bigint, den: bigint }` for each `k` in `[start, end]`.
 *
 * Empty products (`terms.length === 0` or `start > end`) evaluate to `{ num: 1n, den: 1n }`.
 * If any factor has `num === 0n`, all remaining inputs are still strictly validated before
 * returning `{ num: 0n, den: 1n }`.
 *
 * @param {ReadonlyArray<{ num: bigint, den: bigint }> | number | bigint} termsOrStart
 * @param {number | bigint} [end]
 * @param {(k: number | bigint) => { num: bigint, den: bigint }} [termFn]
 * @returns {{ num: bigint, den: bigint }}
 */
export function productRationalMemo(termsOrStart, end, termFn) {
	/** @type {ReadonlyArray<unknown>} */
	let terms;

	if (arguments.length === 1) {
		if (!Array.isArray(termsOrStart)) {
			throw new TypeError('terms must be an array of rational objects { num: bigint, den: bigint }');
		}
		terms = termsOrStart;
	} else if (arguments.length === 3) {
		const start = termsOrStart;
		const bothSafeInts = Number.isSafeInteger(start) && Number.isSafeInteger(end);
		const bothBigInts = typeof start === 'bigint' && typeof end === 'bigint';
		if (!bothSafeInts && !bothBigInts) {
			throw new TypeError('start and end must both be safe integers or both be bigints');
		}
		if (typeof termFn !== 'function') {
			throw new TypeError('termFn must be a function');
		}
		if (start > end) {
			return { num: 1n, den: 1n };
		}
		/** @type {Array<unknown>} */
		const generated = [];
		if (bothBigInts) {
			for (let k = /** @type {bigint} */ (start); k <= /** @type {bigint} */ (end); k += 1n) {
				generated.push(termFn(k));
			}
		} else {
			for (let k = /** @type {number} */ (start); k <= /** @type {number} */ (end); k += 1) {
				generated.push(termFn(k));
			}
		}
		terms = generated;
	} else {
		throw new TypeError('productRationalMemo expects either (terms) or (start, end, termFn)');
	}

	const len = terms.length;
	if (len === 0) {
		return { num: 1n, den: 1n };
	}

	let hasZero = false;
	let negative = false;

	/** @type {Map<string, { frac: Readonly<{ num: bigint, den: bigint }>, count: number }>} */
	const factorCounts = new Map();

	// Validate every element strictly (even after seeing a zero factor).
	for (let i = 0; i < len; i++) {
		const raw = terms[i];
		validateRational(raw, i);
		if (hasZero) {
			continue;
		}
		const r = /** @type {{ num: bigint, den: bigint }} */ (raw);
		if (r.num === 0n) {
			hasZero = true;
			continue;
		}

		const norm = normalizeRationalMemo(r.num, r.den);
		let absNum = norm.num;
		if (absNum < 0n) {
			negative = !negative;
			absNum = -absNum;
		}
		const den = norm.den;

		if (absNum === 1n && den === 1n) {
			continue;
		}

		// O(1) exact reciprocal cancellation: (p/q) * (q/p) === 1
		const recipKey = `${den}/${absNum}`;
		const recipEntry = factorCounts.get(recipKey);
		if (recipEntry !== undefined) {
			if (recipEntry.count === 1) {
				factorCounts.delete(recipKey);
			} else {
				recipEntry.count -= 1;
			}
			continue;
		}

		const key = `${absNum}/${den}`;
		const existing = factorCounts.get(key);
		if (existing !== undefined) {
			existing.count += 1;
		} else {
			factorCounts.set(key, {
				frac: Object.freeze({ num: absNum, den }),
				count: 1,
			});
		}
	}

	if (hasZero) {
		return { num: 0n, den: 1n };
	}

	if (factorCounts.size === 0) {
		return { num: negative ? -1n : 1n, den: 1n };
	}

	const sortedEntries = Array.from(factorCounts.entries()).sort((a, b) =>
		a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
	);

	let seqKey = '';
	for (let i = 0; i < sortedEntries.length; i++) {
		const [k, entry] = sortedEntries[i];
		if (i > 0) seqKey += ';';
		seqKey += entry.count === 1 ? k : `${k}^${entry.count}`;
	}

	let magnitude = SEQ_CACHE.get(seqKey);
	if (magnitude === undefined) {
		const poweredFactors = sortedEntries.map(([, entry]) =>
			powPositiveNormalized(entry.frac, entry.count),
		);
		magnitude = productBinarySplit(poweredFactors, 0, poweredFactors.length - 1);
		cacheSet(SEQ_CACHE, MAX_SEQ_CACHE, seqKey, magnitude);
	}

	return {
		num: negative ? -magnitude.num : magnitude.num,
		den: magnitude.den,
	};
}
