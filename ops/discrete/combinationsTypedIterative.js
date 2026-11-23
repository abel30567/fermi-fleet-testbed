/**
 * Compute the greatest common divisor of two positive safe integers using
 * the iterative Euclidean algorithm.
 *
 * @param {number} a - Positive safe integer.
 * @param {number} b - Positive safe integer.
 * @returns {number} Greatest common divisor of `a` and `b`.
 */
function gcd(a, b) {
	while (b !== 0) {
		const t = a % b
		a = b
		b = t
	}
	return a
}

/**
 * Compute the binomial coefficient C(n, k) iteratively for non-negative safe
 * integers `n` and `k`.
 *
 * Uses symmetry `r = min(k, n - k)` and reduces each multiplicative step by
 * `gcd` while within safe-integer precision to avoid intermediate rounding
 * error, transitioning smoothly to floating-point arithmetic beyond
 * `Number.MAX_SAFE_INTEGER`.
 *
 * @param {number} n - Non-negative safe integer.
 * @param {number} k - Non-negative safe integer.
 * @returns {number} The binomial coefficient C(n, k), or `Infinity` on overflow.
 */
function combinationsScalarIterative(n, k) {
	if (k > n) {
		return 0
	}
	const r = k > n - k ? n - k : k
	if (r === 0) {
		return 1
	}

	let result = 1
	for (let i = 1; i <= r; i++) {
		const num = n - r + i
		if (Number.isSafeInteger(result)) {
			const g = gcd(num, i)
			const a = num / g
			const b = i / g
			result = (result / b) * a
		} else {
			result = (result / i) * num
			if (!Number.isFinite(result)) {
				return Infinity
			}
		}
	}
	return result
}

/**
 * Compute element-wise discrete combinations C(n[i], k[i]) over `Float64Array`
 * inputs using a straightforward iterative implementation.
 *
 * For each index `i`:
 * - `n[i]` and `k[i]` must be non-negative safe integers.
 * - If `k[i] > n[i]`, the result at index `i` is `0`.
 * - If C(n[i], k[i]) exceeds `Number.MAX_VALUE`, the result at index `i` is `Infinity`.
 *
 * @param {Float64Array} nArray - Element-wise total item counts `n`.
 * @param {Float64Array} kArray - Element-wise selection counts `k`.
 * @returns {Float64Array} A new `Float64Array` containing C(nArray[i], kArray[i]).
 * @throws {TypeError} If `nArray` or `kArray` is not a `Float64Array`.
 * @throws {RangeError} If `nArray` and `kArray` have different lengths, or if any
 *   element is not a non-negative safe integer.
 */
export function combinationsTypedIterative(nArray, kArray) {
	if (!(nArray instanceof Float64Array)) {
		throw new TypeError('Expected nArray to be a Float64Array')
	}
	if (!(kArray instanceof Float64Array)) {
		throw new TypeError('Expected kArray to be a Float64Array')
	}
	const len = nArray.length
	if (len !== kArray.length) {
		throw new RangeError(
			`Input Float64Arrays must have the same length (received ${len} and ${kArray.length})`,
		)
	}

	const out = new Float64Array(len)
	for (let i = 0; i < len; i++) {
		const n = nArray[i]
		const k = kArray[i]
		if (!Number.isSafeInteger(n) || n < 0) {
			throw new RangeError(
				`nArray[${i}] must be a non-negative safe integer (received ${n})`,
			)
		}
		if (!Number.isSafeInteger(k) || k < 0) {
			throw new RangeError(
				`kArray[${i}] must be a non-negative safe integer (received ${k})`,
			)
		}
		out[i] = combinationsScalarIterative(n, k)
	}
	return out
}
