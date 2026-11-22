/**
 * Validates that a value is a 3-element array of IEEE-754 float64 numbers.
 *
 * @param {unknown} vec - The candidate vector to validate.
 * @param {string} name - Parameter name used in error messages.
 * @throws {TypeError} If `vec` is not an Array or any element is not a `number`.
 * @throws {RangeError} If `vec.length !== 3`.
 */
function validateVector3(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an Array of 3 numbers`);
	}
	if (vec.length !== 3) {
		throw new RangeError(`${name} must have length 3, received ${vec.length}`);
	}
	for (let i = 0; i < 3; i++) {
		if (typeof vec[i] !== 'number') {
			throw new TypeError(`${name}[${i}] must be a number, received ${typeof vec[i]}`);
		}
	}
}

/**
 * Computes the 3D vector cross product `a × b` over IEEE-754 float64 numbers
 * using a straightforward iterative implementation with cyclic indices.
 *
 * For each component `i` in `{0, 1, 2}`:
 *   `result[i] = a[(i + 1) % 3] * b[(i + 2) % 3] - a[(i + 2) % 3] * b[(i + 1) % 3]`
 *
 * IEEE-754 special numeric values (`NaN`, `Infinity`, `-Infinity`, `-0`) follow
 * standard JavaScript float64 arithmetic semantics.
 *
 * @param {readonly [number, number, number]} a - First 3D vector.
 * @param {readonly [number, number, number]} b - Second 3D vector.
 * @returns {[number, number, number]} The 3D cross product vector `a × b`.
 * @throws {TypeError} If `a` or `b` is not an Array, or contains any non-number element.
 * @throws {RangeError} If `a` or `b` does not have length 3.
 * @example
 * crossProductFloatIterative([1, 0, 0], [0, 1, 0]); // => [0, 0, 1]
 * crossProductFloatIterative([2, 3, 4], [5, 6, 7]); // => [-3, 6, -3]
 */
export function crossProductFloatIterative(a, b) {
	validateVector3(a, 'a');
	validateVector3(b, 'b');

	const result = new Array(3);
	for (let i = 0; i < 3; i++) {
		const j = (i + 1) % 3;
		const k = (i + 2) % 3;
		result[i] = a[j] * b[k] - a[k] * b[j];
	}
	return result;
}
