/**
 * Computes the 3D vector cross product `a × b` over exact `BigInt` integers
 * using a straightforward iterative implementation.
 *
 * Since all inputs are exact `BigInt` integers and the 3D cross product uses
 * only multiplication and subtraction (`c[k] = a[(k+1)%3] * b[(k+2)%3] - a[(k+2)%3] * b[(k+1)%3]`),
 * the result is always an exact 3-element `BigInt` array with no rounding or overflow.
 *
 * @param {readonly [bigint, bigint, bigint]} a - First 3D vector of `BigInt` integers.
 * @param {readonly [bigint, bigint, bigint]} b - Second 3D vector of `BigInt` integers.
 * @returns {[bigint, bigint, bigint]} The exact cross product vector `a × b`.
 * @throws {TypeError} If `a` or `b` is not an array or contains non-`BigInt` elements.
 * @throws {RangeError} If `a` or `b` does not have length 3.
 */
export function crossProductBigIntIterative(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument must be an array of 3 BigInts');
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument must be an array of 3 BigInts');
	}
	if (a.length !== 3) {
		throw new RangeError(`First vector must have length 3, got ${a.length}`);
	}
	if (b.length !== 3) {
		throw new RangeError(`Second vector must have length 3, got ${b.length}`);
	}

	for (let idx = 0; idx < 3; idx++) {
		if (typeof a[idx] !== 'bigint') {
			throw new TypeError(`First vector element at index ${idx} must be a BigInt`);
		}
		if (typeof b[idx] !== 'bigint') {
			throw new TypeError(`Second vector element at index ${idx} must be a BigInt`);
		}
	}

	const result = new Array(3);
	for (let k = 0; k < 3; k++) {
		const i = (k + 1) % 3;
		const j = (k + 2) % 3;
		result[k] = a[i] * b[j] - a[j] * b[i];
	}

	return result;
}
