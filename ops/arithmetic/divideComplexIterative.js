/**
 * @typedef {{ re: number, im: number }} Complex
 */

const SPLIT = 134217729 // 2^27 + 1 for Veltkamp splitting (IEEE 754 binary64)
const SCALE_STEPS = [512, 256, 128, 64, 32, 16, 8, 4, 2, 1]
const MAX_REFINEMENT_ITERATIONS = 4

/**
 * Validates that a value is a finite complex number object `{ re, im }`.
 *
 * @param {unknown} value - Candidate complex number.
 * @param {string} name - Parameter name for error reporting.
 * @throws {TypeError} If `value` is not a plain-like object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is NaN or not finite.
 */
function validateComplex(value, name) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${name} must be an object with numeric { re, im } properties`)
	}
	if (typeof value.re !== 'number' || typeof value.im !== 'number') {
		throw new TypeError(`${name}.re and ${name}.im must be numbers`)
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError(`${name}.re and ${name}.im must be finite numbers`)
	}
}

/**
 * Iteratively normalizes a non-zero complex number by an exact power of two
 * so that `max(|re|, |im|)` lies in `[0.5, 2)`.
 *
 * @param {number} re - Real part.
 * @param {number} im - Imaginary part.
 * @returns {{ re: number, im: number, exp: number }} Normalized components and base-2 exponent.
 */
function normalizeByPow2(re, im) {
	let r = re
	let i = im
	let max = Math.max(Math.abs(r), Math.abs(i))
	let exp = 0

	for (const step of SCALE_STEPS) {
		const upper = 2 ** step
		const down = 2 ** -step
		while (max >= upper) {
			r *= down
			i *= down
			max *= down
			exp += step
		}
		while (max < down) {
			r *= upper
			i *= upper
			max *= upper
			exp -= step
		}
	}

	return { re: r, im: i, exp }
}

/**
 * Iteratively scales a number by `2 ** exp` without intermediate overflow or double rounding.
 *
 * @param {number} x - Value to scale.
 * @param {number} exp - Integer base-2 exponent.
 * @returns {number} Scaled value.
 */
function scaleByPow2(x, exp) {
	if (x === 0 || exp === 0) {
		return x
	}
	let value = x
	let remaining = exp
	while (remaining > 0) {
		const step = remaining > 1023 ? 1023 : remaining
		value *= 2 ** step
		remaining -= step
	}
	while (remaining < 0) {
		const step = remaining < -1022 ? 512 : -remaining
		value *= 2 ** -step
		remaining += step
	}
	return value
}

/**
 * Knuth's error-free transformation for floating-point addition (`x + y = s + err`).
 *
 * @param {number} x
 * @param {number} y
 * @returns {[number, number]}
 */
function twoSum(x, y) {
	const s = x + y
	const v = s - x
	const err = x - (s - v) + (y - v)
	return [s, err]
}

/**
 * Dekker-Veltkamp error-free transformation for floating-point multiplication (`x * y = p + err`).
 *
 * @param {number} x
 * @param {number} y
 * @returns {[number, number]}
 */
function twoProd(x, y) {
	const p = x * y
	const cx = SPLIT * x
	const hx = cx - (cx - x)
	const lx = x - hx
	const cy = SPLIT * y
	const hy = cy - (cy - y)
	const ly = y - hy
	const err = hx * hy - p + hx * ly + lx * hy + lx * ly
	return [p, err]
}

/**
 * Overflow-safe Smith's formula for complex division `(aRe + i*aIm) / (bRe + i*bIm)`.
 *
 * @param {number} aRe
 * @param {number} aIm
 * @param {number} bRe
 * @param {number} bIm
 * @returns {[number, number]}
 */
function smithDivide(aRe, aIm, bRe, bIm) {
	if (Math.abs(bRe) >= Math.abs(bIm)) {
		const r = bIm / bRe
		const denom = bRe + bIm * r
		return [(aRe + aIm * r) / denom, (aIm - aRe * r) / denom]
	}
	const r = bRe / bIm
	const denom = bIm + bRe * r
	return [(aRe * r + aIm) / denom, (aIm * r - aRe) / denom]
}

/**
 * Divides two complex numbers `a / b` represented as `{ re, im }` objects.
 *
 * Uses iterative power-of-two scaling to eliminate spurious intermediate overflow
 * and underflow across the full IEEE 754 binary64 exponent range, Smith's formula
 * for the initial quotient, and iterative high-precision residual refinement
 * (`q_{k+1} = q_k + (a - b * q_k) / b`) for full double-precision accuracy.
 *
 * @param {Complex} a - The dividend complex number `{ re, im }`.
 * @param {Complex} b - The non-zero divisor complex number `{ re, im }`.
 * @returns {Complex} The quotient `{ re, im }` representing `a / b`.
 * @throws {TypeError} If `a` or `b` is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If any component is non-finite (NaN or ±Infinity), or if `b` is zero (`0 + 0i`).
 */
export function divideComplexIterative(a, b) {
	validateComplex(a, 'a')
	validateComplex(b, 'b')

	if (b.re === 0 && b.im === 0) {
		throw new RangeError('Division by zero: complex divisor must be non-zero')
	}

	if (a.re === 0 && a.im === 0) {
		return { re: 0, im: 0 }
	}

	const normA = normalizeByPow2(a.re, a.im)
	const normB = normalizeByPow2(b.re, b.im)

	let [qRe, qIm] = smithDivide(normA.re, normA.im, normB.re, normB.im)

	for (let iter = 0; iter < MAX_REFINEMENT_ITERATIONS; iter++) {
		// Residual r = normA - normB * q computed with error-free transformations
		const [p1, e1] = twoProd(normB.re, qRe)
		const [p2, e2] = twoProd(normB.im, qIm)
		const [s1, t1] = twoSum(normA.re, -p1)
		const [s2, t2] = twoSum(s1, p2)
		const resRe = s2 + (t1 + t2 - e1 + e2)

		const [p3, e3] = twoProd(normB.re, qIm)
		const [p4, e4] = twoProd(normB.im, qRe)
		const [s3, t3] = twoSum(normA.im, -p3)
		const [s4, t4] = twoSum(s3, -p4)
		const resIm = s4 + (t3 + t4 - e3 - e4)

		if (resRe === 0 && resIm === 0) {
			break
		}

		const [dqRe, dqIm] = smithDivide(resRe, resIm, normB.re, normB.im)
		if (!Number.isFinite(dqRe) || !Number.isFinite(dqIm)) {
			break
		}

		const nextRe = qRe + dqRe
		const nextIm = qIm + dqIm
		if (nextRe === qRe && nextIm === qIm) {
			break
		}

		qRe = nextRe
		qIm = nextIm
	}

	const expDiff = normA.exp - normB.exp
	const re = scaleByPow2(qRe, expDiff)
	const im = scaleByPow2(qIm, expDiff)

	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	}
}
