/**
 * Discrete linear convolution over Float64Array inputs using the Convolution
 * Theorem identity:
 *
 *   (a * b) = IFFT(FFT(pad(a)) ⊙ FFT(pad(b)))
 *
 * where ⊙ denotes element-wise complex multiplication in the frequency domain
 * (equivalently, the Cauchy product of the corresponding power series evaluated
 * at roots of unity via an iterative radix-2 Cooley-Tukey FFT).
 */

const VALID_MODES = new Set(['full', 'same', 'valid'])

/**
 * Validate that a value is a Float64Array containing only finite numbers.
 *
 * @param {unknown} input - Value to validate.
 * @param {string} name - Parameter name for error messages.
 * @returns {void}
 */
function assertFiniteFloat64Array(input, name) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError(`${name} must be a Float64Array`)
	}
	for (let i = 0; i < input.length; i++) {
		if (!Number.isFinite(input[i])) {
			throw new RangeError(`${name}[${i}] must be a finite number`)
		}
	}
}

/**
 * Return the smallest power of two greater than or equal to n (minimum 1).
 *
 * @param {number} n - Positive integer.
 * @returns {number}
 */
function nextPowerOfTwo(n) {
	let p = 1
	while (p < n) {
		p *= 2
	}
	return p
}

/**
 * In-place iterative radix-2 Cooley-Tukey FFT / IFFT on split Float64Array
 * real and imaginary buffers of power-of-two length.
 *
 * @param {Float64Array} re - Real components (modified in place).
 * @param {Float64Array} im - Imaginary components (modified in place).
 * @param {boolean} inverse - When true, computes the inverse DFT (scaled by 1/N).
 * @returns {void}
 */
function radix2FFT(re, im, inverse) {
	const n = re.length

	// Bit-reversal permutation
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1
		for (; (j & bit) !== 0; bit >>= 1) {
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

	const sign = inverse ? 2 * Math.PI : -2 * Math.PI

	// Butterfly stages
	for (let len = 2; len <= n; len <<= 1) {
		const half = len >> 1
		const stepAngle = sign / len

		for (let i = 0; i < n; i += len) {
			for (let k = 0; k < half; k++) {
				const angle = stepAngle * k
				const wr = Math.cos(angle)
				const wi = Math.sin(angle)

				const uIdx = i + k
				const vIdx = uIdx + half

				const uRe = re[uIdx]
				const uIm = im[uIdx]
				const vRe = re[vIdx]
				const vIm = im[vIdx]

				const tRe = wr * vRe - wi * vIm
				const tIm = wr * vIm + wi * vRe

				re[uIdx] = uRe + tRe
				im[uIdx] = uIm + tIm
				re[vIdx] = uRe - tRe
				im[vIdx] = uIm - tIm
			}
		}
	}

	if (inverse) {
		const invN = 1 / n
		for (let i = 0; i < n; i++) {
			re[i] *= invN
			im[i] *= invN
		}
	}
}

/**
 * Compute the discrete linear convolution of two Float64Array sequences using
 * the Convolution Theorem identity (radix-2 FFT, element-wise spectral product,
 * and inverse FFT).
 *
 * Supported `options.mode` values:
 * - `'full'` (default): Full linear convolution of length `a.length + b.length - 1`.
 * - `'same'`: Central section of the full convolution with length `a.length`.
 * - `'valid'`: Section where the shorter sequence fully overlaps the longer
 *   sequence, of length `Math.max(a.length, b.length) - Math.min(a.length, b.length) + 1`.
 *
 * If either input is empty, returns an empty `Float64Array`.
 *
 * @param {Float64Array} a - First input sequence.
 * @param {Float64Array} b - Second input sequence (kernel).
 * @param {{ mode?: 'full' | 'same' | 'valid' }} [options] - Optional configuration.
 * @returns {Float64Array} Convolved output sequence.
 * @throws {TypeError} If `a` or `b` is not a Float64Array, or if `options` is invalid.
 * @throws {RangeError} If any input element is non-finite, or if `options.mode` is unknown.
 */
export function convolutionTypedSeries(a, b, options) {
	assertFiniteFloat64Array(a, 'a')
	assertFiniteFloat64Array(b, 'b')

	let mode = 'full'
	if (options !== undefined) {
		if (options === null || typeof options !== 'object' || Array.isArray(options)) {
			throw new TypeError('options must be an object')
		}
		if (options.mode !== undefined) {
			if (typeof options.mode !== 'string' || !VALID_MODES.has(options.mode)) {
				throw new RangeError("options.mode must be one of 'full', 'same', or 'valid'")
			}
			mode = options.mode
		}
	}

	const m = a.length
	const n = b.length
	if (m === 0 || n === 0) {
		return new Float64Array(0)
	}

	const fullLength = m + n - 1
	const fftSize = nextPowerOfTwo(fullLength)

	const aRe = new Float64Array(fftSize)
	const aIm = new Float64Array(fftSize)
	const bRe = new Float64Array(fftSize)
	const bIm = new Float64Array(fftSize)

	aRe.set(a)
	bRe.set(b)

	// Forward FFT of both zero-padded sequences
	radix2FFT(aRe, aIm, false)
	radix2FFT(bRe, bIm, false)

	// Element-wise complex multiplication in the frequency domain
	const cRe = new Float64Array(fftSize)
	const cIm = new Float64Array(fftSize)
	for (let i = 0; i < fftSize; i++) {
		cRe[i] = aRe[i] * bRe[i] - aIm[i] * bIm[i]
		cIm[i] = aRe[i] * bIm[i] + aIm[i] * bRe[i]
	}

	// Inverse FFT back to the time/sequence domain
	radix2FFT(cRe, cIm, true)

	let start = 0
	let outLength = fullLength
	if (mode === 'same') {
		start = Math.floor((n - 1) / 2)
		outLength = m
	} else if (mode === 'valid') {
		const minLen = Math.min(m, n)
		const maxLen = Math.max(m, n)
		start = minLen - 1
		outLength = maxLen - minLen + 1
	}

	const result = new Float64Array(outLength)
	for (let i = 0; i < outLength; i++) {
		const val = cRe[start + i]
		// Normalize signed zero (-0) to +0
		result[i] = val === 0 ? 0 : val
	}
	return result
}
