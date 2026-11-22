const TWO_PI = 2 * Math.PI

/**
 * Adds a value to a Neumaier compensated accumulator `[sum, compensation]`.
 *
 * @param {[number, number]} acc - Running `[sum, compensation]` pair.
 * @param {number} value - Finite float64 summand.
 */
function neumaierAdd(acc, value) {
	const t = acc[0] + value
	if (Math.abs(acc[0]) >= Math.abs(value)) {
		acc[1] += (acc[0] - t) + value
	} else {
		acc[1] += (value - t) + acc[0]
	}
	acc[0] = t
}

/**
 * Normalizes `-0` to `+0` and asserts that the IEEE-754 float64 value is finite.
 *
 * @param {number} value - Computed float64 value.
 * @param {string} label - Diagnostic label for overflow errors.
 * @returns {number} Finite float64 value with `-0` normalized to `0`.
 * @throws {RangeError} If the value overflowed to a non-finite float64.
 */
function finalizeFloat64(value, label) {
	if (!Number.isFinite(value)) {
		throw new RangeError(`${label} overflowed IEEE-754 float64 range`)
	}
	return value === 0 ? 0 : value
}

/**
 * Computes the Discrete Fourier Transform (DFT) or Inverse Discrete Fourier
 * Transform (IDFT) over a sequence of IEEE-754 float64 real numbers or
 * `{ re, im }` complex float64 objects using the closed-form Euler series
 * identity.
 *
 * Algorithm / Identity:
 *   Forward DFT (`inverse = false`):
 *     X[k] = Σ_{n=0}^{N-1} x[n] · (cos(-2πkn/N) + i·sin(-2πkn/N))
 *
 *   Inverse DFT (`inverse = true`):
 *     x[k] = (1/N) · Σ_{n=0}^{N-1} X[n] · (cos(2πkn/N) + i·sin(2πkn/N))
 *
 * For each `(k, n)` pair, the phase index is reduced modulo `N` (`(k * n) % N`)
 * before multiplying by `2π / N` so trigonometric arguments remain bounded in
 * `(-2π, 2π)`. Real and imaginary series sums are accumulated with Neumaier
 * compensated summation to reduce IEEE-754 float64 rounding error.
 *
 * @param {Array<number | { re: number, im: number }>} samples - Input sequence
 *   of finite IEEE-754 float64 numbers or `{ re, im }` complex float64 objects.
 * @param {{ inverse?: boolean }} [options={}] - Optional transform settings.
 * @param {boolean} [options.inverse=false] - When `true`, computes the inverse
 *   DFT scaled by `1 / N`.
 * @returns {Array<{ re: number, im: number }>} Transformed sequence of complex
 *   IEEE-754 float64 `{ re, im }` objects with the same length as `samples`.
 * @throws {TypeError} If `samples` is not an Array, contains invalid entries,
 *   or `options` / `options.inverse` has an invalid type.
 * @throws {RangeError} If any input numeric component is non-finite (`NaN`,
 *   `Infinity`, `-Infinity`) or if an intermediate/output sum overflows
 *   IEEE-754 float64 range.
 */
export function fourierTransformFloatSeries(samples, options = {}) {
	if (!Array.isArray(samples)) {
		throw new TypeError(
			'samples must be an Array of finite numbers or { re, im } complex objects'
		)
	}

	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object')
	}

	const { inverse = false } = options
	if (typeof inverse !== 'boolean') {
		throw new TypeError('options.inverse must be a boolean')
	}

	const nLen = samples.length
	const inRe = new Float64Array(nLen)
	const inIm = new Float64Array(nLen)

	for (let n = 0; n < nLen; n++) {
		if (!(n in samples)) {
			throw new TypeError(`samples[${n}] must be a finite number or { re, im } object`)
		}
		const entry = samples[n]
		if (typeof entry === 'number') {
			if (!Number.isFinite(entry)) {
				throw new RangeError(`samples[${n}] must be a finite IEEE-754 float64 number`)
			}
			inRe[n] = entry
			inIm[n] = 0
		} else if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
			if (typeof entry.re !== 'number' || typeof entry.im !== 'number') {
				throw new TypeError(
					`samples[${n}] must have numeric re and im properties`
				)
			}
			if (!Number.isFinite(entry.re) || !Number.isFinite(entry.im)) {
				throw new RangeError(
					`samples[${n}].re and samples[${n}].im must be finite IEEE-754 float64 numbers`
				)
			}
			inRe[n] = entry.re
			inIm[n] = entry.im
		} else {
			throw new TypeError(
				`samples[${n}] must be a finite number or { re, im } object`
			)
		}
	}

	if (nLen === 0) {
		return []
	}

	const sign = inverse ? 1 : -1
	const scale = inverse ? 1 / nLen : 1
	const result = new Array(nLen)

	for (let k = 0; k < nLen; k++) {
		/** @type {[number, number]} */
		const accRe = [0, 0]
		/** @type {[number, number]} */
		const accIm = [0, 0]

		for (let n = 0; n < nLen; n++) {
			const phaseIndex = (k * n) % nLen
			let cosVal
			let sinVal
			if (phaseIndex === 0) {
				cosVal = 1
				sinVal = 0
			} else {
				const angle = (sign * TWO_PI * phaseIndex) / nLen
				cosVal = Math.cos(angle)
				sinVal = Math.sin(angle)
			}

			const xr = inRe[n]
			const xi = inIm[n]

			// (xr + i·xi) · (cosVal + i·sinVal)
			neumaierAdd(accRe, xr * cosVal)
			neumaierAdd(accRe, -xi * sinVal)
			neumaierAdd(accIm, xr * sinVal)
			neumaierAdd(accIm, xi * cosVal)
		}

		const re = finalizeFloat64((accRe[0] + accRe[1]) * scale, `result[${k}].re`)
		const im = finalizeFloat64((accIm[0] + accIm[1]) * scale, `result[${k}].im`)
		result[k] = { re, im }
	}

	return result
}
