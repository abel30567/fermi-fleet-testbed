/**
 * Computes the Discrete Fourier Transform (DFT) or Inverse Discrete Fourier Transform (IDFT)
 * element-wise over `Float64Array` inputs using a straightforward iterative O(N^2) algorithm.
 *
 * Forward transform (`inverse: false`, default):
 *   X[k] = sum_{n=0}^{N-1} x[n] * exp(-i * 2 * pi * k * n / N)
 *
 * Inverse transform (`inverse: true`):
 *   x[n] = (1 / N) * sum_{k=0}^{N-1} X[k] * exp(+i * 2 * pi * k * n / N)
 *
 * @param {Float64Array} real - Real part of the input signal. Every element must be finite.
 * @param {Float64Array | null} [imag=null] - Optional imaginary part of the input signal.
 *   If provided, must be a `Float64Array` of the same length as `real` with finite elements.
 * @param {{ inverse?: boolean }} [options={}] - Optional configuration object.
 * @param {boolean} [options.inverse=false] - When `true`, computes the inverse DFT scaled by `1 / N`.
 * @returns {{ real: Float64Array, imag: Float64Array }} Transformed real and imaginary `Float64Array` outputs.
 * @throws {TypeError} If `real` is not a `Float64Array`, `imag` is provided and not a `Float64Array`,
 *   or `options` / `options.inverse` has an invalid type.
 * @throws {RangeError} If `imag` length does not match `real` length, or any element is `NaN` or non-finite.
 */
export function fourierTransformTypedIterative(real, imag = null, options = {}) {
	if (!(real instanceof Float64Array)) {
		throw new TypeError('Expected "real" to be a Float64Array')
	}

	const hasImag = imag !== null && imag !== undefined
	if (hasImag && !(imag instanceof Float64Array)) {
		throw new TypeError('Expected "imag" to be a Float64Array, null, or undefined')
	}

	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('Expected "options" to be a plain object')
	}

	const { inverse = false } = options
	if (typeof inverse !== 'boolean') {
		throw new TypeError('Expected "options.inverse" to be a boolean')
	}

	const n = real.length
	if (hasImag && imag.length !== n) {
		throw new RangeError(
			`Length mismatch: "real" has length ${n}, but "imag" has length ${imag.length}`
		)
	}

	for (let i = 0; i < n; i++) {
		if (!Number.isFinite(real[i])) {
			throw new RangeError(`Non-finite value in "real" at index ${i}: ${real[i]}`)
		}
		if (hasImag && !Number.isFinite(imag[i])) {
			throw new RangeError(`Non-finite value in "imag" at index ${i}: ${imag[i]}`)
		}
	}

	const outReal = new Float64Array(n)
	const outImag = new Float64Array(n)

	if (n === 0) {
		return { real: outReal, imag: outImag }
	}

	const sign = inverse ? 1 : -1
	const scale = inverse ? 1 / n : 1
	const twoPiOverN = (2 * Math.PI) / n

	for (let k = 0; k < n; k++) {
		let sumReal = 0
		let sumImag = 0
		const baseAngle = sign * twoPiOverN * k

		if (hasImag) {
			for (let t = 0; t < n; t++) {
				const angle = baseAngle * t
				const cos = Math.cos(angle)
				const sin = Math.sin(angle)
				const re = real[t]
				const im = imag[t]
				sumReal += re * cos - im * sin
				sumImag += re * sin + im * cos
			}
		} else {
			for (let t = 0; t < n; t++) {
				const angle = baseAngle * t
				const re = real[t]
				sumReal += re * Math.cos(angle)
				sumImag += re * Math.sin(angle)
			}
		}

		outReal[k] = sumReal * scale
		outImag[k] = sumImag * scale
	}

	return { real: outReal, imag: outImag }
}
