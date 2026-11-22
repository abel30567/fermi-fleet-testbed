/**
 * Exact discrete summation over rational numbers represented as
 * `{ num: BigInt, den: BigInt }` in lowest terms (`den > 0n`,
 * `gcd(|num|, den) === 1n`, with zero represented as `{ num: 0n, den: 1n }`).
 *
 * Uses binary splitting (divide-and-conquer pairwise summation) with
 * gcd-reduced rational addition so intermediate denominators stay balanced
 * and terms are evaluated strictly left-to-right in O(log N) stack space.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Computes the absolute value of a BigInt.
 * @param {bigint} x
 * @returns {bigint}
 */
function absBigInt(x) {
	return x < 0n ? -x : x
}

/**
 * Computes the non-negative greatest common divisor of two BigInts via
 * the iterative Euclidean algorithm.
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
 * Validates and normalizes a rational object to lowest terms with `den > 0n`.
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 * @throws {TypeError} If value is not an object with BigInt `num` and `den`.
 * @throws {RangeError} If `den === 0n`.
 */
function normalizeRational(value, label) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`${label} must be a rational object { num: BigInt, den: BigInt }`)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label} must have BigInt num and den properties`)
	}
	if (den === 0n) {
		throw new RangeError(`${label} must have a non-zero denominator`)
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
 * Adds two already-normalized rationals and returns the sum in lowest terms.
 *
 * Since gcd(a.num, a.den) = 1 and gcd(b.num, b.den) = 1, letting g = gcd(a.den, b.den),
 * aDenReduced = a.den / g, and bDenReduced = b.den / g, any common divisor of
 * num = a.num * bDenReduced + b.num * aDenReduced and den = aDenReduced * b.den
 * must divide g. Thus reducing by h = gcd(|num|, g) produces lowest terms.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function addRationals(a, b) {
	if (a.num === 0n) return b
	if (b.num === 0n) return a
	const g = gcd(a.den, b.den)
	const aDenReduced = a.den / g
	const bDenReduced = b.den / g
	const num = a.num * bDenReduced + b.num * aDenReduced
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const h = gcd(num, g)
	return {
		num: num / h,
		den: aDenReduced * (b.den / h),
	}
}

/**
 * Sums elements `arr[l..r]` via binary splitting.
 * @param {Rational[]} arr
 * @param {number} l
 * @param {number} r
 * @returns {Rational}
 */
function sumArrayRange(arr, l, r) {
	if (l === r) {
		return normalizeRational(arr[l], `terms[${l}]`)
	}
	const mid = l + Math.floor((r - l) / 2)
	return addRationals(sumArrayRange(arr, l, mid), sumArrayRange(arr, mid + 1, r))
}

/**
 * Sums `termFn(k)` for safe integer `k` in `[l, r]` via binary splitting.
 * @param {(k: number) => Rational} termFn
 * @param {number} l
 * @param {number} r
 * @returns {Rational}
 */
function sumNumberRange(termFn, l, r) {
	if (l === r) {
		const k = l === 0 ? 0 : l
		return normalizeRational(termFn(k), `termFn(${k})`)
	}
	const mid = Number((BigInt(l) + BigInt(r)) >> 1n)
	return addRationals(sumNumberRange(termFn, l, mid), sumNumberRange(termFn, mid + 1, r))
}

/**
 * Sums `termFn(k)` for BigInt `k` in `[l, r]` via binary splitting.
 * @param {(k: bigint) => Rational} termFn
 * @param {bigint} l
 * @param {bigint} r
 * @returns {Rational}
 */
function sumBigIntRange(termFn, l, r) {
	if (l === r) {
		return normalizeRational(termFn(l), `termFn(${l}n)`)
	}
	const mid = (l + r) >> 1n
	return addRationals(sumBigIntRange(termFn, l, mid), sumBigIntRange(termFn, mid + 1n, r))
}

/**
 * Computes the exact discrete sum of a finite rational series.
 *
 * Supports two calling conventions:
 * 1. Array mode: `summationRationalSeries(terms)` sums all rational objects in `terms`.
 * 2. Generator mode: `summationRationalSeries(termFn, start, end)` computes
 *    `\sum_{k=start}^{end} termFn(k)` for integer bounds `start` and `end`
 *    (both safe JS `number` integers or both `bigint` integers).
 *
 * Algorithm: Binary splitting (divide-and-conquer pairwise summation) with
 * gcd-reduced rational addition. Evaluates terms strictly in ascending order
 * using O(log N) stack space and reduces intermediate denominator growth.
 *
 * An empty array or bounds with `start > end` produces the additive identity
 * `{ num: 0n, den: 1n }`.
 *
 * @param {Rational[] | ((k: number) => Rational) | ((k: bigint) => Rational)} termsOrFn
 *   Either an array of rational objects `{ num: BigInt, den: BigInt }` or a
 *   term-generating function mapping an integer index `k` to a rational object.
 * @param {number | bigint} [start]
 *   Inclusive lower summation bound (required in generator mode; must be omitted in array mode).
 * @param {number | bigint} [end]
 *   Inclusive upper summation bound (required in generator mode; must be omitted in array mode).
 * @returns {Rational} The exact sum in lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`).
 * @throws {TypeError} If `termsOrFn` is neither an array nor a function; if bounds are
 *   passed in array mode; if bounds in generator mode are missing, non-numeric, or of
 *   mismatched types (`number` vs `bigint`); or if any term is not a valid rational object
 *   with BigInt `num` and `den`.
 * @throws {RangeError} If `number` bounds are not safe integers (`Number.isSafeInteger`),
 *   or if any term has `den === 0n`.
 */
export function summationRationalSeries(termsOrFn, start, end) {
	if (Array.isArray(termsOrFn)) {
		if (start !== undefined || end !== undefined) {
			throw new TypeError('start and end bounds must not be provided when summing an array of rationals')
		}
		if (termsOrFn.length === 0) {
			return { num: 0n, den: 1n }
		}
		return sumArrayRange(termsOrFn, 0, termsOrFn.length - 1)
	}

	if (typeof termsOrFn !== 'function') {
		throw new TypeError('termsOrFn must be an array of rationals or a generator function')
	}

	const startType = typeof start
	const endType = typeof end
	if ((startType !== 'number' && startType !== 'bigint') || (endType !== 'number' && endType !== 'bigint')) {
		throw new TypeError('start and end must be integers (both safe numbers or both BigInts)')
	}
	if (startType !== endType) {
		throw new TypeError('start and end must have the same type (both safe numbers or both BigInts)')
	}

	if (startType === 'number') {
		if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
			throw new RangeError('start and end must be safe integers')
		}
		if (start > end) {
			return { num: 0n, den: 1n }
		}
		return sumNumberRange(termsOrFn, start, end)
	}

	if (start > end) {
		return { num: 0n, den: 1n }
	}
	return sumBigIntRange(termsOrFn, start, end)
}
