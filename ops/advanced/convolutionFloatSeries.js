/**
 * Discrete linear convolution over IEEE-754 float64 numbers using the
 * Convolution Theorem (Fourier series / generating-function identity).
 *
 * Mathematical identity:
 * Given finite real sequences a[0..n-1] and b[0..m-1], their discrete linear
 * convolution (Cauchy product of the corresponding generating polynomials
 * A(z) = sum_{i=0}^{n-1} a_i z^i and B(z) = sum_{j=0}^{m-1} b_j z^j) is:
 *
 *   (a * b)[k] = sum_{i + j = k} a[i] * b[j],   0 <= k < n + m - 1
 *
 * Evaluating A(z) and B(z) at the N-th roots of unity (where N is the smallest
 * power of two >= n + m - 1) via the Discrete Fourier Transform yields the
 * Convolution Theorem identity:
 *
 *   a * b = IDFT( DFT(a_pad) * DFT(b_pad) )
 *
 * Computed in O(N log N) time using an iterative radix-2 Cooley-Tukey FFT with
 * exact trigonometric twiddle factors and max-norm scaling to prevent
 * intermediate overflow/underflow on extreme IEEE-754 float64 magnitudes.
 *
 * @param {number[] | Float64Array} a - First input sequence of finite float64 numbers.
 * @param {number[] | Float64Array} b - Second input sequence of finite float64 numbers.
 * @param {'full' | 'same' | 'valid'} [mode='full'] - Output slice mode:
 *   - `'full'`: full discrete convolution of length `a.length + b.length - 1`.
 *   - `'same'`: central segment of length `Math.max(a.length, b.length)`.
 *   - `'valid'`: fully overlapping segment of length `Math.max(a.length, b.length) - Math.min(a.length, b.length) + 1`.
 * @returns {number[]} The convolved sequence of IEEE-754 float64 numbers.
 * @throws {TypeError} If `a` or `b` is not an Array or Float64Array, contains a non-number element, or `mode` is not a string.
 * @throws {RangeError} If any element of `a` or `b` is NaN or non-finite, or `mode` is not `'full'`, `'same'`, or `'valid'`.
 */
export function convolutionFloatSeries(a, b, mode = 'full') {
	validateSequence(a, 'a')
	validateSequence(b, 'b')
	validateMode(mode)

	const n = a.length
	const m = b.length
	if (n === 0 || m === 0) {
		return []
	}

	const fullLen = n + m - 1
	const { start, outLen } = sliceBounds(n, m, fullLen, mode)

	const scaleA = maxAbs(a)
	const scaleB = maxAbs(b)
	if (scaleA === 0 || scaleB === 0) {
		return new Array(outLen).fill(0)
	}

	const fftSize = nextPowerOfTwo(fullLen)
	const aRe = new Float64Array(fftSize)
	const aIm = new Float64Array(fftSize)
	const bRe = new Float64Array(fftSize)
	const bIm = new Float64Array(fftSize)

	for (let i = 0; i < n; i++) {
		aRe[i] = a[i] / scaleA
	}
	for (let j = 0; j < m; j++) {
		bRe[j] = b[j] / scaleB
	}

	fftRadix2(aRe, aIm, false)
	fftRadix2(bRe, bIm, false)

	// Pointwise spectral multiplication: C[k] = A[k] * B[k]
	for (let k = 0; k < fftSize; k++) {
		const re = aRe[k] * bRe[k] - aIm[k] * bIm[k]
		const im = aRe[k] * bIm[k] + aIm[k] * bRe[k]
		aRe[k] = re
		aIm[k] = im
	}

	// Inverse DFT to recover the convolved sequence
	fftRadix2(aRe, aIm, true)

	const result = new Array(outLen)
	for (let k = 0; k < outLen; k++) {
		const normalized = aRe[start + k]
		const scaled = (normalized * scaleA) * scaleB
		result[k] = scaled === 0 ? 0 : scaled
	}

	return result
}

/**
 * Validates that an input is an Array or Float64Array of finite numbers.
 * @param {unknown} seq
 * @param {string} name
 */
function validateSequence(seq, name) {
	if (!Array.isArray(seq) && !(seq instanceof Float64Array)) {
		throw new TypeError(`Expected "${name}" to be an Array or Float64Array`)
	}
	for (let i = 0; i < seq.length; i++) {
		const v = seq[i]
		if (typeof v !== 'number') {
			throw new TypeError(`Element "${name}[${i}]" must be a number`)
		}
		if (!Number.isFinite(v)) {
			throw new RangeError(`Element "${name}[${i}]" must be a finite number`)
		}
	}
}

/**
 * Validates the convolution output mode.
 * @param {unknown} mode
 */
function validateMode(mode) {
	if (typeof mode !== 'string') {
		throw new TypeError('Expected "mode" to be a string')
	}
	if (mode !== 'full' && mode !== 'same' && mode !== 'valid') {
		throw new RangeError(`Unsupported mode "${mode}"; expected "full", "same", or "valid"`)
	}
}

/**
 * Computes output slice offset and length for the requested convolution mode.
 * @param {number} n
 * @param {number} m
 * @param {number} fullLen
 * @param {'full' | 'same' | 'valid'} mode
 * @returns {{ start: number, outLen: number }}
 */
function sliceBounds(n, m, fullLen, mode) {
	if (mode === 'full') {
		return { start: 0, outLen: fullLen }
	}
	const minLen = Math.min(n, m)
	const maxLen = Math.max(n, m)
	if (mode === 'same') {
		return { start: Math.floor((minLen - 1) / 2), outLen: maxLen }
	}
	// mode === 'valid'
	return { start: minLen - 1, outLen: maxLen - minLen + 1 }
}

/**
 * Returns the maximum absolute value in a sequence.
 * @param {number[] | Float64Array} seq
 * @returns {number}
 */
function maxAbs(seq) {
	let max = 0
	for (let i = 0; i < seq.length; i++) {
		const abs = Math.abs(seq[i])
		if (abs > max) {
			max = abs
		}
	}
	return max
}

/**
 * Returns the smallest power of two >= size (minimum 1).
 * @param {number} size
 * @returns {number}
 */
function nextPowerOfTwo(size) {
	let p = 1
	while (p < size) {
		p *= 2
	}
	return p
}

/**
 * In-place iterative radix-2 Cooley-Tukey FFT / IFFT over float64 arrays.
 * Uses direct trigonometric evaluation of roots of unity e^(+-2*pi*i*j/len)
 * to preserve IEEE-754 float64 accuracy across all stages.
 *
 * @param {Float64Array} re - Real parts (length must be a power of 2).
 * @param {Float64Array} im - Imaginary parts (same length as `re`).
 * @param {boolean} inverse - True for inverse DFT (with 1/N normalization).
 */
function fftRadix2(re, im, inverse) {
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

	// Cooley-Tukey decimation-in-time butterfly stages
	const direction = inverse ? 2 * Math.PI : -2 * Math.PI
	for (let len = 2; len <= n; len <<= 1) {
		const halfLen = len >> 1
		const baseAngle = direction / len
		for (let i = 0; i < n; i += len) {
			for (let j = 0; j < halfLen; j++) {
				const angle = baseAngle * j
				const wRe = Math.cos(angle)
				const wIm = Math.sin(angle)

				const uIdx = i + j
				const vIdx = uIdx + halfLen
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

	if (inverse) {
		for (let i = 0; i < n; i++) {
			re[i] /= n
			im[i] /= n
		}
	}
}
