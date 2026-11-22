/**
 * Validates that an input is a Float64Array containing only finite numbers.
 *
 * @param {unknown} arr - Value to validate.
 * @param {string} name - Parameter name used in error messages.
 * @throws {TypeError} If `arr` is not a `Float64Array`.
 * @throws {RangeError} If `arr` contains a non-finite value (`NaN`, `Infinity`, `-Infinity`).
 */
function validateFloat64Array(arr, name) {
	if (!(arr instanceof Float64Array)) {
		throw new TypeError(`Expected ${name} to be a Float64Array`)
	}
	for (let i = 0; i < arr.length; i++) {
		if (!Number.isFinite(arr[i])) {
			throw new RangeError(`Expected ${name}[${i}] to be a finite number, got ${arr[i]}`)
		}
	}
}

/**
 * Element-wise sum of two Float64Arrays, zero-padding the shorter one.
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {Float64Array}
 */
function addFloat64Arrays(a, b) {
	const len = Math.max(a.length, b.length)
	const out = new Float64Array(len)
	for (let i = 0; i < a.length; i++) {
		out[i] += a[i]
	}
	for (let i = 0; i < b.length; i++) {
		out[i] += b[i]
	}
	return out
}

/**
 * Recursive Karatsuba / divide-and-conquer linear convolution of two non-empty Float64Arrays.
 *
 * For inputs of lengths `n` and `m`, splits both sequences at `mid = Math.floor(Math.max(n, m) / 2)`:
 * - When one input fits within `mid` (unequal lengths), reduces to two recursive subproblems
 *   (recursive overlap-add).
 * - When both inputs span `mid`, applies the Karatsuba identity with three recursive subproblems:
 *   `z0 = a0 * b0`, `z2 = a1 * b1`, `z1 = (a0 + a1) * (b0 + b1)`,
 *   combining `z0 + x^mid * (z1 - z0 - z2) + x^(2*mid) * z2`.
 *
 * @param {Float64Array} a - Non-empty first sequence.
 * @param {Float64Array} b - Non-empty second sequence.
 * @returns {Float64Array} Full discrete convolution of length `a.length + b.length - 1`.
 */
function convolveDivideAndConquer(a, b) {
	const n = a.length
	const m = b.length

	if (n === 1) {
		const scale = a[0]
		const out = new Float64Array(m)
		for (let j = 0; j < m; j++) {
			const prod = scale * b[j]
			out[j] = prod === 0 ? 0 : prod
		}
		return out
	}

	if (m === 1) {
		const scale = b[0]
		const out = new Float64Array(n)
		for (let i = 0; i < n; i++) {
			const prod = a[i] * scale
			out[i] = prod === 0 ? 0 : prod
		}
		return out
	}

	const mid = Math.floor(Math.max(n, m) / 2)
	const out = new Float64Array(n + m - 1)

	if (n <= mid) {
		const b0 = b.subarray(0, mid)
		const b1 = b.subarray(mid)
		const low = convolveDivideAndConquer(a, b0)
		const high = convolveDivideAndConquer(a, b1)
		for (let i = 0; i < low.length; i++) {
			out[i] += low[i]
		}
		for (let i = 0; i < high.length; i++) {
			out[mid + i] += high[i]
		}
		return out
	}

	if (m <= mid) {
		const a0 = a.subarray(0, mid)
		const a1 = a.subarray(mid)
		const low = convolveDivideAndConquer(a0, b)
		const high = convolveDivideAndConquer(a1, b)
		for (let i = 0; i < low.length; i++) {
			out[i] += low[i]
		}
		for (let i = 0; i < high.length; i++) {
			out[mid + i] += high[i]
		}
		return out
	}

	const a0 = a.subarray(0, mid)
	const a1 = a.subarray(mid)
	const b0 = b.subarray(0, mid)
	const b1 = b.subarray(mid)

	const z0 = convolveDivideAndConquer(a0, b0)
	const z2 = convolveDivideAndConquer(a1, b1)
	const aSum = addFloat64Arrays(a0, a1)
	const bSum = addFloat64Arrays(b0, b1)
	const z1 = convolveDivideAndConquer(aSum, bSum)

	for (let i = 0; i < z0.length; i++) {
		out[i] += z0[i]
		out[mid + i] -= z0[i]
	}
	for (let i = 0; i < z1.length; i++) {
		out[mid + i] += z1[i]
	}
	const twoMid = 2 * mid
	for (let i = 0; i < z2.length; i++) {
		out[mid + i] -= z2[i]
		out[twoMid + i] += z2[i]
	}

	return out
}

/**
 * Computes the full discrete linear convolution of two `Float64Array` sequences
 * using a recursive Karatsuba divide-and-conquer algorithm.
 *
 * For non-empty inputs `signal` (length `N`) and `kernel` (length `M`), returns a new
 * `Float64Array` of length `N + M - 1` where:
 * `out[k] = sum_{i = max(0, k - M + 1)}^{min(N - 1, k)} signal[i] * kernel[k - i]`.
 *
 * If either input is empty, returns an empty `Float64Array`.
 *
 * @param {Float64Array} signal - First input sequence of finite numbers.
 * @param {Float64Array} kernel - Second input sequence (convolution kernel) of finite numbers.
 * @returns {Float64Array} Full linear convolution result as a new `Float64Array`.
 * @throws {TypeError} If `signal` or `kernel` is not a `Float64Array`.
 * @throws {RangeError} If `signal` or `kernel` contains `NaN`, `Infinity`, or `-Infinity`.
 */
export function convolutionTypedRecursive(signal, kernel) {
	validateFloat64Array(signal, 'signal')
	validateFloat64Array(kernel, 'kernel')

	if (signal.length === 0 || kernel.length === 0) {
		return new Float64Array(0)
	}

	const result = convolveDivideAndConquer(signal, kernel)
	for (let i = 0; i < result.length; i++) {
		if (result[i] === 0) {
			result[i] = 0
		}
	}
	return result
}
