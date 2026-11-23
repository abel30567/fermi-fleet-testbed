/**
 * Computes the discrete linear convolution of two exact BigInt sequences
 * using a straightforward iterative O(M * N) algorithm.
 *
 * For sequences `a` (length M) and `b` (length N), the full convolution `c`
 * has length `M + N - 1` (or `0` if either input is empty) and satisfies:
 *   c[k] = sum_{i + j = k} a[i] * b[j]
 *
 * All arithmetic is performed in exact arbitrary-precision `BigInt`.
 *
 * @param {readonly bigint[]} a - First sequence of BigInt values.
 * @param {readonly bigint[]} b - Second sequence of BigInt values.
 * @param {'full' | 'same' | 'valid'} [mode='full'] - Convolution output mode:
 *   - `'full'`: Full linear convolution of length `a.length + b.length - 1`.
 *   - `'same'`: Centered slice of length `Math.max(a.length, b.length)`.
 *   - `'valid'`: Fully overlapping slice of length `Math.max(a.length, b.length) - Math.min(a.length, b.length) + 1`.
 * @returns {bigint[]} The resulting BigInt convolution sequence.
 * @throws {TypeError} If `a` or `b` is not an Array of `bigint` values, or if `mode` is not a string.
 * @throws {RangeError} If `mode` is not one of `'full'`, `'same'`, or `'valid'`.
 */
export function convolutionBigIntIterative(a, b, mode = 'full') {
	validateBigIntArray(a, 'a')
	validateBigIntArray(b, 'b')

	if (typeof mode !== 'string') {
		throw new TypeError(`Expected "mode" to be a string, received ${typeof mode}`)
	}
	if (mode !== 'full' && mode !== 'same' && mode !== 'valid') {
		throw new RangeError(`Invalid mode "${mode}". Expected "full", "same", or "valid"`)
	}

	const m = a.length
	const n = b.length

	if (m === 0 || n === 0) {
		return []
	}

	const fullLength = m + n - 1
	const full = new Array(fullLength).fill(0n)

	for (let i = 0; i < m; i++) {
		const ai = a[i]
		if (ai === 0n) {
			continue
		}
		for (let j = 0; j < n; j++) {
			full[i + j] += ai * b[j]
		}
	}

	if (mode === 'full') {
		return full
	}

	const minLen = m < n ? m : n
	const maxLen = m > n ? m : n

	if (mode === 'same') {
		const start = Math.floor((minLen - 1) / 2)
		return full.slice(start, start + maxLen)
	}

	// mode === 'valid'
	const start = minLen - 1
	const validLength = maxLen - minLen + 1
	return full.slice(start, start + validLength)
}

/**
 * Validates that a value is a dense Array containing only `bigint` elements.
 *
 * @param {unknown} arr - Value to validate.
 * @param {string} name - Parameter name for error reporting.
 * @throws {TypeError} If `arr` is not an Array or contains any non-bigint element (including holes).
 */
function validateBigIntArray(arr, name) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`Expected "${name}" to be an Array of BigInt values`)
	}
	for (let i = 0; i < arr.length; i++) {
		if (!(i in arr) || typeof arr[i] !== 'bigint') {
			throw new TypeError(
				`Expected "${name}[${i}]" to be a bigint, received ${i in arr ? typeof arr[i] : 'empty slot'}`
			)
		}
	}
}
