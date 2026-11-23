/**
 * Computes the full 1D discrete linear convolution of two finite sequences of
 * IEEE-754 float64 numbers using a straightforward iterative double loop.
 *
 * For non-empty arrays `signal` (length `m`) and `kernel` (length `n`), the
 * result has length `m + n - 1` with elements:
 *   `out[k] = sum_{i + j = k} signal[i] * kernel[j]`
 *
 * If either input array is empty, an empty array `[]` is returned.
 * Neither input array is mutated.
 *
 * @param {readonly number[]} signal - First input sequence of finite float64 numbers.
 * @param {readonly number[]} kernel - Second input sequence of finite float64 numbers.
 * @returns {number[]} The full discrete linear convolution of `signal` and `kernel`.
 * @throws {TypeError} If either argument is not an Array or contains a non-number element.
 * @throws {RangeError} If any element is non-finite (`NaN`, `Infinity`, or `-Infinity`).
 */
export function convolutionFloatIterative(signal, kernel) {
	validateSequence(signal, 'signal')
	validateSequence(kernel, 'kernel')

	const m = signal.length
	const n = kernel.length

	if (m === 0 || n === 0) {
		return []
	}

	const output = new Array(m + n - 1).fill(0)

	for (let i = 0; i < m; i++) {
		const si = signal[i]
		for (let j = 0; j < n; j++) {
			output[i + j] += si * kernel[j]
		}
	}

	return output
}

/**
 * Validates that a value is an Array of finite IEEE-754 float64 numbers.
 *
 * @param {unknown} seq - Value to validate.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `seq` is not an Array or has a non-number entry.
 * @throws {RangeError} If `seq` has a non-finite number (`NaN`, `Infinity`, `-Infinity`).
 */
function validateSequence(seq, name) {
	if (!Array.isArray(seq)) {
		throw new TypeError(`Expected "${name}" to be an Array of finite numbers`)
	}

	for (let i = 0; i < seq.length; i++) {
		const value = seq[i]
		if (typeof value !== 'number') {
			throw new TypeError(
				`Expected "${name}[${i}]" to be a number, got ${typeof value}`,
			)
		}
		if (!Number.isFinite(value)) {
			throw new RangeError(
				`Expected "${name}[${i}]" to be a finite number, got ${value}`,
			)
		}
	}
}
