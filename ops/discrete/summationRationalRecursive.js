/**
 * Exact discrete summation over rational numbers using a recursive
 * divide-and-conquer pairwise summation tree.
 *
 * Each rational is represented as `{ num: bigint, den: bigint }`.
 * All returned rationals are normalized to lowest terms with `den > 0n`
 * (and `0` represented as `{ num: 0n, den: 1n }`).
 *
 * @module ops/discrete/summationRationalRecursive
 */

/**
 * @typedef {Object} Rational
 * @property {bigint} num - Numerator (arbitrary-precision BigInt).
 * @property {bigint} den - Non-zero denominator (arbitrary-precision BigInt).
 */

/**
 * Computes the absolute value of a BigInt.
 *
 * @param {bigint} x
 * @returns {bigint}
 */
function absBigInt(x) {
	return x < 0n ? -x : x
}

/**
 * Computes the non-negative greatest common divisor of two BigInts.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
	let x = absBigInt(a)
	let y = absBigInt(b)
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Normalizes a rational pair `(num, den)` to lowest terms with `den > 0n`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalize(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must be non-zero')
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Validates that a value is a well-formed `{ num: bigint, den: bigint }`
 * rational with a non-zero denominator and returns its normalized copy.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function validateAndNormalize(value, label) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`${label} must be an object with BigInt num and den properties`)
	}
	const { num, den } = /** @type {{ num?: unknown, den?: unknown }} */ (value)
	if (typeof num !== 'bigint') {
		throw new TypeError(`${label}.num must be a BigInt`)
	}
	if (typeof den !== 'bigint') {
		throw new TypeError(`${label}.den must be a BigInt`)
	}
	if (den === 0n) {
		throw new RangeError(`${label}.den must be non-zero`)
	}
	return normalize(num, den)
}

/**
 * Adds two already-normalized rationals and returns the exact normalized sum.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function addRationals(a, b) {
	if (a.num === 0n) {
		return { num: b.num, den: b.den }
	}
	if (b.num === 0n) {
		return { num: a.num, den: a.den }
	}
	const g = gcd(a.den, b.den)
	const aDenReduced = a.den / g
	const bDenReduced = b.den / g
	const num = a.num * bDenReduced + b.num * aDenReduced
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g2 = gcd(num, g)
	return {
		num: num / g2,
		den: aDenReduced * (b.den / g2),
	}
}

/**
 * Recursively sums `terms[lo..hi)` using binary divide-and-conquer.
 *
 * @param {Rational[]} terms
 * @param {number} lo
 * @param {number} hi
 * @returns {Rational}
 */
function sumArrayRange(terms, lo, hi) {
	const len = hi - lo
	if (len === 0) {
		return { num: 0n, den: 1n }
	}
	if (len === 1) {
		if (!(lo in terms)) {
			throw new TypeError(`Element at index ${lo} is missing (sparse array)`)
		}
		return validateAndNormalize(terms[lo], `Element at index ${lo}`)
	}
	const mid = lo + Math.floor(len / 2)
	const left = sumArrayRange(terms, lo, mid)
	const right = sumArrayRange(terms, mid, hi)
	return addRationals(left, right)
}

/**
 * Recursively sums `termFn(k)` for safe integer `k` in inclusive `[lo, hi]`.
 *
 * @param {number} lo
 * @param {number} hi
 * @param {(k: number) => Rational} termFn
 * @returns {Rational}
 */
function sumNumberRange(lo, hi, termFn) {
	if (lo > hi) {
		return { num: 0n, den: 1n }
	}
	if (lo === hi) {
		return validateAndNormalize(termFn(lo), `Term at k=${lo}`)
	}
	const mid = lo + Math.floor((hi - lo) / 2)
	const left = sumNumberRange(lo, mid, termFn)
	const right = sumNumberRange(mid + 1, hi, termFn)
	return addRationals(left, right)
}

/**
 * Recursively sums `termFn(k)` for BigInt `k` in inclusive `[lo, hi]`.
 *
 * @param {bigint} lo
 * @param {bigint} hi
 * @param {(k: bigint) => Rational} termFn
 * @returns {Rational}
 */
function sumBigIntRange(lo, hi, termFn) {
	if (lo > hi) {
		return { num: 0n, den: 1n }
	}
	if (lo === hi) {
		return validateAndNormalize(termFn(lo), `Term at k=${lo}`)
	}
	const mid = lo + (hi - lo) / 2n
	const left = sumBigIntRange(lo, mid, termFn)
	const right = sumBigIntRange(mid + 1n, hi, termFn)
	return addRationals(left, right)
}

/**
 * Computes the exact discrete sum of rational numbers `{ num: bigint, den: bigint }`
 * in lowest terms (`den > 0n`) via a recursive divide-and-conquer pairwise summation tree.
 *
 * Supports two call signatures:
 * 1. `summationRationalRecursive(terms)` — sums an array of rationals.
 * 2. `summationRationalRecursive(start, end, termFn)` — sums `termFn(k)` for
 *    integers `k` from `start` through `end` inclusive (both safe integer
 *    `number`s or both `bigint`s). If `start > end`, returns `{ num: 0n, den: 1n }`.
 *
 * Splitting the input recursively into balanced left and right halves keeps
 * recursion depth at O(log n) and balances intermediate BigInt denominator sizes.
 *
 * @overload
 * @param {Rational[]} terms - Array of rational numbers `{ num: bigint, den: bigint }`.
 * @returns {Rational} Exact sum in lowest terms with `den > 0n`.
 *
 * @overload
 * @param {number} start - Inclusive lower bound (safe integer).
 * @param {number} end - Inclusive upper bound (safe integer).
 * @param {(k: number) => Rational} termFn - Function mapping index `k` to a rational.
 * @returns {Rational} Exact sum in lowest terms with `den > 0n`.
 *
 * @overload
 * @param {bigint} start - Inclusive lower bound (BigInt).
 * @param {bigint} end - Inclusive upper bound (BigInt).
 * @param {(k: bigint) => Rational} termFn - Function mapping index `k` to a rational.
 * @returns {Rational} Exact sum in lowest terms with `den > 0n`.
 *
 * @param {Rational[] | number | bigint} termsOrStart
 * @param {number | bigint} [end]
 * @param {((k: any) => Rational)} [termFn]
 * @returns {Rational}
 */
export function summationRationalRecursive(termsOrStart, end, termFn) {
	if (arguments.length === 1) {
		if (!Array.isArray(termsOrStart)) {
			throw new TypeError('terms must be an Array of { num: bigint, den: bigint } rationals')
		}
		return sumArrayRange(termsOrStart, 0, termsOrStart.length)
	}

	if (arguments.length === 3) {
		if (typeof termFn !== 'function') {
			throw new TypeError('termFn must be a function returning { num: bigint, den: bigint }')
		}
		const start = termsOrStart
		if (typeof start === 'number' && typeof end === 'number') {
			if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
				throw new RangeError('start and end must be safe integers')
			}
			return sumNumberRange(start, end, termFn)
		}
		if (typeof start === 'bigint' && typeof end === 'bigint') {
			return sumBigIntRange(start, end, termFn)
		}
		throw new TypeError('start and end must both be safe integer numbers or both be BigInts')
	}

	throw new TypeError(
		'Expected summationRationalRecursive(terms) or summationRationalRecursive(start, end, termFn)',
	)
}
