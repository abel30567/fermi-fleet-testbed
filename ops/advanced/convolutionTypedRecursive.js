/**
 * Computes the 1D discrete linear convolution of two `Float64Array` inputs
 * using a recursive divide-and-conquer algorithm.
 *
 * For non-empty inputs `signal` (length N) and `kernel` (length M), the full
 * convolution `out` has length `N + M - 1` where:
 *   `out[k] = sum_{i + j = k} signal[i] * kernel[j]`
 *
 * The divide-and-conquer step recursively bisects the longer subrange along its
 * midpoint until a base case of length 1 is reached, accumulating partial
 * convolutions into the output buffer without intermediate array allocations.
 *
 * @param {Float64Array} signal - First input sequence (finite float64 values).
 * @param {Float64Array} kernel - Second input sequence / filter kernel (finite float64 values).
 * @param {'full' | 'same' | 'valid'} [mode='full'] - Output size mode:
 *   - `'full'`: Full discrete linear convolution of length `N + M - 1`.
 *   - `'same'`: Centered slice of length `max(N, M)`.
 *   - `'valid'`: Only points where `signal` and `kernel` completely overlap,
 *     of length `max(N, M) - min(N, M) + 1`.
 * @returns {Float64Array} Resulting convolution values. Returns an empty
 *   `Float64Array` if either input is empty.
 * @throws {TypeError} If `signal` or `kernel` is not a `Float64Array`, or if `mode` is not a string.
 * @throws {RangeError} If any element in `signal` or `kernel` is not finite (`NaN`, `Infinity`, `-Infinity`),
 *   or if `mode` is not one of `'full'`, `'same'`, or `'valid'`.
 */
export function convolutionTypedRecursive(signal, kernel, mode = 'full') {
	if (!(signal instanceof Float64Array)) {
		throw new TypeError('Expected signal to be a Float64Array');
	}
	if (!(kernel instanceof Float64Array)) {
		throw new TypeError('Expected kernel to be a Float64Array');
	}
	if (typeof mode !== 'string') {
		throw new TypeError('Expected mode to be a string');
	}
	if (mode !== 'full' && mode !== 'same' && mode !== 'valid') {
		throw new RangeError(
			`Unsupported convolution mode: "${mode}". Expected "full", "same", or "valid".`,
		);
	}

	validateFinite(signal, 'signal');
	validateFinite(kernel, 'kernel');

	const n = signal.length;
	const m = kernel.length;

	if (n === 0 || m === 0) {
		return new Float64Array(0);
	}

	const full = new Float64Array(n + m - 1);
	convolveDivideAndConquer(signal, 0, n, kernel, 0, m, full, 0);

	if (mode === 'full') {
		return full;
	}

	const minLen = n < m ? n : m;
	const maxLen = n > m ? n : m;

	if (mode === 'same') {
		const start = Math.floor((minLen - 1) / 2);
		return full.slice(start, start + maxLen);
	}

	// mode === 'valid'
	const validLen = maxLen - minLen + 1;
	const start = minLen - 1;
	return full.slice(start, start + validLen);
}

/**
 * Validates that every element of a `Float64Array` is finite.
 *
 * @param {Float64Array} arr - Typed array to validate.
 * @param {string} name - Parameter name for error reporting.
 * @throws {RangeError} If any element is `NaN`, `Infinity`, or `-Infinity`.
 */
function validateFinite(arr, name) {
	for (let i = 0; i < arr.length; i++) {
		if (!Number.isFinite(arr[i])) {
			throw new RangeError(`${name}[${i}] must be a finite number`);
		}
	}
}

/**
 * Recursively accumulates the linear convolution of `a[aStart .. aStart+aLen-1]`
 * and `b[bStart .. bStart+bLen-1]` into `out` starting at `outOffset`.
 *
 * @param {Float64Array} a - First input array.
 * @param {number} aStart - Start index in `a`.
 * @param {number} aLen - Number of elements in `a` slice (must be >= 1).
 * @param {Float64Array} b - Second input array.
 * @param {number} bStart - Start index in `b`.
 * @param {number} bLen - Number of elements in `b` slice (must be >= 1).
 * @param {Float64Array} out - Output accumulation buffer.
 * @param {number} outOffset - Base offset in `out` for this subproblem.
 */
function convolveDivideAndConquer(a, aStart, aLen, b, bStart, bLen, out, outOffset) {
	if (aLen === 1) {
		const av = a[aStart];
		for (let j = 0; j < bLen; j++) {
			out[outOffset + j] += av * b[bStart + j];
		}
		return;
	}

	if (bLen === 1) {
		const bv = b[bStart];
		for (let i = 0; i < aLen; i++) {
			out[outOffset + i] += a[aStart + i] * bv;
		}
		return;
	}

	if (aLen >= bLen) {
		const mid = aLen >>> 1;
		convolveDivideAndConquer(a, aStart, mid, b, bStart, bLen, out, outOffset);
		convolveDivideAndConquer(a, aStart + mid, aLen - mid, b, bStart, bLen, out, outOffset + mid);
	} else {
		const mid = bLen >>> 1;
		convolveDivideAndConquer(a, aStart, aLen, b, bStart, mid, out, outOffset);
		convolveDivideAndConquer(a, aStart, aLen, b, bStart + mid, bLen - mid, out, outOffset + mid);
	}
}
