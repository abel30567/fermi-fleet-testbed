/**
 * Compute the greatest common divisor of two non-negative BigInts
 * using the iterative Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
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
 * Normalize a rational pair (num, den) to lowest terms with den > 0n
 * and zero represented canonically as { num: 0n, den: 1n }.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(num, den) {
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
	const g = gcdBigInt(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Validate and normalize a rational input object `{ num: bigint, den: bigint }`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {{ num: bigint, den: bigint }}
 */
function parseRational(value, label) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`${label} must be an object with bigint num and den properties`)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label}.num and ${label}.den must both be BigInt values`)
	}
	if (den === 0n) {
		throw new RangeError(`${label}.den must not be 0n`)
	}
	return normalizeRational(num, den)
}

/**
 * Add two normalized rationals.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function addRational(a, b) {
	if (a.num === 0n) return b
	if (b.num === 0n) return a
	const g = gcdBigInt(a.den, b.den)
	const aScale = b.den / g
	const bScale = a.den / g
	return normalizeRational(a.num * aScale + b.num * bScale, bScale * b.den)
}

/**
 * Subtract two normalized rationals (a - b).
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function subRational(a, b) {
	return addRational(a, { num: -b.num, den: b.den })
}

/**
 * Multiply two normalized rationals with cross-cancellation.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function mulRational(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g1 = gcdBigInt(a.num, b.den)
	const g2 = gcdBigInt(b.num, a.den)
	return {
		num: (a.num / g1) * (b.num / g2),
		den: (a.den / g2) * (b.den / g1),
	}
}

/**
 * Compute the exact Laplace transform of a rational power series / polynomial
 * (with optional exponential factor `e^(shift * t)`) evaluated at a rational point `s`.
 *
 * Mathematical identity:
 * For a polynomial / finite power series
 *
 *     f(t) = sum_{k=0}^{n} a_k * t^k
 *
 * and optional exponential shift `a = shift` (defaulting to `0`), the exact
 * term-by-term Laplace transform and First Shifting Theorem give:
 *
 *     L{ e^(a*t) * f(t) }(s) = sum_{k=0}^{n} a_k * k! / (s - a)^(k + 1)
 *
 * For `s > a`, this equals the convergent improper integral
 * `integral_{0}^{infinity} e^(-(s - a)*t) * f(t) dt`; for `s < a`, it evaluates
 * the unique rational analytic continuation. At `s = a`, the transform has a pole
 * and throws a `RangeError`.
 *
 * Evaluation uses the exact Horner-factorial recurrence over `u = s - a`:
 *
 *     R_n = a_n
 *     R_k = a_k + ((k + 1) / u) * R_{k + 1}    for k = n - 1, ..., 0
 *     L{ e^(a*t) * f(t) }(s) = R_0 / u
 *
 * which matches `sum_{k=0}^{n} a_k * k! / u^(k + 1)` identically while keeping
 * intermediate rationals reduced at every step.
 *
 * @param {Array<{ num: bigint, den: bigint }>} coeffs
 *   Power-series coefficients `[a_0, a_1, ..., a_n]` where `a_k` is the exact
 *   rational coefficient of `t^k`. An empty array represents the zero function.
 * @param {{ num: bigint, den: bigint }} s
 *   Exact rational evaluation point in the Laplace domain. Must satisfy `s !== shift`.
 * @param {{ num: bigint, den: bigint }} [shift={ num: 0n, den: 1n }]
 *   Optional exact rational exponential shift `a` in `e^(a * t) * f(t)`.
 * @returns {{ num: bigint, den: bigint }}
 *   Exact reduced rational `{ num: bigint, den: bigint }` with `den > 0n`,
 *   `gcd(|num|, den) === 1n`, and zero represented as `{ num: 0n, den: 1n }`.
 * @throws {TypeError}
 *   If `coeffs` is not an Array, or if any coefficient, `s`, or `shift` is not an
 *   object with `bigint` `num` and `den` properties.
 * @throws {RangeError}
 *   If any rational input has `den === 0n`, or if `s` equals `shift` (pole at `s - shift = 0`).
 */
export function laplaceTransformRationalSeries(coeffs, s, shift = { num: 0n, den: 1n }) {
	if (!Array.isArray(coeffs)) {
		throw new TypeError('coeffs must be an Array of rational objects')
	}

	const normalizedCoeffs = new Array(coeffs.length)
	for (let k = 0; k < coeffs.length; k++) {
		normalizedCoeffs[k] = parseRational(coeffs[k], `coeffs[${k}]`)
	}

	const sRat = parseRational(s, 's')
	const shiftRat = parseRational(shift, 'shift')

	// Effective shifted variable u = s - shift
	const u = subRational(sRat, shiftRat)
	if (u.num === 0n) {
		throw new RangeError('Laplace transform has a pole where s equals shift (s - shift === 0)')
	}

	if (normalizedCoeffs.length === 0) {
		return { num: 0n, den: 1n }
	}

	// Reciprocal invU = 1 / u, normalized with den > 0n
	const invU = u.num < 0n
		? { num: -u.den, den: -u.num }
		: { num: u.den, den: u.num }

	// Horner-factorial recurrence:
	//   R_n = a_n
	//   R_k = a_k + ((k + 1) / u) * R_{k + 1}
	//   result = R_0 / u = sum_{k=0}^{n} a_k * k! / u^(k + 1)
	let acc = normalizedCoeffs[normalizedCoeffs.length - 1]
	for (let k = normalizedCoeffs.length - 2; k >= 0; k--) {
		const factor = mulRational(normalizeRational(BigInt(k + 1), 1n), invU)
		acc = addRational(normalizedCoeffs[k], mulRational(factor, acc))
	}

	return mulRational(acc, invU)
}
