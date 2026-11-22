/**
 * Computes the Discrete Fourier Transform (DFT) or Inverse Discrete Fourier
 * Transform (IDFT) of a finite sequence over IEEE-754 float64 numbers using a
 * straightforward iterative O(N^2) implementation.
 *
 * Forward DFT (`inverse === false`):
 *   X[k] = sum_{n=0}^{N-1} x[n] * exp(-i * 2 * pi * k * n / N)
 *
 * Inverse DFT (`inverse === true`):
 *   x[k] = (1 / N) * sum_{n=0}^{N-1} X[n] * exp(+i * 2 * pi * k * n / N)
 *
 * @typedef {{ re: number, im: number }} ComplexNumber
 */

/**
 * Validates and extracts the real and imaginary float64 components of a single
 * signal sample.
 *
 * @param {number | ComplexNumber} sample - Input sample (finite number or `{ re, im }`).
 * @param {number} index - Sample index used in error messages.
 * @returns {ComplexNumber} Normalized complex sample.
 * @throws {TypeError} If the sample is neither a number nor a `{ re, im }` object with numeric fields.
 * @throws {RangeError} If any numeric component is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
function parseSample(sample, index) {
	if (typeof sample === 'number') {
		if (!Number.isFinite(sample)) {
			throw new RangeError(`signal[${index}] must be a finite number`)
		}
		return { re: sample, im: 0 }
	}

	if (typeof sample === 'object' && sample !== null && !Array.isArray(sample)) {
		const { re, im } = sample
		if (typeof re !== 'number' || typeof im !== 'number') {
			throw new TypeError(
				`signal[${index}] complex object must have numeric 're' and 'im' properties`
			)
		}
		if (!Number.isFinite(re) || !Number.isFinite(im)) {
			throw new RangeError(
				`signal[${index}] complex object 're' and 'im' must be finite numbers`
			)
		}
		return { re, im }
	}

	throw new TypeError(
		`signal[${index}] must be a finite number or a { re, im } complex object`
	)
}

/**
 * Computes the Discrete Fourier Transform (or Inverse DFT when `inverse` is
 * `true`) of a non-empty array of real numbers and/or `{ re, im }` complex
 * objects over IEEE-754 float64 arithmetic.
 *
 * Does not mutate the input array or any of its elements.
 *
 * @param {ReadonlyArray<number | ComplexNumber>} signal - Non-empty input sequence of finite real numbers or `{ re, im }` complex objects.
 * @param {boolean} [inverse=false] - When `false` (default), computes the forward DFT; when `true`, computes the inverse DFT scaled by `1 / N`.
 * @returns {ComplexNumber[]} Array of length `signal.length` containing `{ re, im }` IEEE-754 float64 complex numbers.
 * @throws {TypeError} If `signal` is not an Array, contains invalid elements, or `inverse` is not a boolean.
 * @throws {RangeError} If `signal` is empty or contains non-finite numeric values.
 */
export function fourierTransformFloatIterative(signal, inverse = false) {
	if (!Array.isArray(signal)) {
		throw new TypeError('signal must be an array')
	}
	if (typeof inverse !== 'boolean') {
		throw new TypeError('inverse must be a boolean')
	}

	const n = signal.length
	if (n === 0) {
		throw new RangeError('signal must be a non-empty array')
	}

	const reIn = new Float64Array(n)
	const imIn = new Float64Array(n)

	for (let i = 0; i < n; i++) {
		if (!(i in signal)) {
			throw new TypeError(`signal[${i}] must not be a sparse array hole`)
		}
		const { re, im } = parseSample(signal[i], i)
		reIn[i] = re
		imIn[i] = im
	}

	const twoPiOverN = (2 * Math.PI) / n
	const sign = inverse ? 1 : -1
	const result = new Array(n)

	for (let k = 0; k < n; k++) {
		let sumRe = 0
		let sumIm = 0

		for (let j = 0; j < n; j++) {
			const angle = sign * twoPiOverN * ((k * j) % n)
			const cosA = Math.cos(angle)
			const sinA = Math.sin(angle)
			const a = reIn[j]
			const b = imIn[j]

			sumRe += a * cosA - b * sinA
			sumIm += a * sinA + b * cosA
		}

		if (inverse) {
			sumRe /= n
			sumIm /= n
		}

		result[k] = {
			re: sumRe === 0 ? 0 : sumRe,
			im: sumIm === 0 ? 0 : sumIm,
		}
	}

	return result
}
