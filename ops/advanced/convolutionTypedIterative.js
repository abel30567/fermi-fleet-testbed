const VALID_MODES = new Set(['full', 'same', 'valid'])

/**
 * Validates that a value is a Float64Array containing only finite numbers.
 *
 * @param {unknown} value - Candidate typed array to validate.
 * @param {string} name - Parameter name used in error messages.
 * @throws {TypeError} If `value` is not a `Float64Array`.
 * @throws {RangeError} If any element of `value` is not finite (`NaN`, `Infinity`, or `-Infinity`).
 */
function assertFiniteFloat64Array(value, name) {
	if (!(value instanceof Float64Array)) {
		throw new TypeError(`${name} must be a Float64Array`)
	}
	for (let i = 0; i < value.length; i++) {
		if (!Number.isFinite(value[i])) {
			throw new RangeError(`${name}[${i}] must be a finite number`)
		}
	}
}

/**
 * Computes the 1D discrete linear convolution of two `Float64Array` sequences
 * using a straightforward iterative summation.
 *
 * For non-empty inputs `signal` of length `N` and `kernel` of length `M`, the
 * full linear convolution is defined for `0 <= n < N + M - 1` as:
 *
 *   (signal * kernel)[n] = sum_{j = max(0, n - N + 1)}^{min(n, M - 1)} signal[n - j] * kernel[j]
 *
 * Supported output modes:
 * - `'full'` (default): returns all `N + M - 1` samples of the linear convolution.
 * - `'same'`: returns the central `N` samples (matching `signal.length`), starting
 *   at full-convolution index `Math.floor((M - 1) / 2)`.
 * - `'valid'`: returns only samples computed without zero-padding (`N - M + 1`
 *   samples starting at full-convolution index `M - 1`, or an empty `Float64Array`
 *   when `N < M`).
 *
 * If either `signal` or `kernel` is empty, an empty `Float64Array(0)` is returned
 * (after validating both inputs and `mode`).
 *
 * @param {Float64Array} signal - Input 1D signal containing finite float64 values.
 * @param {Float64Array} kernel - Convolution kernel containing finite float64 values.
 * @param {'full' | 'same' | 'valid'} [mode='full'] - Convolution output mode.
 * @returns {Float64Array} A new `Float64Array` containing the convolution result.
 * @throws {TypeError} If `signal` or `kernel` is not a `Float64Array`, or if `mode` is not a string.
 * @throws {RangeError} If any element of `signal` or `kernel` is non-finite, or if `mode` is unrecognized.
 */
export function convolutionTypedIterative(signal, kernel, mode = 'full') {
	assertFiniteFloat64Array(signal, 'signal')
	assertFiniteFloat64Array(kernel, 'kernel')

	if (typeof mode !== 'string') {
		throw new TypeError('mode must be a string')
	}
	if (!VALID_MODES.has(mode)) {
		throw new RangeError(`mode must be one of 'full', 'same', or 'valid'; received '${mode}'`)
	}

	const signalLen = signal.length
	const kernelLen = kernel.length

	if (signalLen === 0 || kernelLen === 0) {
		return new Float64Array(0)
	}

	let outLen
	let offset

	if (mode === 'full') {
		outLen = signalLen + kernelLen - 1
		offset = 0
	} else if (mode === 'same') {
		outLen = signalLen
		offset = Math.floor((kernelLen - 1) / 2)
	} else {
		// mode === 'valid'
		if (signalLen < kernelLen) {
			return new Float64Array(0)
		}
		outLen = signalLen - kernelLen + 1
		offset = kernelLen - 1
	}

	const output = new Float64Array(outLen)

	for (let outIdx = 0; outIdx < outLen; outIdx++) {
		const n = outIdx + offset
		const jStart = n >= signalLen ? n - signalLen + 1 : 0
		const jEnd = n < kernelLen ? n : kernelLen - 1
		let sum = 0

		for (let j = jStart; j <= jEnd; j++) {
			sum += signal[n - j] * kernel[j]
		}

		output[outIdx] = sum
	}

	return output
}
