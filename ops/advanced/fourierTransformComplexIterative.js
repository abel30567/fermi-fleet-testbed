/**
 * Computes the Discrete Fourier Transform (DFT) or Inverse Discrete Fourier
 * Transform (IDFT) of a sequence of complex numbers represented as `{ re, im }`
 * objects using a straightforward iterative O(N^2) algorithm.
 *
 * Forward DFT (default):
 *   X[k] = sum_{n=0}^{N-1} x[n] * exp(-i * 2 * pi * k * n / N)
 *
 * Inverse DFT (`options.inverse = true`):
 *   x[n] = (1 / N) * sum_{k=0}^{N-1} X[k] * exp(+i * 2 * pi * k * n / N)
 *
 * @param {Array<{ re: number, im: number }>} signal - Input sequence of complex numbers.
 * @param {{ inverse?: boolean }} [options] - Optional transform settings.
 * @param {boolean} [options.inverse=false] - When true, computes the inverse DFT.
 * @returns {Array<{ re: number, im: number }>} Transformed sequence of complex numbers.
 * @throws {TypeError} If `signal` is not an array, contains invalid complex elements, or `options` is malformed.
 * @throws {RangeError} If any complex component (`re` or `im`) is not a finite number.
 */
export function fourierTransformComplexIterative(signal, options = {}) {
	if (!Array.isArray(signal)) {
		throw new TypeError('signal must be an array of { re, im } complex numbers')
	}

	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object when provided')
	}

	const { inverse = false } = options
	if (typeof inverse !== 'boolean') {
		throw new TypeError('options.inverse must be a boolean')
	}

	const n = signal.length
	for (let i = 0; i < n; i++) {
		if (!(i in signal)) {
			throw new TypeError(`signal[${i}] must be an object with numeric re and im properties`)
		}
		const elem = signal[i]
		if (elem === null || typeof elem !== 'object') {
			throw new TypeError(`signal[${i}] must be an object with numeric re and im properties`)
		}
		if (typeof elem.re !== 'number' || typeof elem.im !== 'number') {
			throw new TypeError(`signal[${i}].re and signal[${i}].im must be numbers`)
		}
		if (!Number.isFinite(elem.re) || !Number.isFinite(elem.im)) {
			throw new RangeError(`signal[${i}].re and signal[${i}].im must be finite numbers`)
		}
	}

	if (n === 0) {
		return []
	}

	const sign = inverse ? 1 : -1
	const twoPiOverN = (2 * Math.PI) / n
	const output = new Array(n)

	for (let k = 0; k < n; k++) {
		let sumRe = 0
		let sumIm = 0
		const baseAngle = sign * twoPiOverN * k

		for (let j = 0; j < n; j++) {
			const angle = baseAngle * j
			const cos = Math.cos(angle)
			const sin = Math.sin(angle)
			const { re, im } = signal[j]

			sumRe += re * cos - im * sin
			sumIm += re * sin + im * cos
		}

		if (inverse) {
			sumRe /= n
			sumIm /= n
		}

		output[k] = {
			re: sumRe === 0 ? 0 : sumRe,
			im: sumIm === 0 ? 0 : sumIm,
		}
	}

	return output
}
