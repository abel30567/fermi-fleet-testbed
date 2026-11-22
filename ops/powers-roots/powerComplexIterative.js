/**
 * Normalizes negative zero (-0) to positive zero (0).
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Validates that a value is a finite complex number object `{ re, im }`.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {{ re: number, im: number }}
 * @throws {TypeError} If value is not a plain-like object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is NaN or not finite.
 */
function validateComplex(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be an object with numeric { re, im } properties`)
	}
	if (typeof value.re !== 'number' || typeof value.im !== 'number') {
		throw new TypeError(`${name}.re and ${name}.im must be numbers`)
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError(`${name}.re and ${name}.im must be finite numbers`)
	}
	return {
		re: normalizeZero(value.re),
		im: normalizeZero(value.im),
	}
}

/**
 * Computes the reciprocal 1 / (re + im*i) using Smith's scaling formula
 * to avoid spurious intermediate overflow or underflow.
 *
 * @param {number} re
 * @param {number} im
 * @returns {{ re: number, im: number }}
 */
function complexReciprocal(re, im) {
	if (Math.abs(re) >= Math.abs(im)) {
		const ratio = im / re
		const denom = re + im * ratio
		return { re: 1 / denom, im: -ratio / denom }
	}
	const ratio = re / im
	const denom = im + re * ratio
	return { re: ratio / denom, im: -1 / denom }
}

/**
 * Computes (re + im*i)^n for a non-negative safe integer n using iterative
 * binary exponentiation by squaring.
 *
 * @param {number} re
 * @param {number} im
 * @param {number} n
 * @returns {{ re: number, im: number }}
 */
function complexIntPow(re, im, n) {
	let resRe = 1
	let resIm = 0
	let baseRe = re
	let baseIm = im
	let exp = n

	while (exp > 0) {
		if (exp % 2 === 1) {
			const nextRe = resRe * baseRe - resIm * baseIm
			const nextIm = resRe * baseIm + resIm * baseRe
			resRe = nextRe
			resIm = nextIm
		}
		exp = Math.floor(exp / 2)
		if (exp > 0) {
			const nextBaseRe = baseRe * baseRe - baseIm * baseIm
			const nextBaseIm = 2 * baseRe * baseIm
			baseRe = nextBaseRe
			baseIm = nextBaseIm
		}
	}

	return { re: resRe, im: resIm }
}

/**
 * Computes the complex power z^w for complex numbers represented as `{ re, im }`.
 *
 * Uses iterative exponentiation by squaring for safe integer exponents (with
 * exact handling of negative integers via Smith's complex reciprocal), and the
 * principal branch `exp(w * Log(z))` with `Arg(z) in (-pi, pi]` for general
 * complex or non-integer exponents.
 *
 * Zero-base conventions:
 * - `0^0 = 1 + 0i`
 * - `0^w = 0 + 0i` when `Re(w) > 0`
 * - `0^w` throws `RangeError` when `Re(w) < 0` or (`Re(w) === 0` and `Im(w) !== 0`)
 *
 * @param {{ re: number, im: number }} base - The complex base `z`.
 * @param {{ re: number, im: number }} exponent - The complex exponent `w`.
 * @returns {{ re: number, im: number }} The principal value of `z^w`.
 * @throws {TypeError} If `base` or `exponent` is not an object with numeric `re` and `im`.
 * @throws {RangeError} If any component is non-finite, if `0^w` is undefined, or if the result overflows.
 */
export function powerComplexIterative(base, exponent) {
	const { re: a, im: b } = validateComplex(base, 'base')
	const { re: c, im: d } = validateComplex(exponent, 'exponent')

	// Any finite complex number to the power 0 is 1 (including 0^0 = 1).
	if (c === 0 && d === 0) {
		return { re: 1, im: 0 }
	}

	// Handle zero base carefully.
	if (a === 0 && b === 0) {
		if (c > 0) {
			return { re: 0, im: 0 }
		}
		if (c < 0) {
			throw new RangeError('0 raised to a power with negative real part is undefined')
		}
		throw new RangeError('0 raised to a nonzero purely imaginary power is undefined')
	}

	// Exact iterative exponentiation by squaring for safe integer exponents.
	if (d === 0 && Number.isSafeInteger(c)) {
		if (c > 0) {
			const res = complexIntPow(a, b, c)
			if (!Number.isFinite(res.re) || !Number.isFinite(res.im)) {
				throw new RangeError('Complex power overflowed finite floating-point range')
			}
			return { re: normalizeZero(res.re), im: normalizeZero(res.im) }
		}

		const absN = -c
		const posPow = complexIntPow(a, b, absN)
		let res
		if (Number.isFinite(posPow.re) && Number.isFinite(posPow.im)) {
			if (posPow.re === 0 && posPow.im === 0) {
				throw new RangeError('Complex power overflowed finite floating-point range')
			}
			res = complexReciprocal(posPow.re, posPow.im)
		} else {
			const inv = complexReciprocal(a, b)
			res = complexIntPow(inv.re, inv.im, absN)
		}

		if (!Number.isFinite(res.re) || !Number.isFinite(res.im)) {
			throw new RangeError('Complex power overflowed finite floating-point range')
		}
		return { re: normalizeZero(res.re), im: normalizeZero(res.im) }
	}

	// Exact real path for positive real base and real exponent.
	if (b === 0 && a > 0 && d === 0) {
		const realPow = Math.pow(a, c)
		if (!Number.isFinite(realPow)) {
			throw new RangeError('Complex power overflowed finite floating-point range')
		}
		return { re: normalizeZero(realPow), im: 0 }
	}

	// General complex power via principal branch: exp(w * Log(z)).
	const r = Math.hypot(a, b)
	let lnR
	if (Number.isFinite(r) && r > 0) {
		lnR = Math.log(r)
	} else {
		const maxAbs = Math.max(Math.abs(a), Math.abs(b))
		lnR = Math.log(maxAbs) + Math.log(Math.hypot(a / maxAbs, b / maxAbs))
	}
	const theta = Math.atan2(b, a)

	const u = c * lnR - d * theta
	const v = c * theta + d * lnR

	const mag = Math.exp(u)
	const resRe = mag * Math.cos(v)
	const resIm = mag * Math.sin(v)

	if (!Number.isFinite(resRe) || !Number.isFinite(resIm)) {
		throw new RangeError('Complex power overflowed finite floating-point range')
	}

	return { re: normalizeZero(resRe), im: normalizeZero(resIm) }
}
