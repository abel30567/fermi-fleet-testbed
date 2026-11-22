/**
 * Computes the element-wise mathematical (floored) modulo of two Float64Array
 * inputs using a recursive divide-and-conquer algorithm.
 *
 * For each index `i`, the result is `((a[i] % b[i]) + b[i]) % b[i]` with `-0`
 * normalized to `+0`, so the remainder shares the sign of the divisor `b[i]`
 * (non-negative in `[0, b[i])` for `b[i] > 0`, and non-positive in `(b[i], 0]`
 * for `b[i] < 0`).
 *
 * The recursion bisects the index range `[start, end)` down to single-element
 * leaves, yielding `O(n)` time complexity and `O(log n)` call-stack depth.
 *
 * @param {Float64Array} a - Element-wise dividends (all elements must be finite).
 * @param {Float64Array} b - Element-wise divisors (all elements must be finite and non-zero).
 * @returns {Float64Array} A new Float64Array containing the element-wise modulo results.
 * @throws {TypeError} If `a` or `b` is not a `Float64Array`.
 * @throws {RangeError} If `a` and `b` have different lengths, contain non-finite values (`NaN`, `±Infinity`), or `b` contains `0` / `-0`.
 */
export function moduloTypedRecursive(a, b) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('First argument "a" must be a Float64Array')
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Second argument "b" must be a Float64Array')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Input Float64Arrays must have the same length (got ${a.length} and ${b.length})`
		)
	}

	const result = new Float64Array(a.length)
	if (a.length === 0) {
		return result
	}

	computeModuloRange(a, b, result, 0, a.length)
	return result
}

/**
 * Recursively computes element-wise modulo over `[start, end)` via divide-and-conquer.
 *
 * @param {Float64Array} a - Dividends.
 * @param {Float64Array} b - Divisors.
 * @param {Float64Array} out - Output buffer.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 */
function computeModuloRange(a, b, out, start, end) {
	const length = end - start
	if (length === 1) {
		const dividend = a[start]
		const divisor = b[start]

		if (!Number.isFinite(dividend)) {
			throw new RangeError(
				`Invalid dividend at index ${start}: expected a finite number, got ${dividend}`
			)
		}
		if (!Number.isFinite(divisor)) {
			throw new RangeError(
				`Invalid divisor at index ${start}: expected a finite number, got ${divisor}`
			)
		}
		if (divisor === 0) {
			throw new RangeError(`Division by zero at index ${start}`)
		}

		const mod = ((dividend % divisor) + divisor) % divisor
		out[start] = mod === 0 ? 0 : mod
		return
	}

	const mid = start + Math.floor(length / 2)
	computeModuloRange(a, b, out, start, mid)
	computeModuloRange(a, b, out, mid, end)
}
