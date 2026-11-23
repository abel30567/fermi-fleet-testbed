/**
 * Computes the Discrete Fourier Transform (DFT) or Inverse Discrete Fourier
 * Transform (IDFT) of a sequence of complex numbers `{ re, im }` using a
 * recursive divide-and-conquer implementation.
 *
 * Strategy:
 * - Power-of-2 and even lengths use recursive radix-2 Cooley-Tukey splitting.
 * - Odd composite lengths use recursive mixed-radix Cooley-Tukey splitting on
 *   the smallest prime factor.
 * - Odd prime lengths use Bluestein's chirp-z reduction to power-of-2 circular
 *   convolution evaluated via the recursive radix-2 FFT, ensuring O(N log N)
 *   time complexity for all input lengths.
 *
 * Forward DFT (default, `inverse: false`):
 *   X[k] = sum_{n=0}^{N-1} x[n] * exp(-i * 2 * pi * k * n / N)
 *
 * Inverse DFT (`inverse: true`):
 *   x[n] = (1 / N) * sum_{k=0}^{N-1} X[k] * exp(+i * 2 * pi * k * n / N)
 *
 * @typedef {{ re: number, im: number }} Complex
 *
 * @param {Complex[]} input - Array of complex numbers `{ re, im }` with finite numeric parts.
 * @param {{ inverse?: boolean }} [options={}] - Optional transform settings.
 * @param {boolean} [options.inverse=false] - When `true`, computes the inverse DFT scaled by `1 / N`.
 * @returns {Complex[]} A new array of transformed complex numbers `{ re, im }`.
 * @throws {TypeError} If `input` is not an array, any element is not a valid `{ re, im }` object, or `options` is invalid.
 * @throws {RangeError} If any `re` or `im` component is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
export function fourierTransformComplexRecursive(input, options = {}) {
	validateInput(input, options)

	const n = input.length
	if (n === 0) {
		return []
	}

	const inverse = options.inverse ?? false
	const sign = inverse ? 1 : -1

	const copied = input.map(({ re, im }) => ({ re, im }))
	const transformed = fftRecursive(copied, sign)

	if (inverse) {
		return transformed.map(({ re, im }) => ({
			re: normalizeZero(re / n),
			im: normalizeZero(im / n),
		}))
	}

	return transformed.map(({ re, im }) => ({
		re: normalizeZero(re),
		im: normalizeZero(im),
	}))
}

/**
 * Validates `input` and `options` before running the transform.
 *
 * @param {unknown} input
 * @param {unknown} options
 */
function validateInput(input, options) {
	if (!Array.isArray(input)) {
		throw new TypeError('Expected input to be an array of { re, im } complex objects')
	}

	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('Expected options to be a plain object')
	}

	if (options.inverse !== undefined && typeof options.inverse !== 'boolean') {
		throw new TypeError('Expected options.inverse to be a boolean')
	}

	for (let i = 0; i < input.length; i++) {
		const el = input[i]
		if (typeof el !== 'object' || el === null || Array.isArray(el)) {
			throw new TypeError(`Expected input[${i}] to be a { re, im } object`)
		}
		if (typeof el.re !== 'number' || typeof el.im !== 'number') {
			throw new TypeError(`Expected input[${i}].re and input[${i}].im to be numbers`)
		}
		if (!Number.isFinite(el.re) || !Number.isFinite(el.im)) {
			throw new RangeError(`Expected input[${i}].re and input[${i}].im to be finite numbers`)
		}
	}
}

/**
 * Avoids returning IEEE-754 negative zero (`-0`).
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Multiplies two complex numbers.
 *
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

/**
 * Finds the smallest prime factor of an integer `n >= 2`.
 *
 * @param {number} n
 * @returns {number}
 */
function smallestPrimeFactor(n) {
	if (n % 2 === 0) {
		return 2
	}
	const limit = Math.floor(Math.sqrt(n))
	for (let d = 3; d <= limit; d += 2) {
		if (n % d === 0) {
			return d
		}
	}
	return n
}

/**
 * Recursive divide-and-conquer FFT supporting arbitrary lengths.
 *
 * @param {Complex[]} seq
 * @param {1 | -1} sign
 * @returns {Complex[]}
 */
function fftRecursive(seq, sign) {
	const n = seq.length
	if (n <= 1) {
		return n === 1 ? [{ re: seq[0].re, im: seq[0].im }] : []
	}

	// Radix-2 divide-and-conquer step for even lengths (including all powers of 2).
	if (n % 2 === 0) {
		const half = n / 2
		const even = new Array(half)
		const odd = new Array(half)
		for (let i = 0; i < half; i++) {
			even[i] = seq[2 * i]
			odd[i] = seq[2 * i + 1]
		}

		const evenTransformed = fftRecursive(even, sign)
		const oddTransformed = fftRecursive(odd, sign)

		const out = new Array(n)
		const angleStep = (sign * 2 * Math.PI) / n
		for (let k = 0; k < half; k++) {
			const angle = angleStep * k
			const twiddle = { re: Math.cos(angle), im: Math.sin(angle) }
			const t = complexMul(twiddle, oddTransformed[k])
			const e = evenTransformed[k]

			out[k] = { re: e.re + t.re, im: e.im + t.im }
			out[k + half] = { re: e.re - t.re, im: e.im - t.im }
		}
		return out
	}

	// General mixed-radix recursive divide-and-conquer for odd composite lengths.
	const p = smallestPrimeFactor(n)
	if (p < n) {
		const q = n / p
		const subTransforms = new Array(p)
		for (let r = 0; r < p; r++) {
			const sub = new Array(q)
			for (let m = 0; m < q; m++) {
				sub[m] = seq[m * p + r]
			}
			subTransforms[r] = fftRecursive(sub, sign)
		}

		const out = new Array(n)
		const baseAngle = (sign * 2 * Math.PI) / n
		for (let t = 0; t < p; t++) {
			for (let j = 0; j < q; j++) {
				const k = t * q + j
				let sumRe = 0
				let sumIm = 0
				for (let r = 0; r < p; r++) {
					const angle = baseAngle * ((k * r) % n)
					const wr = Math.cos(angle)
					const wi = Math.sin(angle)
					const y = subTransforms[r][j]
					sumRe += y.re * wr - y.im * wi
					sumIm += y.re * wi + y.im * wr
				}
				out[k] = { re: sumRe, im: sumIm }
			}
		}
		return out
	}

	// Prime length >= 3: Bluestein's algorithm delegating to recursive radix-2 FFT.
	return fftBluestein(seq, sign)
}

/**
 * Bluestein's chirp-z transform for arbitrary prime lengths `n >= 3`,
 * computed via circular convolution using the recursive radix-2 FFT.
 *
 * @param {Complex[]} seq
 * @param {1 | -1} sign
 * @returns {Complex[]}
 */
function fftBluestein(seq, sign) {
	const n = seq.length
	let m = 1
	while (m < 2 * n - 1) {
		m <<= 1
	}

	const twoN = 2 * n
	const chirps = new Array(n)
	for (let i = 0; i < n; i++) {
		const phaseIndex = (i * i) % twoN
		const angle = (sign * Math.PI * phaseIndex) / n
		chirps[i] = { re: Math.cos(angle), im: Math.sin(angle) }
	}

	const a = new Array(m)
	const b = new Array(m)
	for (let i = 0; i < m; i++) {
		a[i] = { re: 0, im: 0 }
		b[i] = { re: 0, im: 0 }
	}

	for (let i = 0; i < n; i++) {
		a[i] = complexMul(seq[i], chirps[i])
	}

	b[0] = { re: chirps[0].re, im: -chirps[0].im }
	for (let i = 1; i < n; i++) {
		const conj = { re: chirps[i].re, im: -chirps[i].im }
		b[i] = conj
		b[m - i] = conj
	}

	const freqA = fftRecursive(a, -1)
	const freqB = fftRecursive(b, -1)
	const freqProd = new Array(m)
	for (let i = 0; i < m; i++) {
		freqProd[i] = complexMul(freqA[i], freqB[i])
	}

	const conv = fftRecursive(freqProd, 1)
	const out = new Array(n)
	for (let k = 0; k < n; k++) {
		const scaled = { re: conv[k].re / m, im: conv[k].im / m }
		out[k] = complexMul(scaled, chirps[k])
	}
	return out
}
