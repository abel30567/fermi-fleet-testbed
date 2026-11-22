/**
 * @typedef {{ re: number, im: number }} Complex
 */

const SCALE_THRESHOLD = Number.MAX_VALUE / 4
const DIRECT_DIV_MAX = 1e140
const DIRECT_DIV_MIN = 1e-140

/**
 * Validates that a value is a complex number object `{ re, im }` with finite numeric components.
 *
 * @param {unknown} value - Candidate complex number.
 * @param {string} name - Parameter name for descriptive error messages.
 * @throws {TypeError} If `value` is not a non-null non-array object or if `re`/`im` are not numbers.
 * @throws {RangeError} If `re` or `im` is not finite (`NaN`, `Infinity`, or `-Infinity`).
 */
function assertValidComplex(value, name) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`Expected "${name}" to be a complex object { re, im }`)
	}
	if (typeof value.re !== 'number' || typeof value.im !== 'number') {
		throw new TypeError(`Expected "${name}.re" and "${name}.im" to be numbers`)
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError(`Expected "${name}.re" and "${name}.im" to be finite numbers`)
	}
}

/**
 * Normalizes `-0` components to `+0`.
 *
 * @param {Complex} z
 * @returns {Complex}
 */
function normalizeComplex(z) {
	return {
		re: z.re === 0 ? 0 : z.re,
		im: z.im === 0 ? 0 : z.im,
	}
}

/**
 * Computes the complex quotient `a / b`.
 * Uses exact conjugate division `(a * conj(b)) / |b|^2` in the safe normal range
 * to avoid extra rounding error on exact Gaussian integers (e.g. half-integer ties),
 * and falls back to Smith's scaled formula at extreme magnitudes to prevent overflow/underflow.
 *
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function complexDiv(a, b) {
	const maxB = Math.max(Math.abs(b.re), Math.abs(b.im))
	const maxA = Math.max(Math.abs(a.re), Math.abs(a.im))

	if (maxB >= DIRECT_DIV_MIN && maxB <= DIRECT_DIV_MAX && maxA <= DIRECT_DIV_MAX) {
		const denom = b.re * b.re + b.im * b.im
		return {
			re: (a.re * b.re + a.im * b.im) / denom,
			im: (a.im * b.re - a.re * b.im) / denom,
		}
	}

	if (maxB > SCALE_THRESHOLD) {
		return complexDiv(
			{ re: a.re * 0.25, im: a.im * 0.25 },
			{ re: b.re * 0.25, im: b.im * 0.25 },
		)
	}

	if (maxA > SCALE_THRESHOLD) {
		const scaled = complexDiv({ re: a.re * 0.25, im: a.im * 0.25 }, b)
		return { re: scaled.re * 4, im: scaled.im * 4 }
	}

	if (Math.abs(b.re) >= Math.abs(b.im)) {
		const t = b.im / b.re
		const denom = b.re + b.im * t
		return {
			re: (a.re + a.im * t) / denom,
			im: (a.im - a.re * t) / denom,
		}
	}

	const t = b.re / b.im
	const denom = b.im + b.re * t
	return {
		re: (a.re * t + a.im) / denom,
		im: (a.im * t - a.re) / denom,
	}
}

/**
 * Recursively subtracts `b * (qRe + qIm * i)` from `a` in unit Gaussian steps
 * when `|b|` is near `Number.MAX_VALUE`, avoiding intermediate overflow.
 *
 * @param {Complex} a
 * @param {Complex} b
 * @param {number} qRe - Integer real part of quotient step.
 * @param {number} qIm - Integer imaginary part of quotient step.
 * @returns {Complex}
 */
function subtractUnitStepsRecursive(a, b, qRe, qIm) {
	if (qRe === 0 && qIm === 0) {
		return a
	}

	let candRe = null
	let normRe = Infinity
	if (qRe !== 0) {
		const s = Math.sign(qRe)
		candRe = { re: a.re - s * b.re, im: a.im - s * b.im }
		normRe = Math.max(Math.abs(candRe.re), Math.abs(candRe.im))
	}

	let candIm = null
	let normIm = Infinity
	if (qIm !== 0) {
		const s = Math.sign(qIm)
		// Subtract s * (i * b) = s * (-b.im + b.re * i)
		candIm = { re: a.re + s * b.im, im: a.im - s * b.re }
		normIm = Math.max(Math.abs(candIm.re), Math.abs(candIm.im))
	}

	if (candRe !== null && normRe <= normIm) {
		return subtractUnitStepsRecursive(candRe, b, qRe - Math.sign(qRe), qIm)
	}
	return subtractUnitStepsRecursive(candIm, b, qRe, qIm - Math.sign(qIm))
}

/**
 * Computes `a - b * (qRe + qIm * i)` safely.
 *
 * @param {Complex} a
 * @param {Complex} b
 * @param {number} qRe
 * @param {number} qIm
 * @returns {Complex}
 */
function subtractGaussianMultiple(a, b, qRe, qIm) {
	if (qRe === 0 && qIm === 0) {
		return { re: a.re, im: a.im }
	}

	const maxB = Math.max(Math.abs(b.re), Math.abs(b.im))
	if (Math.abs(qRe) <= 1 && Math.abs(qIm) <= 1 && maxB <= SCALE_THRESHOLD) {
		const prodRe = b.re * qRe - b.im * qIm
		const prodIm = b.re * qIm + b.im * qRe
		return { re: a.re - prodRe, im: a.im - prodIm }
	}

	return subtractUnitStepsRecursive(a, b, qRe, qIm)
}

/**
 * Recursive divide-and-conquer binary reduction of `a` modulo `b` in the Gaussian lattice `b * Z[i]`.
 *
 * When `|Re(a / b)| >= 1` or `|Im(a / b)| >= 1` (or `a / b` overflows), doubles the divisor
 * to `2b` (exact in IEEE-754 floating point) and recursively computes `r' = a mod (2b)`.
 * Because `r' / (2b) ∈ [-0.5, 0.5]^2`, `r' / b ∈ [-1, 1]^2`, so unwinding requires only
 * a single unit-step Gaussian integer reduction `q ∈ {-1, 0, 1} + {-1, 0, 1}i`.
 *
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function reduceRecursive(a, b) {
	const qApprox = complexDiv(a, b)
	const needsScaling =
		!Number.isFinite(qApprox.re) ||
		!Number.isFinite(qApprox.im) ||
		Math.abs(qApprox.re) >= 1 ||
		Math.abs(qApprox.im) >= 1

	if (needsScaling) {
		const b2Re = b.re * 2
		const b2Im = b.im * 2
		if (Number.isFinite(b2Re) && Number.isFinite(b2Im)) {
			const reduced = reduceRecursive(a, { re: b2Re, im: b2Im })
			const stepQuot = complexDiv(reduced, b)
			const qRe = Math.round(stepQuot.re)
			const qIm = Math.round(stepQuot.im)
			return subtractGaussianMultiple(reduced, b, qRe, qIm)
		}
	}

	const qRe = Math.round(qApprox.re)
	const qIm = Math.round(qApprox.im)
	return subtractGaussianMultiple(a, b, qRe, qIm)
}

/**
 * Computes the Gaussian (complex) modulo `a mod b = a - b * round(a / b)` using a
 * recursive divide-and-conquer binary divisor-doubling reduction algorithm.
 *
 * Algorithm:
 * - Recursively doubles the modulus `b -> 2b` until `|Re(a / (2^k b))| < 1` and
 *   `|Im(a / (2^k b))| < 1` (or doubling would overflow).
 * - Unwinds the recursion in `O(log(|a| / |b|))` steps; at each level, reducing
 *   the remainder from `mod (2b)` to `mod b` subtracts at most a unit Gaussian multiple
 *   `q ∈ {-1, 0, 1} + {-1, 0, 1}i` of `b`.
 * - The resulting remainder `r` satisfies `a = b * q + r` for the nearest Gaussian integer
 *   `q = round(Re(a / b)) + round(Im(a / b))i` and `|r|^2 <= (1/2) |b|^2`.
 *
 * @param {Complex} a - Dividend complex number `{ re, im }`.
 * @param {Complex} b - Non-zero divisor complex number `{ re, im }`.
 * @returns {Complex} Remainder `{ re, im }` with `-0` normalized to `0`.
 * @throws {TypeError} If `a` or `b` is not a complex number object `{ re, im }` with numeric properties.
 * @throws {RangeError} If any component is non-finite (`NaN`, `±Infinity`), or if `b` is `0 + 0i`.
 */
export function moduloComplexRecursive(a, b) {
	assertValidComplex(a, 'a')
	assertValidComplex(b, 'b')

	if (b.re === 0 && b.im === 0) {
		throw new RangeError('Cannot compute complex modulo with zero divisor b = { re: 0, im: 0 }')
	}

	const remainder = reduceRecursive({ re: a.re, im: a.im }, { re: b.re, im: b.im })
	return normalizeComplex(remainder)
}
