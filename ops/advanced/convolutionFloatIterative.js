const VALID_MODES = new Set(['full', 'same', 'valid'])

/**
 * Validates that an input is a standard Array containing only finite float64 numbers.
 *
 * @param {unknown} input - Value to validate.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If input is not an Array or contains non-number elements.
 * @throws {RangeError} If input contains NaN, Infinity, or -Infinity.
 */
function validateFloatArray(input, name) {
	if (!Array.isArray(input)) {
		throw new TypeError(`${name} must be an Array of finite numbers`)
	}
	for (let i = 0; i < input.length; i++) {
		const value = input[i]
		if (typeof value !== 'number') {
			throw new TypeError(`${name}[${i}] must be a finite number`)
		}
		if (!Number.isFinite(value)) {
			throw new RangeError(`${name}[${i}] must be a finite number`)
		}
	}
}

/**
 * Validates the optional convolution output mode.
 *
 * @param {unknown} mode - Mode value to validate.
 * @throws {TypeError} If mode is not a string.
 * @throws {RangeError} If mode is not one of 'full', 'same', or 'valid'.
 */
function validateMode(mode) {
	if (typeof mode !== 'string') {
		throw new TypeError("mode must be a string ('full', 'same', or 'valid')")
	}
	if (!VALID_MODES.has(mode)) {
		throw new RangeError(`mode must be 'full', 'same', or 'valid'; received '${mode}'`)
	}
}

/**
 * Computes the discrete linear 1D convolution of two IEEE-754 float64 arrays
 * using a straightforward iterative implementation:
 *
 *   (a * b)[n] = sum_k a[k] * b[n - k]
 *
 * Does not mutate either input array. Returns `[]` if either input is empty.
 *
 * Modes (matching standard discrete convolution conventions):
 * - `'full'` (default): full convolution of length `a.length + b.length - 1`.
 * - `'same'`: central slice of the full convolution of length `max(a.length, b.length)`.
 * - `'valid'`: slice where signals fully overlap, of length `max(a.length, b.length) - min(a.length, b.length) + 1`.
 *
 * @param {readonly number[]} a - First input sequence of finite float64 numbers.
 * @param {readonly number[]} b - Second input sequence of finite float64 numbers.
 * @param {'full' | 'same' | 'valid'} [mode='full'] - Output sizing mode.
 * @returns {number[]} The convolved sequence of float64 numbers.
 * @throws {TypeError} If `a` or `b` is not an Array of numbers, or `mode` is not a string.
 * @throws {RangeError} If `a` or `b` contains non-finite numbers, or `mode` is unsupported.
 */
export function convolutionFloatIterative(a, b, mode = 'full') {
	validateFloatArray(a, 'a')
	validateFloatArray(b, 'b')
	validateMode(mode)

	const aLen = a.length
	const bLen = b.length
	if (aLen === 0 || bLen === 0) {
		return []
	}

	const fullLen = aLen + bLen - 1
	const maxLen = Math.max(aLen, bLen)
	const minLen = Math.min(aLen, bLen)

	let start = 0
	let outLen = fullLen

	if (mode === 'same') {
		start = Math.floor((minLen - 1) / 2)
		outLen = maxLen
	} else if (mode === 'valid') {
		start = minLen - 1
		outLen = maxLen - minLen + 1
	}

	const result = new Array(outLen)
	for (let i = 0; i < outLen; i++) {
		const n = start + i
		const kMin = Math.max(0, n - bLen + 1)
		const kMax = Math.min(aLen - 1, n)
		let sum = 0
		for (let k = kMin; k <= kMax; k++) {
			sum += a[k] * b[n - k]
		}
		result[i] = sum
	}

	return result
}
