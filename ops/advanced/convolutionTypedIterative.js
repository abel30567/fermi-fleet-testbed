/**
 * Computes the 1D discrete linear convolution of two {@link Float64Array}
 * signals using a straightforward iterative implementation.
 *
 * For inputs `a` of length `M` and `b` of length `N`, the full discrete
 * convolution `c` has length `M + N - 1` and is defined element-wise as:
 *
 *   c[k] = sum_{i = max(0, k - (N - 1))}^{min(M - 1, k)} a[i] * b[k - i]
 *
 * Supported output modes:
 * - `'full'` (default): returns the full convolution of length `M + N - 1`.
 * - `'same'`: returns the central portion of length `M` (offset `floor((N - 1) / 2)`).
 * - `'valid'`: returns only elements computed without zero-padding, of length
 *   `max(0, M - N + 1)`.
 *
 * If either `a` or `b` is empty (after validating inputs), an empty
 * `Float64Array` of length 0 is returned. Neither input array is mutated.
 *
 * @param {Float64Array} a - First input signal (finite floating-point values).
 * @param {Float64Array} b - Second input signal / kernel (finite floating-point values).
 * @param {'full' | 'same' | 'valid'} [mode='full'] - Convolution output size mode.
 * @returns {Float64Array} The 1D discrete convolution result.
 * @throws {TypeError} If `a` or `b` is not a `Float64Array`, or if `mode` is not a string.
 * @throws {RangeError} If `mode` is unsupported, or if `a` or `b` contains any non-finite value (`NaN`, `Infinity`, `-Infinity`).
 */
export function convolutionTypedIterative(a, b, mode = 'full') {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('Expected first argument "a" to be a Float64Array')
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Expected second argument "b" to be a Float64Array')
	}
	if (typeof mode !== 'string') {
		throw new TypeError('Expected "mode" to be a string')
	}
	if (mode !== 'full' && mode !== 'same' && mode !== 'valid') {
		throw new RangeError(
			`Invalid mode "${mode}". Expected one of "full", "same", or "valid"`,
		)
	}

	const m = a.length
	const n = b.length

	for (let i = 0; i < m; i++) {
		if (!Number.isFinite(a[i])) {
			throw new RangeError(
				`Input "a" contains non-finite value ${a[i]} at index ${i}`,
			)
		}
	}
	for (let j = 0; j < n; j++) {
		if (!Number.isFinite(b[j])) {
			throw new RangeError(
				`Input "b" contains non-finite value ${b[j]} at index ${j}`,
			)
		}
	}

	if (m === 0 || n === 0) {
		return new Float64Array(0)
	}

	let offset = 0
	let outLen = m + n - 1

	if (mode === 'same') {
		offset = Math.floor((n - 1) / 2)
		outLen = m
	} else if (mode === 'valid') {
		if (m < n) {
			return new Float64Array(0)
		}
		offset = n - 1
		outLen = m - n + 1
	}

	const result = new Float64Array(outLen)

	for (let k = 0; k < outLen; k++) {
		const fullIdx = k + offset
		const iStart = fullIdx >= n - 1 ? fullIdx - (n - 1) : 0
		const iEnd = fullIdx < m ? fullIdx : m - 1

		let sum = 0
		for (let i = iStart; i <= iEnd; i++) {
			sum += a[i] * b[fullIdx - i]
		}
		result[k] = sum === 0 ? 0 : sum
	}

	return result
}
