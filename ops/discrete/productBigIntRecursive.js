/**
 * Discrete product over exact BigInt integers using recursive divide-and-conquer
 * binary splitting (balanced product tree).
 *
 * The product of exact integers is always an exact integer, so the result is
 * returned directly as a `bigint` without fixed-point scaling.
 *
 * Dividing the input range `[start, end)` at its midpoint yields a balanced
 * binary recursion tree of depth `O(log n)` without slicing the input array.
 * Balanced sub-products allow V8's subquadratic BigInt multiplication to
 * operate on similarly sized operands at each level.
 *
 * @module ops/discrete/productBigIntRecursive
 */

/**
 * Recursively multiplies `values[start..end)` using balanced binary splitting.
 *
 * @param {readonly bigint[]} values - Validated array of BigInt integers.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index (`end > start`).
 * @returns {bigint} Exact product of `values[start..end)`.
 */
function multiplyRange(values, start, end) {
	const length = end - start
	if (length === 1) {
		return values[start]
	}
	if (length === 2) {
		return values[start] * values[start + 1]
	}

	const mid = start + (length >>> 1)
	const left = multiplyRange(values, start, mid)
	if (left === 0n) {
		return 0n
	}
	const right = multiplyRange(values, mid, end)
	return left * right
}

/**
 * Computes the discrete product of an array of exact `bigint` integers using
 * recursive divide-and-conquer binary splitting (`O(log n)` recursion depth).
 *
 * Returns the multiplicative identity `1n` for an empty array.
 *
 * @param {readonly bigint[]} values - Array of exact `bigint` integers to multiply.
 * @returns {bigint} Exact `bigint` product of all elements in `values`.
 * @throws {TypeError} If `values` is not an Array or any element (including sparse holes) is not a `bigint`.
 */
export function productBigIntRecursive(values) {
	if (!Array.isArray(values)) {
		throw new TypeError(
			`productBigIntRecursive: expected values to be an Array of bigint, got ${values === null ? 'null' : typeof values}`,
		)
	}

	const length = values.length
	for (let i = 0; i < length; i++) {
		if (!(i in values)) {
			throw new TypeError(
				`productBigIntRecursive: expected bigint at index ${i}, got sparse array hole`,
			)
		}
		if (typeof values[i] !== 'bigint') {
			throw new TypeError(
				`productBigIntRecursive: expected bigint at index ${i}, got ${values[i] === null ? 'null' : typeof values[i]}`,
			)
		}
	}

	if (length === 0) {
		return 1n
	}

	return multiplyRange(values, 0, length)
}
