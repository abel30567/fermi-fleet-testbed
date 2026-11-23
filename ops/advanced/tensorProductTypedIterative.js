/**
 * Computes the tensor (outer / Kronecker) product of two Float64Array vectors
 * using a straightforward iterative implementation.
 *
 * For input vectors `a` of length `m` and `b` of length `n`, returns a newly
 * allocated row-major `Float64Array` of length `m * n` where:
 *   `result[i * n + j] = a[i] * b[j]` for `0 <= i < m` and `0 <= j < n`.
 *
 * Because the result is a flat row-major `Float64Array`, repeated application
 * is closed over `Float64Array` and associative:
 *   `(a ⊗ b) ⊗ c === a ⊗ (b ⊗ c)` (up to IEEE 754 floating-point rounding).
 *
 * @param {Float64Array} a - First input vector containing finite numbers.
 * @param {Float64Array} b - Second input vector containing finite numbers.
 * @returns {Float64Array} Newly allocated row-major `Float64Array` of length `a.length * b.length`.
 * @throws {TypeError} If `a` or `b` is not a `Float64Array`.
 * @throws {RangeError} If any element of `a` or `b` is not finite (`NaN`, `Infinity`, `-Infinity`),
 *   or if the resulting length exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function tensorProductTypedIterative(a, b) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('First argument "a" must be a Float64Array')
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Second argument "b" must be a Float64Array')
	}

	const m = a.length
	const n = b.length

	for (let i = 0; i < m; i++) {
		if (!Number.isFinite(a[i])) {
			throw new RangeError(`Element a[${i}] must be a finite number`)
		}
	}
	for (let j = 0; j < n; j++) {
		if (!Number.isFinite(b[j])) {
			throw new RangeError(`Element b[${j}] must be a finite number`)
		}
	}

	const outLength = m * n
	if (!Number.isSafeInteger(outLength)) {
		throw new RangeError('Resulting tensor length exceeds safe integer range')
	}

	const result = new Float64Array(outLength)
	for (let i = 0; i < m; i++) {
		const ai = a[i]
		const rowOffset = i * n
		for (let j = 0; j < n; j++) {
			const prod = ai * b[j]
			result[rowOffset + j] = prod === 0 ? 0 : prod
		}
	}

	return result
}
