/**
 * Validates that a value is a complex number object `{ re, im }` with finite numeric components.
 *
 * @param {unknown} value - Candidate complex number.
 * @param {number} index - Element index in the input signal for error reporting.
 * @throws {TypeError} If the element is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
function validateComplexElement(value, index) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`signal[${index}] must be a complex number object { re, im }`)
	}
	if (typeof value.re !== 'number' || typeof value.im !== 'number') {
		throw new TypeError(`signal[${index}].re and signal[${index}].im must be numbers`)
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError(`signal[${index}].re and signal[${index}].im must be finite numbers`)
	}
}

/**
 * Computes the Discrete Fourier Transform (DFT) or Inverse Discrete Fourier Transform (IDFT)
 * of a sequence of complex numbers `{ re, im }` using a straightforward iterative algorithm.
 *
 * Forward transform (`inverse = false`):
 *   X[k] = sum_{n=0}^{N-1} x[n] * exp(-i * 2 * pi * k * n / N)
 *
 * Inverse transform (`inverse = true`):
 *   x[n] = (1 / N) * sum_{k=0}^{N-1} X[k] * exp(+i * 2 * pi * k * n / N)
 *
 * @param {Array<{ re: number, im: number }>} signal - Input array of complex numbers.
 * @param {{ inverse?: boolean }} [options={}] - Optional configuration.
 * @param {boolean} [options.inverse=false] - When `true`, computes the inverse DFT scaled by `1 / N`.
 * @returns {Array<{ re: number, im: number }>} New array of transformed complex numbers `{ re, im }`.
 * @throws {TypeError} If `signal` is not an array, any element is not `{ re, im }` with numeric fields,
 *   `options` is not a plain object, or `options.inverse` is not a boolean.
 * @throws {RangeError} If any complex component (`re` or `im`) is `NaN`, `Infinity`, or `-Infinity`.
 */
export function fourierTransformComplexIterative(signal, options = {}) {
	if (!Array.isArray(signal)) {
		throw new TypeError('signal must be an array of complex numbers { re, im }')
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be an object')
	}

	const { inverse = false } = options
	if (typeof inverse !== 'boolean') {
		throw new TypeError('options.inverse must be a boolean')
	}

	const n = signal.length
	for (let i = 0; i < n; i++) {
		validateComplexElement(signal[i], i)
	}

	if (n === 0) {
		return []
	}

	const sign = inverse ? 1 : -1
	const twoPiOverN = (2 * Math.PI) / n
	const scale = inverse ? 1 / n : 1
	const result = new Array(n)

	for (let k = 0; k < n; k++) {
		let sumRe = 0
		let sumIm = 0
		const baseAngle = sign * twoPiOverN * k

		for (let t = 0; t < n; t++) {
			const angle = baseAngle * t
			const cos = Math.cos(angle)
			const sin = Math.sin(angle)
			const { re, im } = signal[t]

			sumRe += re * cos - im * sin
			sumIm += re * sin + im * cos
		}

		const outRe = sumRe * scale
		const outIm = sumIm * scale
		result[k] = {
			re: outRe === 0 ? 0 : outRe,
			im: outIm === 0 ? 0 : outIm,
		}
	}

	return result
}
