/**
 * Exact rational number represented in lowest terms with a positive denominator.
 *
 * @typedef {object} Rational
 * @property {bigint} num - Numerator.
 * @property {bigint} den - Strictly positive denominator (`den > 0n`).
 */

/**
 * Computes the greatest common divisor of two BigInts using the Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative greatest common divisor.
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Validates and normalizes a rational input object to lowest terms with `den > 0n`.
 *
 * @param {unknown} value
 * @param {number} index
 * @returns {Rational}
 */
function normalizeRational(value, index) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(
			`Expected rational object { num: bigint, den: bigint } at index ${index}`
		)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(
			`Expected bigint num and den at index ${index}`
		)
	}
	if (den === 0n) {
		throw new RangeError(`Denominator must not be 0n at index ${index}`)
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const signNormalizedNum = den < 0n ? -num : num
	const signNormalizedDen = den < 0n ? -den : den
	const divisor = gcd(signNormalizedNum, signNormalizedDen)
	return {
		num: signNormalizedNum / divisor,
		den: signNormalizedDen / divisor,
	}
}

/**
 * Multiplies two already-normalized rationals and returns the normalized product.
 * Cross-cancels before multiplication to keep intermediate values small and
 * preserve lowest terms with `den > 0n`.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function multiplyNormalized(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g1 = gcd(a.num, b.den)
	const g2 = gcd(b.num, a.den)
	return {
		num: (a.num / g1) * (b.num / g2),
		den: (a.den / g2) * (b.den / g1),
	}
}

/**
 * Recursively computes the product of normalized rationals in the half-open slice `[lo, hi)`.
 *
 * @param {Rational[]} rationals
 * @param {number} lo
 * @param {number} hi
 * @returns {Rational}
 */
function productRange(rationals, lo, hi) {
	const len = hi - lo
	if (len === 0) {
		return { num: 1n, den: 1n }
	}
	if (len === 1) {
		return rationals[lo]
	}
	const mid = lo + Math.floor(len / 2)
	const left = productRange(rationals, lo, mid)
	if (left.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const right = productRange(rationals, mid, hi)
	return multiplyNormalized(left, right)
}

/**
 * Computes the discrete product of an array of exact rational numbers using a
 * recursive divide-and-conquer (binary splitting) algorithm.
 *
 * The empty product returns `{ num: 1n, den: 1n }`. The returned rational is
 * always normalized to lowest terms with `den > 0n`, and zero is uniquely
 * represented as `{ num: 0n, den: 1n }`.
 *
 * @param {ReadonlyArray<{ num: bigint, den: bigint }>} values - Array of exact rational objects.
 * @returns {Rational} Exact product in lowest terms with `den > 0n`.
 * @throws {TypeError} If `values` is not an array or any element is not `{ num: bigint, den: bigint }`.
 * @throws {RangeError} If any element has a denominator of `0n`.
 */
export function productRationalRecursive(values) {
	if (!Array.isArray(values)) {
		throw new TypeError('Expected values to be an array of rational objects')
	}
	const normalized = new Array(values.length)
	for (let i = 0; i < values.length; i++) {
		normalized[i] = normalizeRational(values[i], i)
	}
	return productRange(normalized, 0, normalized.length)
}
