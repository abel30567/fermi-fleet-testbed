/**
 * Compute the greatest common divisor of two non-negative BigInts using the Euclidean algorithm.
 *
 * @param {bigint} a - First non-negative BigInt.
 * @param {bigint} b - Second non-negative BigInt.
 * @returns {bigint} Non-negative greatest common divisor.
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
 * Normalize a rational number (num / den) to lowest terms with a strictly positive denominator.
 *
 * @param {bigint} num - Numerator.
 * @param {bigint} den - Non-zero denominator.
 * @returns {{ num: bigint, den: bigint }} Normalized rational in lowest terms with `den > 0n`.
 */
function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must not be 0n')
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
 * Validate and normalize an input rational object `{ num: bigint, den: bigint }`.
 *
 * @param {unknown} value - Candidate rational object.
 * @param {string} label - Parameter name for error messages.
 * @returns {{ num: bigint, den: bigint }} Validated and normalized rational.
 */
function parseRational(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be an object of the form { num: BigInt, den: BigInt }`)
	}
	if (typeof value.num !== 'bigint' || typeof value.den !== 'bigint') {
		throw new TypeError(`${label}.num and ${label}.den must both be BigInt values`)
	}
	if (value.den === 0n) {
		throw new RangeError(`${label}.den must not be 0n`)
	}
	return normalizeRational(value.num, value.den)
}

/**
 * Add two normalized rationals.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function addRational(a, b) {
	return normalizeRational(a.num * b.den + b.num * a.den, a.den * b.den)
}

/**
 * Subtract two normalized rationals (`a - b`).
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function subRational(a, b) {
	return normalizeRational(a.num * b.den - b.num * a.den, a.den * b.den)
}

/**
 * Multiply two normalized rationals.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function mulRational(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n }
	}
	// Cross-cancel before multiplying to keep intermediate BigInts small.
	const g1 = gcdBigInt(a.num, b.den)
	const g2 = gcdBigInt(b.num, a.den)
	return normalizeRational((a.num / g1) * (b.num / g2), (a.den / g2) * (b.den / g1))
}

/**
 * Divide two normalized rationals (`a / b`).
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function divRational(a, b) {
	if (b.num === 0n) {
		throw new RangeError('Division by zero rational')
	}
	return mulRational(a, { num: b.den, den: b.num })
}

/**
 * Recursive divide-and-conquer (binary splitting) evaluation of the relative Laplace sum
 * over index range `[lo, hi]`:
 *
 *   sum(lo, hi)   = sum_{k=lo}^{hi} coeffs[k] * (k! / lo!) / u^(k - lo)
 *   scale(lo, hi) = ((hi + 1)! / lo!) / u^(hi - lo + 1)
 *
 * Combining `[lo, mid]` and `[mid + 1, hi]` satisfies:
 *   sum(lo, hi)   = sum(lo, mid) + scale(lo, mid) * sum(mid + 1, hi)
 *   scale(lo, hi) = scale(lo, mid) * scale(mid + 1, hi)
 *
 * Recursion depth is O(log n).
 *
 * @param {Array<{ num: bigint, den: bigint }>} coeffs - Normalized rational polynomial coefficients.
 * @param {{ num: bigint, den: bigint }} u - Positive effective frequency `s - shift`.
 * @param {number} lo - Inclusive lower degree index.
 * @param {number} hi - Inclusive upper degree index.
 * @returns {{ sum: { num: bigint, den: bigint }, scale: { num: bigint, den: bigint } }}
 */
function splitLaplace(coeffs, u, lo, hi) {
	if (lo === hi) {
		return {
			sum: coeffs[lo],
			scale: normalizeRational(BigInt(lo + 1) * u.den, u.num),
		}
	}

	const mid = lo + ((hi - lo) >> 1)
	const left = splitLaplace(coeffs, u, lo, mid)
	const right = splitLaplace(coeffs, u, mid + 1, hi)

	return {
		sum: addRational(left.sum, mulRational(left.scale, right.sum)),
		scale: mulRational(left.scale, right.scale),
	}
}

/**
 * Compute the exact unilateral Laplace transform of a polynomial (optionally modulated by an
 * exponential factor `exp(shift * t)`) over exact rationals using a recursive divide-and-conquer
 * (binary splitting) algorithm.
 *
 * For `f(t) = exp(a * t) * sum_{k=0}^{n} c_k * t^k` and `s > a`, the Laplace transform is:
 *
 *   L{f}(s) = integral_0^inf exp(-s * t) * f(t) dt
 *           = sum_{k=0}^{n} c_k * k! / (s - a)^(k + 1)
 *
 * Every rational input and output uses `{ num: BigInt, den: BigInt }`. The returned rational is
 * always normalized to lowest terms with `den > 0n`.
 *
 * @param {Array<{ num: bigint, den: bigint }>} coeffs - Polynomial coefficients `[c_0, c_1, ..., c_n]`
 *   in ascending powers of `t`. An empty array represents the zero polynomial `f(t) = 0`.
 * @param {{ num: bigint, den: bigint }} s - Rational Laplace variable `s`, which must satisfy `s > shift`.
 * @param {{ num: bigint, den: bigint }} [shift={ num: 0n, den: 1n }] - Optional rational exponential
 *   shift `a` in `exp(a * t) * P(t)`.
 * @returns {{ num: bigint, den: bigint }} Exact Laplace transform value `F(s)` in lowest terms with `den > 0n`.
 * @throws {TypeError} If `coeffs` is not an array or any rational input lacks BigInt `num`/`den`.
 * @throws {RangeError} If any denominator is `0n` or if `s <= shift` (integral diverges).
 */
export function laplaceTransformRationalRecursive(coeffs, s, shift = { num: 0n, den: 1n }) {
	if (!Array.isArray(coeffs)) {
		throw new TypeError('coeffs must be an array of rational objects { num: BigInt, den: BigInt }')
	}

	const sNorm = parseRational(s, 's')
	const shiftNorm = parseRational(shift, 'shift')
	const u = subRational(sNorm, shiftNorm)

	if (u.num <= 0n) {
		throw new RangeError('Laplace transform diverges: s must be strictly greater than shift')
	}

	const normalizedCoeffs = new Array(coeffs.length)
	for (let i = 0; i < coeffs.length; i++) {
		normalizedCoeffs[i] = parseRational(coeffs[i], `coeffs[${i}]`)
	}

	if (normalizedCoeffs.length === 0) {
		return { num: 0n, den: 1n }
	}

	const { sum } = splitLaplace(normalizedCoeffs, u, 0, normalizedCoeffs.length - 1)
	return divRational(sum, u)
}
