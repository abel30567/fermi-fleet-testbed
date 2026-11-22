/**
 * Computes the element-wise real cube root of a Float64Array using a
 * straightforward iterative loop.
 *
 * Special IEEE-754 values follow `Math.cbrt` semantics:
 * - `+0` -> `+0`, `-0` -> `-0`
 * - `+Infinity` -> `+Infinity`, `-Infinity` -> `-Infinity`
 * - `NaN` -> `NaN`
 *
 * @param {Float64Array} input - Source typed array of double-precision values.
 * @param {Float64Array} [out] - Optional destination Float64Array of the same length (may alias `input` for in-place execution).
 * @returns {Float64Array} A Float64Array containing the cube root of each element in `input`.
 * @throws {TypeError} If `input` is not a Float64Array, or if `out` is provided and is not a Float64Array.
 * @throws {RangeError} If `out` is provided and its length does not match `input.length`.
 */
export function cbrtTypedIterative(input, out = undefined) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array')
	}

	const length = input.length
	let target

	if (out === undefined) {
		target = new Float64Array(length)
	} else {
		if (!(out instanceof Float64Array)) {
			throw new TypeError('Expected out to be a Float64Array')
		}
		if (out.length !== length) {
			throw new RangeError(
				`Expected out length (${out.length}) to match input length (${length})`,
			)
		}
		target = out
	}

	for (let i = 0; i < length; i += 1) {
		target[i] = Math.cbrt(input[i])
	}

	return target
}
