/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * @typedef {Object} FourierTransformOptions
 * @property {boolean} [inverse=false] - When true, computes the inverse discrete Fourier transform (scaled by 1/N).
 */

/**
 * Computes the discrete Fourier transform (DFT) or inverse DFT of a sequence of
 * IEEE-754 float64 real numbers or complex `{ re, im }` values using a recursive
 * divide-and-conquer Cooley-Tukey radix-2 FFT, with Bluestein's chirp-z algorithm
 * (backed by the same recursive radix-2 FFT) for odd factors greater than 1.
 *
 * Forward DFT (`inverse: false`):
 *   X[k] = sum_{n=0}^{N-1} x[n] * exp(-2πi * k * n / N)
 *
 * Inverse DFT (`inverse: true`):
 *   x[n] = (1 / N) * sum_{k=0}^{N-1} X[k] * exp(+2πi * k * n / N)
 *
 * @param {Array<number | Complex> | Float64Array} input - Non-empty sequence of finite float64 numbers or `{ re, im }` complex objects.
 * @param {FourierTransformOptions} [options={}] - Transform options.
 * @returns {Complex[]} Array of complex `{ re, im }` IEEE-754 float64 frequency/time-domain bins.
 * @throws {TypeError} If `input` is not an Array or Float64Array, if any element is neither a number nor a `{ re, im }` object with numeric fields, or if `options` / `options.inverse` has an invalid type.
 * @throws {RangeError} If `input` is empty or if any real/imaginary component is non-finite (`NaN`, `Infinity`, `-Infinity`).
 */
export function fourierTransformFloatRecursive(input, options = {}) {
	if (!Array.isArray(input) && !(input instanceof Float64Array)) {
		throw new TypeError('Expected input to be an Array or Float64Array')
	}

	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('Expected options to be a plain object')
	}

	const { inverse = false } = options
	if (typeof inverse !== 'boolean') {
		throw new TypeError('Expected options.inverse to be a boolean')
	}

	const n = input.length
	if (n === 0) {
		throw new RangeError('Input sequence must not be empty')
	}

	/** @type {Complex[]} */
	const normalized = new Array(n)
	const isTyped = input instanceof Float64Array

	for (let i = 0; i < n; i++) {
		if (!isTyped && !(i in input)) {
			throw new TypeError(`Input element at index ${i} is missing (sparse array)`)
		}
		const item = input[i]
		if (typeof item === 'number') {
			if (!Number.isFinite(item)) {
				throw new RangeError(`Input element at index ${i} must be a finite number`)
			}
			normalized[i] = { re: item, im: 0 }
		} else if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
			if (typeof item.re !== 'number' || typeof item.im !== 'number') {
				throw new TypeError(
					`Complex input element at index ${i} must have numeric "re" and "im" properties`
				)
			}
			if (!Number.isFinite(item.re) || !Number.isFinite(item.im)) {
				throw new RangeError(
					`Complex input element at index ${i} must have finite "re" and "im" values`
				)
			}
			normalized[i] = { re: item.re, im: item.im }
		} else {
			throw new TypeError(
				`Input element at index ${i} must be a finite number or a { re, im } complex object`
			)
		}
	}

	const sign = inverse ? 1 : -1
	const result = fftRecursive(normalized, sign)

	if (inverse) {
		for (let i = 0; i < n; i++) {
			const re = result[i].re / n
			const im = result[i].im / n
			result[i] = {
				re: re === 0 ? 0 : re,
				im: im === 0 ? 0 : im,
			}
		}
	} else {
		for (let i = 0; i < n; i++) {
			const re = result[i].re
			const im = result[i].im
			result[i] = {
				re: re === 0 ? 0 : re,
				im: im === 0 ? 0 : im,
			}
		}
	}

	return result
}

/**
 * Recursive Cooley-Tukey radix-2 divide-and-conquer FFT.
 * Splits even-length inputs into even and odd subsequences recursively.
 * Odd lengths greater than 1 are evaluated via Bluestein's algorithm using
 * this same recursive radix-2 FFT on a power-of-2 padded convolution.
 *
 * @param {Complex[]} data
 * @param {1 | -1} sign
 * @returns {Complex[]}
 */
function fftRecursive(data, sign) {
	const n = data.length
	if (n === 1) {
		return [{ re: data[0].re, im: data[0].im }]
	}

	if ((n & 1) !== 0) {
		return bluesteinDft(data, sign)
	}

	const half = n / 2
	/** @type {Complex[]} */
	const even = new Array(half)
	/** @type {Complex[]} */
	const odd = new Array(half)

	for (let i = 0; i < half; i++) {
		even[i] = data[2 * i]
		odd[i] = data[2 * i + 1]
	}

	const evenTransform = fftRecursive(even, sign)
	const oddTransform = fftRecursive(odd, sign)

	/** @type {Complex[]} */
	const out = new Array(n)
	const angleStep = (sign * 2 * Math.PI) / n

	for (let k = 0; k < half; k++) {
		const angle = angleStep * k
		const wr = Math.cos(angle)
		const wi = Math.sin(angle)

		const or = oddTransform[k].re
		const oi = oddTransform[k].im
		const tr = wr * or - wi * oi
		const ti = wr * oi + wi * or

		const er = evenTransform[k].re
		const ei = evenTransform[k].im

		out[k] = { re: er + tr, im: ei + ti }
		out[k + half] = { re: er - tr, im: ei - ti }
	}

	return out
}

/**
 * Computes an arbitrary-length DFT via Bluestein's chirp-z algorithm,
 * reducing length-N DFT to a power-of-2 circular convolution evaluated
 * with `fftRecursive`.
 *
 * @param {Complex[]} data
 * @param {1 | -1} sign
 * @returns {Complex[]}
 */
function bluesteinDft(data, sign) {
	const n = data.length
	let m = 1
	const minSize = 2 * n - 1
	while (m < minSize) {
		m *= 2
	}

	const twoN = 2 * n
	/** @type {Complex[]} */
	const chirp = new Array(n)
	for (let k = 0; k < n; k++) {
		const angle = (sign * Math.PI * ((k * k) % twoN)) / n
		chirp[k] = { re: Math.cos(angle), im: Math.sin(angle) }
	}

	/** @type {Complex[]} */
	const a = new Array(m)
	/** @type {Complex[]} */
	const b = new Array(m)
	for (let i = 0; i < m; i++) {
		a[i] = { re: 0, im: 0 }
		b[i] = { re: 0, im: 0 }
	}

	for (let k = 0; k < n; k++) {
		const xr = data[k].re
		const xi = data[k].im
		const wr = chirp[k].re
		const wi = chirp[k].im
		a[k] = {
			re: xr * wr - xi * wi,
			im: xr * wi + xi * wr,
		}
	}

	b[0] = { re: chirp[0].re, im: -chirp[0].im }
	for (let k = 1; k < n; k++) {
		const conj = { re: chirp[k].re, im: -chirp[k].im }
		b[k] = conj
		b[m - k] = conj
	}

	const freqA = fftRecursive(a, -1)
	const freqB = fftRecursive(b, -1)

	/** @type {Complex[]} */
	const product = new Array(m)
	for (let i = 0; i < m; i++) {
		const ar = freqA[i].re
		const ai = freqA[i].im
		const br = freqB[i].re
		const bi = freqB[i].im
		product[i] = {
			re: ar * br - ai * bi,
			im: ar * bi + ai * br,
		}
	}

	const conv = fftRecursive(product, 1)

	/** @type {Complex[]} */
	const out = new Array(n)
	for (let k = 0; k < n; k++) {
		const cr = conv[k].re / m
		const ci = conv[k].im / m
		const wr = chirp[k].re
		const wi = chirp[k].im
		out[k] = {
			re: cr * wr - ci * wi,
			im: cr * wi + ci * wr,
		}
	}

	return out
}
