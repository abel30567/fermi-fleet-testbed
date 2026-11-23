/**
 * @typedef {Object} Rational
 * @property {bigint} num - Signed numerator.
 * @property {bigint} den - Non-zero denominator (strictly positive in canonical lowest terms).
 */

/**
 * Computes the absolute value of a BigInt.
 *
 * @param {bigint} value
 * @returns {bigint}
 */
function absBigInt(value) {
	return value < 0n ? -value : value
}

/**
 * Computes the non-negative greatest common divisor of two BigInts using the
 * iterative Euclidean algorithm (avoids call-stack growth for large operands).
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
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
 * Validates and normalizes a rational number `{ num, den }` into canonical
 * lowest terms with strictly positive denominator (`den > 0n`) and
 * `{ num: 0n, den: 1n }` for zero.
 *
 * @param {unknown} r
 * @param {string} vectorName
 * @param {number} index
 * @returns {Rational}
 */
function validateAndNormalizeRational(r, vectorName, index) {
	if (r === null || typeof r !== 'object') {
		throw new TypeError(
			`${vectorName}[${index}] must be a rational object { num: bigint, den: bigint }`
		)
	}
	const { num, den } = r
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(
			`${vectorName}[${index}] must have bigint num and den properties`
		)
	}
	if (den === 0n) {
		throw new RangeError(`${vectorName}[${index}] has a zero denominator`)
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}

	const signAdjustedNum = den < 0n ? -num : num
	const positiveDen = den < 0n ? -den : den
	const g = gcdBigInt(signAdjustedNum, positiveDen)
	return {
		num: signAdjustedNum / g,
		den: positiveDen / g,
	}
}

/**
 * Adds two normalized exact rationals using Knuth/Henrici GCD-scaled addition
 * to avoid intermediate expression swell and maintain exact lowest-terms output.
 *
 * Given reduced `n1/d1` and `n2/d2` (`d1 > 0`, `d2 > 0`, `gcd(|ni|, di) = 1`):
 *   - Let `g = gcd(d1, d2)`, `d1s = d1 / g`, `d2s = d2 / g`.
 *   - Let `t = n1 * d2s + n2 * d1s`.
 *   - Only factors of `g` can divide both `t` and `d1s * d2`, so `h = gcd(|t|, g)`
 *     yields the exact reduced fraction `(t / h) / (d1s * (d2 / h))`.
 *
 * @param {Rational} a - Normalized rational in lowest terms.
 * @param {Rational} b - Normalized rational in lowest terms.
 * @returns {Rational} Exact sum in canonical lowest terms.
 */
function addNormalizedRationals(a, b) {
	if (a.num === 0n) {
		return { num: b.num, den: b.den }
	}
	if (b.num === 0n) {
		return { num: a.num, den: a.den }
	}

	const g = gcdBigInt(a.den, b.den)
	if (g === 1n) {
		const num = a.num * b.den + b.num * a.den
		if (num === 0n) {
			return { num: 0n, den: 1n }
		}
		return {
			num,
			den: a.den * b.den,
		}
	}

	const d1Scaled = a.den / g
	const d2Scaled = b.den / g
	const t = a.num * d2Scaled + b.num * d1Scaled
	if (t === 0n) {
		return { num: 0n, den: 1n }
	}

	const h = gcdBigInt(t, g)
	return {
		num: t / h,
		den: d1Scaled * (b.den / h),
	}
}

/**
 * Element-wise vector addition over exact rational numbers `{ num: bigint, den: bigint }`.
 *
 * Pre-normalizes each operand and performs GCD-scaled rational addition
 * (Knuth TAOCP Vol. 2 §4.5.1 / Henrici's algorithm) so intermediate BigInt
 * magnitudes stay minimal, catastrophic cancellation is handled with zero
 * rounding error, and every output entry is guaranteed to be in canonical
 * lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`, zero as `{ num: 0n, den: 1n }`).
 *
 * @param {ReadonlyArray<Rational>} a - First rational vector.
 * @param {ReadonlyArray<Rational>} b - Second rational vector (same length as `a`).
 * @returns {Array<Rational>} New vector containing exact reduced sums.
 * @throws {TypeError} If `a` or `b` is not an array, or any element is not `{ num: bigint, den: bigint }`.
 * @throws {RangeError} If `a.length !== b.length`, or any element has `den === 0n`.
 */
export function vectorAddRationalStable(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument "a" must be an array')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument "b" must be an array')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Vector lengths must match: received ${a.length} and ${b.length}`
		)
	}

	const result = new Array(a.length)
	for (let i = 0; i < a.length; i++) {
		const ra = validateAndNormalizeRational(a[i], 'a', i)
		const rb = validateAndNormalizeRational(b[i], 'b', i)
		result[i] = addNormalizedRationals(ra, rb)
	}

	return result
}
