/**
 * Computes the trigonometric sine (`Math.sin`) element-wise over a `Float64Array`
 * using a straightforward iterative loop.
 *
 * Input angles are interpreted in radians. Special IEEE-754 values follow
 * standard `Math.sin` semantics (`sin(-0) === -0`, `sin(±Infinity)` and
 * `sin(NaN)` yield `NaN`).
 *
 * @param {Float64Array} input - Input array of angles in radians.
 * @param {Float64Array} [out] - Optional preallocated output `Float64Array` of
 *   the same length as `input`. Supports in-place (`out === input`) and
 *   overlapping views of the same `ArrayBuffer`. When omitted, a new
 *   `Float64Array` is allocated and returned.
 * @returns {Float64Array} A `Float64Array` containing `Math.sin(input[i])` for
 *   each element `i`.
 * @throws {TypeError} If `input` is not a `Float64Array`, or if `out` is
 *   provided and is not a `Float64Array`.
 * @throws {RangeError} If `out` is provided and `out.length !== input.length`.
 */
export function sinTypedIterative(input, out = undefined) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('input must be a Float64Array');
	}

	const length = input.length;
	let target;

	if (out === undefined) {
		target = new Float64Array(length);
	} else {
		if (!(out instanceof Float64Array)) {
			throw new TypeError('out must be a Float64Array when provided');
		}
		if (out.length !== length) {
			throw new RangeError(
				`out length (${out.length}) must match input length (${length})`,
			);
		}
		target = out;
	}

	const overlapsForward =
		target.buffer === input.buffer &&
		target.byteOffset > input.byteOffset &&
		target.byteOffset < input.byteOffset + input.byteLength;

	if (overlapsForward) {
		for (let i = length - 1; i >= 0; i--) {
			target[i] = Math.sin(input[i]);
		}
	} else {
		for (let i = 0; i < length; i++) {
			target[i] = Math.sin(input[i]);
		}
	}

	return target;
}
