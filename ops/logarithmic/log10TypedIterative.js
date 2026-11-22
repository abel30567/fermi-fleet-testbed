/**
 * Computes the base-10 logarithm (`log10`) element-wise over a `Float64Array`
 * using a straightforward iterative loop.
 *
 * Follows IEEE-754 / `Math.log10` semantics for each element:
 * - `x > 0` (finite): returns `log10(x)`
 * - `x === 0` or `x === -0`: returns `-Infinity`
 * - `x === Infinity`: returns `Infinity`
 * - `x < 0` or `Number.isNaN(x)`: returns `NaN`
 *
 * @param {Float64Array} input - Input array of IEEE-754 double-precision numbers.
 * @param {Float64Array} [out] - Optional preallocated output `Float64Array` of the same length as `input` (may alias `input` for in-place computation).
 * @returns {Float64Array} A `Float64Array` containing `Math.log10(input[i])` for each index `i`.
 * @throws {TypeError} If `input` is not a `Float64Array`, or if `out` is provided and is not a `Float64Array`.
 * @throws {RangeError} If `out` is provided and `out.length !== input.length`.
 */
export function log10TypedIterative(input, out = undefined) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array')
	}

	const len = input.length
	let target

	if (out === undefined) {
		target = new Float64Array(len)
	} else {
		if (!(out instanceof Float64Array)) {
			throw new TypeError('Expected out to be a Float64Array')
		}
		if (out.length !== len) {
			throw new RangeError(
				`Output length (${out.length}) must match input length (${len})`
			)
		}
		target = out
	}

	for (let i = 0; i < len; i += 1) {
		target[i] = Math.log10(input[i])
	}

	return target
}
