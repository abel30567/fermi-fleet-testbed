/**
 * Discrete linear convolution over `Float64Array` inputs via the Convolution Theorem
 * identity (`F^{-1}(F(a) * F(b))`), evaluated using an in-place radix-2 Cooley-Tukey
 * Fast Fourier Transform (FFT) with element-wise complex multiplication in the
 * frequency domain.
 *
 * For sequences `a` of length `n` and `b` of length `m`, the full discrete convolution
 * corresponds to the Cauchy product of their generating power series:
 *
 *   c[k] = sum_{i + j = k} a[i] * b[j],   0 <= k < n + m - 1
 *
 * Zero-padding both inputs to `N = 2^ceil(log2(n + m - 1))` converts circular
 * convolution into exact linear convolution in `O(N log N)` time.
 *
 * @module ops/advanced/convolutionTypedSeries
 */

const VALID_MODES = new Set(['full', 'same', 'valid'])

/**
 * Validates that a value is a non-empty `Float64Array` containing only finite numbers.
 *
 * @param {unknown} value
 * @param {string} name
 */
function assertValidFloat64Array(value, name) {
	if (!(value instanceof Float64Array)) {
		throw new TypeError(`${name} must be a Float64Array`)
	}
	if (value.length === 0) {
		throw new RangeError(`${name} must not be empty`)
	}
	for (let i = 0; i < value.length; i++) {
		if (!Number.isFinite(value[i])) {
			throw new RangeError(`${name}[${i}] must be a finite number`)
		}
	}
}

/**
 * In-place iterative radix-2 Cooley-Tukey FFT / inverse FFT on split real/imaginary
 * `Float64Array` buffers of power-of-two length.
 *
 * Uses the Euler identity `exp(±2πi k / len) = cos(±2πk / len) + i sin(±2πk / len)`
 * with per-stage trigonometric tables to avoid cumulative twiddle-factor drift.
 *
 * @param {Float64Array} re - Real part buffer (mutated in place).
 * @param {Float64Array} im - Imaginary part buffer (mutated in place).
 * @param {boolean} invert - `false` for forward DFT, `true` for inverse DFT.
 */
function fftInPlace(re, im, invert) {
	const size = re.length

	// Bit-reversal permutation
	for (let i = 1, j = 0; i < size; i++) {
		let bit = size >>> 1
		for (; (j & bit) !== 0; bit >>>= 1) {
			j ^= bit
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

	// Butterfly stages
	for (let len = 2; len <= size; len *= 2) {
		const halfLen = len / 2
		const angleStep = ((invert ? 2 : -2) * Math.PI) / len
		const cosTable = new Float64Array(halfLen)
		const sinTable = new Float64Array(halfLen)
		for (let k = 0; k < halfLen; k++) {
			const theta = angleStep * k
			cosTable[k] = Math.cos(theta)
			sinTable[k] = Math.sin(theta)
		}

		for (let start = 0; start < size; start += len) {
			for (let k = 0; k < halfLen; k++) {
				const uIdx = start + k
				const vIdx = uIdx + halfLen
				const wRe = cosTable[k]
				const wIm = sinTable[k]

				const uRe = re[uIdx]
				const uIm = im[uIdx]
				const vRe = re[vIdx] * wRe - im[vIdx] * wIm
				const vIm = re[vIdx] * wIm + im[vIdx] * wRe

				re[uIdx] = uRe + vRe
				im[uIdx] = uIm + vIm
				re[vIdx] = uRe - vRe
				im[vIdx] = uIm - vIm
			}
		}
	}

	if (invert) {
		const invSize = 1 / size
		for (let i = 0; i < size; i++) {
			re[i] *= invSize
			im[i] *= invSize
		}
	}
}

/**
 * Computes the discrete linear convolution of two `Float64Array` sequences using the
 * Fourier Convolution Theorem identity (`F^{-1}(F(a) ⊙ F(b))`).
 *
 * @param {Float64Array} a - First input signal (non-empty, all finite values).
 * @param {Float64Array} b - Second input signal / kernel (non-empty, all finite values).
 * @param {object} [options] - Optional configuration.
 * @param {'full' | 'same' | 'valid'} [options.mode='full'] - Output slice mode:
 *   - `'full'`: Full linear convolution of length `a.length + b.length - 1`.
 *   - `'same'`: Central portion of length `a.length`, starting at `Math.floor((b.length - 1) / 2)`.
 *   - `'valid'`: Fully overlapping portion of length `Math.max(a.length, b.length) - Math.min(a.length, b.length) + 1`,
 *     starting at `Math.min(a.length, b.length) - 1`.
 * @returns {Float64Array} The convolved output sequence.
 * @throws {TypeError} If `a` or `b` is not a `Float64Array`, or if `options` is not an object / `options.mode` is not a string.
 * @throws {RangeError} If `a` or `b` is empty, contains non-finite numbers, or `options.mode` is unsupported.
 */
export function convolutionTypedSeries(a, b, options = {}) {
	assertValidFloat64Array(a, 'a')
	assertValidFloat64Array(b, 'b')

	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object')
	}

	const { mode = 'full' } = options
	if (typeof mode !== 'string') {
		throw new TypeError('options.mode must be a string')
	}
	if (!VALID_MODES.has(mode)) {
		throw new RangeError(`options.mode must be one of "full", "same", or "valid" (got "${mode}")`)
	}

	const n = a.length
	const m = b.length
	const fullLen = n + m - 1

	// Next power of two >= fullLen for zero-padded linear convolution
	let fftSize = 1
	while (fftSize < fullLen) {
		fftSize *= 2
	}

	const aRe = new Float64Array(fftSize)
	const aIm = new Float64Array(fftSize)
	const bRe = new Float64Array(fftSize)
	const bIm = new Float64Array(fftSize)

	aRe.set(a)
	bRe.set(b)

	// Forward FFT of both zero-padded sequences
	fftInPlace(aRe, aIm, false)
	fftInPlace(bRe, bIm, false)

	// Element-wise complex product in the frequency domain: C = F(a) ⊙ F(b)
	const cRe = new Float64Array(fftSize)
	const cIm = new Float64Array(fftSize)
	for (let i = 0; i < fftSize; i++) {
		cRe[i] = aRe[i] * bRe[i] - aIm[i] * bIm[i]
		cIm[i] = aRe[i] * bIm[i] + aIm[i] * bRe[i]
	}

	// Inverse FFT back to the time/index domain
	fftInPlace(cRe, cIm, true)

	let start = 0
	let outLen = fullLen
	if (mode === 'same') {
		start = Math.floor((m - 1) / 2)
		outLen = n
	} else if (mode === 'valid') {
		const minLen = Math.min(n, m)
		const maxLen = Math.max(n, m)
		start = minLen - 1
		outLen = maxLen - minLen + 1
	}

	const result = new Float64Array(outLen)
	for (let i = 0; i < outLen; i++) {
		const val = cRe[start + i]
		result[i] = val === 0 ? 0 : val
	}

	return result
}
