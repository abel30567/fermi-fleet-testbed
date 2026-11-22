/**
 * @typedef {{ re: number, im: number }} Complex
 * A complex number represented in Cartesian form `re + i * im`.
 */

/**
 * @typedef {Object} FourierTransformOptions
 * @property {boolean} [inverse=false]
 *   When `false` (default), computes the forward Discrete Fourier Transform (DFT)
 *   with exponent sign `-1`. When `true`, computes the inverse DFT (IDFT) with
 *   exponent sign `+1`.
 * @property {'standard' | 'unitary' | 'none'} [normalization='standard']
 *   Scaling convention applied to the transform output:
 *   - `'standard'` (default): forward scale `1`, inverse scale `1 / N`.
 *   - `'unitary'`: both forward and inverse scaled by `1 / sqrt(N)`, making the
 *     transform a unitary operator preserving Euclidean (L2) norm.
 *   - `'none'`: unnormalized transform (scale `1` for both forward and inverse).
 */

const VALID_NORMALIZATIONS = new Set(['standard', 'unitary', 'none'])

/**
 * Validates the input series and options, returning unpacked real/imaginary
 * typed arrays and normalized option flags.
 *
 * @param {unknown} series
 * @param {unknown} options
 * @returns {{ re: Float64Array, im: Float64Array, inverse: boolean, normalization: 'standard' | 'unitary' | 'none' }}
 */
function validateInput(series, options) {
	if (!Array.isArray(series)) {
		throw new TypeError('series must be an Array of complex numbers { re, im }')
	}

	let inverse = false
	let normalization = 'standard'

	if (options !== undefined) {
		if (typeof options !== 'object' || options === null || Array.isArray(options)) {
			throw new TypeError('options must be a plain object when provided')
		}
		if (options.inverse !== undefined) {
			if (typeof options.inverse !== 'boolean') {
				throw new TypeError('options.inverse must be a boolean')
			}
			inverse = options.inverse
		}
		if (options.normalization !== undefined) {
			if (typeof options.normalization !== 'string') {
				throw new TypeError('options.normalization must be a string')
			}
			if (!VALID_NORMALIZATIONS.has(options.normalization)) {
				throw new RangeError(
					`options.normalization must be one of 'standard', 'unitary', or 'none'`,
				)
			}
			normalization = options.normalization
		}
	}

	const n = series.length
	const re = new Float64Array(n)
	const im = new Float64Array(n)

	for (let i = 0; i < n; i++) {
		const z = series[i]
		if (typeof z !== 'object' || z === null || Array.isArray(z)) {
			throw new TypeError(`series[${i}] must be a complex number object { re, im }`)
		}
		if (typeof z.re !== 'number' || typeof z.im !== 'number') {
			throw new TypeError(`series[${i}] must have numeric re and im properties`)
		}
		if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
			throw new RangeError(`series[${i}] must have finite re and im components`)
		}
		re[i] = z.re
		im[i] = z.im
	}

	return { re, im, inverse, normalization }
}

/**
 * In-place iterative radix-2 Cooley-Tukey FFT over power-of-two length arrays.
 * Computes sum_{n=0}^{N-1} x[n] * exp(sign * i * 2*pi*k*n / N) without scaling.
 *
 * Uses bit-reversal permutation followed by butterfly stages with direct
 * trigonometric twiddle factors via Euler's identity e^{i*theta} = cos(theta) + i*sin(theta)
 * to avoid iterative multiplication drift.
 *
 * @param {Float64Array} re - Real part buffer (mutated in place).
 * @param {Float64Array} im - Imaginary part buffer (mutated in place).
 * @param {1 | -1} sign - `-1` for forward transform, `+1` for inverse transform.
 */
function radix2FFTInPlace(re, im, sign) {
	const n = re.length
	if (n <= 1) return

	// Bit-reversal permutation
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1
		while ((j & bit) !== 0) {
			j ^= bit
			bit >>= 1
		}
		j ^= bit

		if (i < j) {
			const tmpRe = re[i]
			re[i] = re[j]
			re[j] = tmpRe

			const tmpIm = im[i]
			im[i] = im[j]
			im[j] = tmpIm
		}
	}

	// Butterfly stages: size = 2, 4, 8, ..., n
	for (let size = 2; size <= n; size <<= 1) {
		const half = size >> 1
		const angleStep = (sign * 2 * Math.PI) / size

		for (let start = 0; start < n; start += size) {
			for (let k = 0; k < half; k++) {
				const angle = angleStep * k
				const wr = Math.cos(angle)
				const wi = Math.sin(angle)

				const evenIdx = start + k
				const oddIdx = evenIdx + half

				const oddRe = re[oddIdx]
				const oddIm = im[oddIdx]

				// t = W * x[oddIdx]
				const tRe = wr * oddRe - wi * oddIm
				const tIm = wr * oddIm + wi * oddRe

				const evenRe = re[evenIdx]
				const evenIm = im[evenIdx]

				re[evenIdx] = evenRe + tRe
				im[evenIdx] = evenIm + tIm
				re[oddIdx] = evenRe - tRe
				im[oddIdx] = evenIm - tIm
			}
		}
	}
}

/**
 * Computes an unscaled arbitrary-length DFT via Bluestein's chirp-z identity:
 *
 *   k * n = (k^2 + n^2 - (k - n)^2) / 2
 *
 * Rewriting the DFT sum yields a chirp modulation followed by a circular
 * convolution of power-of-two length M >= 2N - 1:
 *
 *   X[k] = w[k] * sum_{n=0}^{N-1} (x[n] * w[n]) * conj(w[k - n])
 *
 * where w[m] = exp(sign * i * pi * m^2 / N).
 *
 * @param {Float64Array} inRe - Input real components (length N).
 * @param {Float64Array} inIm - Input imaginary components (length N).
 * @param {1 | -1} sign - `-1` for forward transform, `+1` for inverse transform.
 * @returns {{ re: Float64Array, im: Float64Array }} Unscaled transform output of length N.
 */
function bluesteinDFT(inRe, inIm, sign) {
	const n = inRe.length
	let m = 1
	while (m < 2 * n - 1) {
		m <<= 1
	}

	const twoN = 2 * n
	const chirpRe = new Float64Array(n)
	const chirpIm = new Float64Array(n)

	// Precompute chirp sequence w[k] = exp(sign * i * pi * (k^2 mod 2N) / N)
	for (let k = 0; k < n; k++) {
		const k2Mod = (k * k) % twoN
		const angle = (sign * Math.PI * k2Mod) / n
		chirpRe[k] = Math.cos(angle)
		chirpIm[k] = Math.sin(angle)
	}

	// Build zero-padded modulated sequence a[k] = x[k] * w[k]
	const aRe = new Float64Array(m)
	const aIm = new Float64Array(m)
	for (let k = 0; k < n; k++) {
		const xr = inRe[k]
		const xi = inIm[k]
		const wr = chirpRe[k]
		const wi = chirpIm[k]
		aRe[k] = xr * wr - xi * wi
		aIm[k] = xr * wi + xi * wr
	}

	// Build wrap-around convolution kernel b[k] = conj(w[k]) for 0 <= k < N
	// and b[M - k] = conj(w[k]) for 1 <= k < N
	const bRe = new Float64Array(m)
	const bIm = new Float64Array(m)
	bRe[0] = chirpRe[0]
	bIm[0] = -chirpIm[0]
	for (let k = 1; k < n; k++) {
		const cr = chirpRe[k]
		const ci = -chirpIm[k]
		bRe[k] = cr
		bIm[k] = ci
		bRe[m - k] = cr
		bIm[m - k] = ci
	}

	// Circular convolution via radix-2 FFT: c = IFFT_M(FFT_M(a) * FFT_M(b))
	radix2FFTInPlace(aRe, aIm, -1)
	radix2FFTInPlace(bRe, bIm, -1)

	for (let i = 0; i < m; i++) {
		const ar = aRe[i]
		const ai = aIm[i]
		const br = bRe[i]
		const bi = bIm[i]
		aRe[i] = ar * br - ai * bi
		aIm[i] = ar * bi + ai * br
	}

	radix2FFTInPlace(aRe, aIm, 1)

	// Final chirp demodulation and 1/M factor from inverse FFT_M
	const outRe = new Float64Array(n)
	const outIm = new Float64Array(n)
	const invM = 1 / m

	for (let k = 0; k < n; k++) {
		const cr = aRe[k] * invM
		const ci = aIm[k] * invM
		const wr = chirpRe[k]
		const wi = chirpIm[k]
		outRe[k] = cr * wr - ci * wi
		outIm[k] = cr * wi + ci * wr
	}

	return { re: outRe, im: outIm }
}

/**
 * Computes the Discrete Fourier Transform (DFT) or Inverse Discrete Fourier
 * Transform (IDFT) of a finite complex series `{ re, im }[]`.
 *
 * Mathematical definition:
 * - Forward DFT (`inverse: false`):
 *     `X[k] = scale * sum_{n=0}^{N-1} x[n] * exp(-i * 2*pi * k * n / N)`
 * - Inverse DFT (`inverse: true`):
 *     `x[n] = scale * sum_{k=0}^{N-1} X[k] * exp(+i * 2*pi * k * n / N)`
 *
 * Algorithm:
 * - Uses iterative radix-2 Cooley-Tukey FFT with Euler identity twiddle factors
 *   when `N` is a power of two (`O(N log N)`).
 * - Uses Bluestein's chirp-z identity (`k*n = (k^2 + n^2 - (k - n)^2) / 2`)
 *   reduced to a power-of-two circular convolution via radix-2 FFT for all
 *   arbitrary non-power-of-two lengths (`O(N log N)`), including prime lengths.
 *
 * The input array and its elements are never mutated.
 *
 * @param {Complex[]} series - Array of finite complex numbers `{ re, im }`.
 * @param {FourierTransformOptions} [options] - Optional transform configuration.
 * @returns {Complex[]} Transformed complex series of the same length.
 * @throws {TypeError} If `series` is not an array, any element is not a valid
 *   `{ re, im }` numeric object, or `options` properties have invalid types.
 * @throws {RangeError} If any `re` or `im` value is non-finite (`NaN`, `±Infinity`),
 *   or if `options.normalization` is not a recognized mode.
 */
export function fourierTransformComplexSeries(series, options) {
	const { re, im, inverse, normalization } = validateInput(series, options)
	const n = re.length

	if (n === 0) {
		return []
	}

	if (n === 1) {
		return [{ re: re[0] + 0, im: im[0] + 0 }]
	}

	const sign = inverse ? 1 : -1
	let outRe
	let outIm

	if ((n & (n - 1)) === 0) {
		radix2FFTInPlace(re, im, sign)
		outRe = re
		outIm = im
	} else {
		const res = bluesteinDFT(re, im, sign)
		outRe = res.re
		outIm = res.im
	}

	let scale = 1
	if (normalization === 'standard') {
		scale = inverse ? 1 / n : 1
	} else if (normalization === 'unitary') {
		scale = 1 / Math.sqrt(n)
	}

	const result = new Array(n)
	for (let k = 0; k < n; k++) {
		result[k] = {
			re: outRe[k] * scale + 0,
			im: outIm[k] * scale + 0,
		}
	}

	return result
}
