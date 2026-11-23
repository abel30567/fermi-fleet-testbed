/**
 * Computes the element-wise square root of a `Float64Array` using a
 * straightforward iterative `for` loop.
 *
 * Follows IEEE-754 semantics for element values:
 * - Non-negative finite values yield their principal square root.
 * - `-0` yields `-0`; `+0` yields `+0`.
 * - `+Infinity` yields `+Infinity`.
 * - Negative values (including `-Infinity`) and `NaN` yield `NaN`.
 *
 * The input array is never mutated; a new `Float64Array` of the same length
 * is returned.
 *
 * @param {Float64Array} input - The input typed array of double-precision floats.
 * @returns {Float64Array} A new `Float64Array` containing the element-wise square roots.
 * @throws {TypeError} If `input` is not a `Float64Array`.
 */
export function sqrtTypedIterative(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError(
			`Expected input to be a Float64Array, got ${input === null ? 'null' : typeof input === 'object' ? input.constructor?.name ?? 'Object' : typeof input}`,
		)
	}

	const length = input.length
	const output = new Float64Array(length)

	for (let i = 0; i < length; i++) {
		output[i] = Math.sqrt(input[i])
	}

	return output
}
