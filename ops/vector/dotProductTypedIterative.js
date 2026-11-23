/**
 * Computes the element-wise dot product of two {@link Float64Array} vectors
 * using a straightforward iterative loop.
 *
 * @param {Float64Array} a - First input vector.
 * @param {Float64Array} b - Second input vector (must have the same length as `a`).
 * @returns {number} The scalar dot product `sum(a[i] * b[i])`, or `0` for empty vectors.
 * @throws {TypeError} If either `a` or `b` is not a `Float64Array`.
 * @throws {RangeError} If `a` and `b` have different lengths.
 */
export function dotProductTypedIterative(a, b) {
	if (!(a instanceof Float64Array) || !(b instanceof Float64Array)) {
		throw new TypeError('Both inputs must be Float64Array instances');
	}
	const len = a.length;
	if (len !== b.length) {
		throw new RangeError(
			`Vectors must have the same length (received ${len} and ${b.length})`
		);
	}

	let sum = 0;
	for (let i = 0; i < len; i++) {
		sum += a[i] * b[i];
	}
	return sum;
}
