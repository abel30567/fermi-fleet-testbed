const VALID_MODES = new Set(['full', 'same', 'valid', 'circular'])

/**
 * Validates that a value is an array of finite complex numbers represented as `{ re, im }`.
 *
 * @param {unknown} seq - Value to validate.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `seq` is not an array, or any element is not a `{ re, im }` object with numeric fields.
 * @throws {RangeError} If any complex component (`re` or `im`) is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
function validateComplexSequence(seq, name) {
	if (!Array.isArray(seq)) {
		throw new TypeError(`${name} must be an array of complex numbers { re, im }`)
	}
	for (let i = 0; i < seq.length; i++) {
		const item = seq[i]
		if (typeof item !== 'object' || item === null || Array.isArray(item)) {
			throw new TypeError(`${name}[${i}] must be a non-null object with numeric re and im properties`)
		}
		if (typeof item.re !== 'number' || typeof item.im !== 'number') {
			throw new TypeError(`${name}[${i}].re and ${name}[${i}].im must be numbers`)
		}
		if (!Number.isFinite(item.re) || !Number.isFinite(item.im)) {
			throw new RangeError(`${name}[${i}].re and ${name}[${i}].im must be finite numbers`)
		}
	}
}

/**
 * Computes the discrete convolution of two sequences of complex numbers `{ re, im }`
 * using a straightforward iterative nested-loop implementation.
 *
 * For two sequences `a` (length M) and `b` (length N), the linear convolution is:
 * `(a * b)[n] = sum_{k} a[k] * b[n - k]`.
 *
 * Supported modes:
 * - `'full'` (default): full linear convolution of length `M + N - 1`.
 * - `'same'`: central slice of the full convolution with length `Math.max(M, N)`.
 * - `'valid'`: only fully overlapping positions without zero-padding, length `Math.max(M, N) - Math.min(M, N) + 1`.
 * - `'circular'`: periodic convolution of equal-length sequences (`M === N`), length `N`.
 *
 * @param {Array<{ re: number, im: number }>} a - First complex sequence.
 * @param {Array<{ re: number, im: number }>} b - Second complex sequence.
 * @param {'full' | 'same' | 'valid' | 'circular'} [mode='full'] - Convolution mode.
 * @returns {Array<{ re: number, im: number }>} Resulting complex sequence (empty if either input is empty).
 * @throws {TypeError} If `a` or `b` is not an array of `{ re, im }` objects with numeric fields, or if `mode` is not a string.
 * @throws {RangeError} If any component is non-finite, `mode` is unsupported, or `mode === 'circular'` with `a.length !== b.length`.
 */
export function convolutionComplexIterative(a, b, mode = 'full') {
	validateComplexSequence(a, 'a')
	validateComplexSequence(b, 'b')

	if (typeof mode !== 'string') {
		throw new TypeError('mode must be a string')
	}
	if (!VALID_MODES.has(mode)) {
		throw new RangeError(`mode must be one of 'full', 'same', 'valid', or 'circular'; got '${mode}'`)
	}

	const m = a.length
	const n = b.length

	if (mode === 'circular') {
		if (m !== n) {
			throw new RangeError(`circular convolution requires equal-length sequences (got ${m} and ${n})`)
		}
		if (m === 0) {
			return []
		}
		const result = new Array(m)
		for (let i = 0; i < m; i++) {
			let sumRe = 0
			let sumIm = 0
			for (let k = 0; k < m; k++) {
				const j = (i - k + m) % m
				const ak = a[k]
				const bj = b[j]
				sumRe += ak.re * bj.re - ak.im * bj.im
				sumIm += ak.re * bj.im + ak.im * bj.re
			}
			result[i] = {
				re: sumRe === 0 ? 0 : sumRe,
				im: sumIm === 0 ? 0 : sumIm,
			}
		}
		return result
	}

	if (m === 0 || n === 0) {
		return []
	}

	let outLen
	let offset
	if (mode === 'full') {
		outLen = m + n - 1
		offset = 0
	} else if (mode === 'same') {
		outLen = Math.max(m, n)
		offset = Math.floor((Math.min(m, n) - 1) / 2)
	} else {
		// mode === 'valid'
		const minLen = Math.min(m, n)
		const maxLen = Math.max(m, n)
		outLen = maxLen - minLen + 1
		offset = minLen - 1
	}

	const result = new Array(outLen)
	for (let idx = 0; idx < outLen; idx++) {
		const i = idx + offset
		let sumRe = 0
		let sumIm = 0
		const kStart = i >= n ? i - n + 1 : 0
		const kEnd = i < m ? i : m - 1
		for (let k = kStart; k <= kEnd; k++) {
			const ak = a[k]
			const bj = b[i - k]
			sumRe += ak.re * bj.re - ak.im * bj.im
			sumIm += ak.re * bj.im + ak.im * bj.re
		}
		result[idx] = {
			re: sumRe === 0 ? 0 : sumRe,
			im: sumIm === 0 ? 0 : sumIm,
		}
	}

	return result
}
