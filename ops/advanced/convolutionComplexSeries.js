/**
 * Complex number represented in Cartesian form.
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Validates that an input is an array of finite complex numbers `{ re, im }`.
 *
 * @param {unknown} seq - Value to validate.
 * @param {string} name - Parameter name for descriptive error messages.
 * @throws {TypeError} If `seq` is not an array, or any element is not an object
 *   with numeric `re` and `im` properties.
 * @throws {RangeError} If any element has a non-finite (`NaN`, `Infinity`, `-Infinity`)
 *   `re` or `im` component.
 */
function validateComplexSequence(seq, name) {
	if (!Array.isArray(seq)) {
		throw new TypeError(`${name} must be an array of { re, im } complex objects`)
	}
	for (let i = 0; i < seq.length; i++) {
		const el = seq[i]
		if (el === null || typeof el !== 'object' || Array.isArray(el)) {
			throw new TypeError(`${name}[${i}] must be a { re, im } complex object`)
		}
		if (typeof el.re !== 'number' || typeof el.im !== 'number') {
			throw new TypeError(`${name}[${i}].re and ${name}[${i}].im must be numbers`)
		}
		if (!Number.isFinite(el.re) || !Number.isFinite(el.im)) {
			throw new RangeError(`${name}[${i}].re and ${name}[${i}].im must be finite numbers`)
		}
	}
}

/**
 * Returns the smallest power of two greater than or equal to `n`.
 *
 * @param {number} n - Positive integer.
 * @returns {number} Smallest power of two `>= n`.
 */
function nextPowerOfTwo(n) {
	let p = 1
	while (p < n) {
		p *= 2
	}
	return p
}

/**
 * Precomputes forward radix-2 FFT twiddle factors `exp(-2 * pi * i * k / n)`
 * for `k = 0, ..., n/2 - 1`.
 *
 * @param {number} n - Power-of-two transform length.
 * @returns {{ twRe: Float64Array, twIm: Float64Array }} Real and imaginary twiddle tables.
 */
function buildTwiddleTable(n) {
	const half = n / 2
	const twRe = new Float64Array(half)
	const twIm = new Float64Array(half)
	const factor = (-2 * Math.PI) / n
	for (let k = 0; k < half; k++) {
		const angle = factor * k
		twRe[k] = Math.cos(angle)
		twIm[k] = Math.sin(angle)
	}
	return { twRe, twIm }
}

/**
 * In-place iterative radix-2 decimation-in-time Cooley-Tukey FFT / IFFT.
 *
 * Forward transform (`invert = false`):
 *   X[k] = sum_{n=0}^{N-1} x[n] * exp(-2 * pi * i * k * n / N)
 *
 * Inverse transform (`invert = true`):
 *   x[n] = (1 / N) * sum_{k=0}^{N-1} X[k] * exp(+2 * pi * i * k * n / N)
 *
 * @param {Float64Array} re - Real parts (length must be a power of two).
 * @param {Float64Array} im - Imaginary parts (same length as `re`).
 * @param {Float64Array} twRe - Precomputed cosine twiddle table of length `N / 2`.
 * @param {Float64Array} twIm - Precomputed sine twiddle table (`-sin`) of length `N / 2`.
 * @param {boolean} invert - If `true`, computes the inverse DFT.
 */
function fftInPlace(re, im, twRe, twIm, invert) {
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

	// Cooley-Tukey butterfly stages
	const imSign = invert ? -1 : 1
	for (let len = 2; len <= n; len *= 2) {
		const half = len / 2
		const step = n / len
		for (let i = 0; i < n; i += len) {
			for (let j = 0; j < half; j++) {
				const twIdx = j * step
				const wRe = twRe[twIdx]
				const wIm = twIm[twIdx] * imSign

				const uIdx = i + j
				const vIdx = uIdx + half

				const uRe = re[uIdx]
				const uIm = im[uIdx]
				const vRe = re[vIdx]
				const vIm = im[vIdx]

				const tRe = vRe * wRe - vIm * wIm
				const tIm = vRe * wIm + vIm * wRe

				re[uIdx] = uRe + tRe
				im[uIdx] = uIm + tIm
				re[vIdx] = uRe - tRe
				im[vIdx] = uIm - tIm
			}
		}
	}

	if (invert) {
		const invN = 1 / n
		for (let i = 0; i < n; i++) {
			re[i] *= invN
			im[i] *= invN
		}
	}
}

/**
 * Normalizes `-0` to `+0` while preserving all other numbers.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Computes the discrete linear convolution (Cauchy product of formal power series)
 * of two finite sequences of complex numbers `{ re, im }`.
 *
 * Given complex sequences `a` of length `N` and `b` of length `M`, representing
 * power series `A(z) = sum_{j=0}^{N-1} a[j] z^j` and `B(z) = sum_{k=0}^{M-1} b[k] z^k`,
 * their linear convolution `c = a * b` has length `L = N + M - 1` (or `0` if either
 * sequence is empty), with terms:
 *
 *   `c[n] = sum_{k = max(0, n - M + 1)}^{min(n, N - 1)} a[k] * b[n - k]`
 *
 * Algorithm (Discrete Convolution Theorem):
 *   1. Zero-pad `a` and `b` to `P = 2^ceil(log2(N + M - 1))`.
 *   2. Compute `A = FFT(a)` and `B = FFT(b)` via iterative radix-2 Cooley-Tukey FFT
 *      with exact precomputed trigonometric twiddle factors.
 *   3. Multiply pointwise in the frequency domain: `C[k] = A[k] * B[k]`.
 *   4. Transform back via `c = IFFT(C)` and truncate to length `L = N + M - 1`.
 *
 * Time complexity: `O(P log P)` where `P = 2^ceil(log2(N + M - 1))`.
 * Space complexity: `O(P)`.
 *
 * @param {Complex[]} a - First sequence of complex numbers `{ re, im }`.
 * @param {Complex[]} b - Second sequence of complex numbers `{ re, im }`.
 * @returns {Complex[]} Newly allocated array of `{ re, im }` representing `a * b`.
 * @throws {TypeError} If `a` or `b` is not an array, or any element is not an object
 *   with numeric `re` and `im` properties.
 * @throws {RangeError} If any element contains non-finite (`NaN`, `Infinity`, `-Infinity`)
 *   components, or if the required FFT size exceeds supported bounds.
 */
export function convolutionComplexSeries(a, b) {
	validateComplexSequence(a, 'a')
	validateComplexSequence(b, 'b')

	const n = a.length
	const m = b.length
	if (n === 0 || m === 0) {
		return []
	}

	const outLen = n + m - 1
	const fftSize = nextPowerOfTwo(outLen)
	if (fftSize > 0x40000000) {
		throw new RangeError(`Required FFT size (${fftSize}) exceeds maximum supported size`)
	}

	const aRe = new Float64Array(fftSize)
	const aIm = new Float64Array(fftSize)
	const bRe = new Float64Array(fftSize)
	const bIm = new Float64Array(fftSize)

	for (let i = 0; i < n; i++) {
		aRe[i] = a[i].re
		aIm[i] = a[i].im
	}
	for (let i = 0; i < m; i++) {
		bRe[i] = b[i].re
		bIm[i] = b[i].im
	}

	const { twRe, twIm } = buildTwiddleTable(fftSize)

	fftInPlace(aRe, aIm, twRe, twIm, false)
	fftInPlace(bRe, bIm, twRe, twIm, false)

	// Pointwise complex multiplication: C[k] = A[k] * B[k]
	for (let k = 0; k < fftSize; k++) {
		const ar = aRe[k]
		const ai = aIm[k]
		const br = bRe[k]
		const bi = bIm[k]
		aRe[k] = ar * br - ai * bi
		aIm[k] = ar * bi + ai * br
	}

	fftInPlace(aRe, aIm, twRe, twIm, true)

	const result = new Array(outLen)
	for (let i = 0; i < outLen; i++) {
		result[i] = {
			re: normalizeZero(aRe[i]),
			im: normalizeZero(aIm[i]),
		}
	}

	return result
}
