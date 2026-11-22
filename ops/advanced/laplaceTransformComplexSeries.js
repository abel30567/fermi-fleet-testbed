/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * @typedef {object} LaplaceComplexSeriesOptions
 * @property {Complex} [shift={ re: 0, im: 0 }]
 *   Complex exponential modulation parameter `a` in `f(t) = exp(a * t) * sum_{k=0}^{N-1} c_k * t^k`.
 *   Applies the first shifting theorem: `L{exp(a * t) * g(t)}(s) = G(s - a)`.
 * @property {number} [delay=0]
 *   Non-negative real time delay `t0 >= 0` in `u(t - t0) * f(t - t0)`.
 *   Applies the second shifting theorem: `L{u(t - t0) * f(t - t0)}(s) = exp(-s * t0) * F(s)`.
 * @property {boolean} [analyticContinuation=false]
 *   When `false` (default), enforces the unilateral Laplace integral region of convergence
 *   `Re(s - shift) > 0`. When `true`, evaluates the meromorphic analytic continuation
 *   anywhere away from the pole `s = shift` (`s - shift !== 0`).
 */

/**
 * Validates that a value is a finite complex number `{ re, im }`.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {Complex}
 */
function validateComplex(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be a complex object { re, im }`)
	}
	const { re, im } = value
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${name}.re and ${name}.im must be numbers`)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${name}.re and ${name}.im must be finite numbers`)
	}
	return { re, im }
}

/**
 * Computes the complex reciprocal `1 / (re + i * im)` using Smith's algorithm
 * to avoid spurious overflow or underflow in `re^2 + im^2`.
 *
 * @param {number} re
 * @param {number} im
 * @returns {Complex}
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
 * Normalizes `-0` to `+0`.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Evaluates the unilateral Laplace transform of a complex power series (optionally
 * modulated by a complex exponential and/or delayed in time) at a complex frequency `s`.
 *
 * Given complex coefficients `c_0, c_1, ..., c_{N-1}`, optional complex shift `a = shift`,
 * and optional non-negative real time delay `t0 = delay`, this computes the unilateral
 * Laplace transform of:
 *
 *   f(t) = u(t - t0) * exp(a * (t - t0)) * sum_{k=0}^{N-1} c_k * (t - t0)^k
 *
 * using the exact term-by-term identity `L{t^k}(s) = k! / s^{k+1}` combined with the
 * first (frequency-shift) and second (time-delay) shifting theorems:
 *
 *   F(s) = exp(-s * t0) * sum_{k=0}^{N-1} (c_k * k!) / (s - a)^{k+1}
 *
 * Algorithm:
 * Let `w = s - a`. Instead of computing `k!` and `w^{k+1}` separately (which overflows
 * IEEE 754 float64 at `k = 171`), the rational sum is evaluated in `O(N)` operations via
 * the exact backward Horner recurrence:
 *
 *   acc_{N-1} = c_{N-1}
 *   acc_k     = c_k + ((k + 1) / w) * acc_{k+1}   for k = N - 2, ..., 0
 *   F(s)      = exp(-s * t0) * (acc_0 / w)
 *
 * The reciprocal `1 / w` is computed via Smith's overflow/underflow-safe formula.
 *
 * @param {ReadonlyArray<Complex>} coefficients
 *   Array of complex power-series coefficients `[c_0, c_1, ..., c_{N-1}]`.
 *   An empty array represents the identically zero function and returns `{ re: 0, im: 0 }`.
 * @param {Complex} s
 *   Complex Laplace frequency parameter `s = { re, im }`.
 * @param {LaplaceComplexSeriesOptions} [options={}]
 *   Optional shift, delay, and analytic continuation controls.
 * @returns {Complex} The complex Laplace transform `F(s) = { re, im }`.
 * @throws {TypeError} If `coefficients` is not an array, any complex input is malformed,
 *   or `options` fields have invalid types.
 * @throws {RangeError} If any numeric input is non-finite, `delay < 0`, `Re(s - shift) <= 0`
 *   (when `analyticContinuation` is `false`), `s === shift` (when `analyticContinuation` is
 *   `true`), or the evaluated transform overflows finite float64 precision.
 */
export function laplaceTransformComplexSeries(coefficients, s, options = {}) {
	if (!Array.isArray(coefficients)) {
		throw new TypeError('coefficients must be an array of complex objects { re, im }')
	}

	const validS = validateComplex(s, 's')

	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object')
	}

	const shift = options.shift === undefined
		? { re: 0, im: 0 }
		: validateComplex(options.shift, 'options.shift')

	let delay = 0
	if (options.delay !== undefined) {
		if (typeof options.delay !== 'number') {
			throw new TypeError('options.delay must be a number')
		}
		if (!Number.isFinite(options.delay) || options.delay < 0) {
			throw new RangeError('options.delay must be a finite non-negative number')
		}
		delay = options.delay
	}

	let analyticContinuation = false
	if (options.analyticContinuation !== undefined) {
		if (typeof options.analyticContinuation !== 'boolean') {
			throw new TypeError('options.analyticContinuation must be a boolean')
		}
		analyticContinuation = options.analyticContinuation
	}

	// Validate all coefficients up front (including sparse holes) and locate last non-zero term.
	let lastNonZero = -1
	for (let k = 0; k < coefficients.length; k++) {
		const ck = validateComplex(coefficients[k], `coefficients[${k}]`)
		if (ck.re !== 0 || ck.im !== 0) {
			lastNonZero = k
		}
	}

	const wRe = validS.re - shift.re
	const wIm = validS.im - shift.im
	if (!Number.isFinite(wRe) || !Number.isFinite(wIm)) {
		throw new RangeError('s - shift overflowed finite precision')
	}

	if (!analyticContinuation) {
		if (wRe <= 0) {
			throw new RangeError(
				'Laplace integral diverges: requires Re(s - shift) > 0 (or set options.analyticContinuation = true)'
			)
		}
	} else if (wRe === 0 && wIm === 0) {
		throw new RangeError('Singular pole: s must not equal shift (s - shift !== 0)')
	}

	if (lastNonZero === -1) {
		return { re: 0, im: 0 }
	}

	const invW = complexReciprocal(wRe, wIm)
	if (!Number.isFinite(invW.re) || !Number.isFinite(invW.im)) {
		throw new RangeError('1 / (s - shift) overflowed finite precision')
	}

	// Backward Horner evaluation of sum_{k=0}^{lastNonZero} c_k * k! / w^{k+1}
	let accRe = coefficients[lastNonZero].re
	let accIm = coefficients[lastNonZero].im
	const invScaleLarge = Math.max(Math.abs(invW.re), Math.abs(invW.im)) > 1e150

	for (let k = lastNonZero - 1; k >= 0; k--) {
		const factor = k + 1
		let nextRe
		let nextIm
		if (invScaleLarge) {
			const scaledRe = accRe * factor
			const scaledIm = accIm * factor
			nextRe = scaledRe * invW.re - scaledIm * invW.im
			nextIm = scaledRe * invW.im + scaledIm * invW.re
		} else {
			const mulRe = invW.re * factor
			const mulIm = invW.im * factor
			nextRe = accRe * mulRe - accIm * mulIm
			nextIm = accRe * mulIm + accIm * mulRe
		}
		accRe = coefficients[k].re + nextRe
		accIm = coefficients[k].im + nextIm
	}

	let resRe = accRe * invW.re - accIm * invW.im
	let resIm = accRe * invW.im + accIm * invW.re

	if (delay > 0) {
		const negRe = -validS.re * delay
		const negIm = -validS.im * delay
		const mag = Math.exp(negRe)
		const phaseRe = mag * Math.cos(negIm)
		const phaseIm = mag * Math.sin(negIm)
		const delayedRe = resRe * phaseRe - resIm * phaseIm
		const delayedIm = resRe * phaseIm + resIm * phaseRe
		resRe = delayedRe
		resIm = delayedIm
	}

	if (!Number.isFinite(resRe) || !Number.isFinite(resIm)) {
		throw new RangeError('Laplace transform evaluation overflowed finite float64 precision')
	}

	return {
		re: normalizeZero(resRe),
		im: normalizeZero(resIm),
	}
}
