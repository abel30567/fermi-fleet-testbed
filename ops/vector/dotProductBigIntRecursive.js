/**
 * Computes the exact dot product of two equal-length vectors of `BigInt` values
 * using a recursive divide-and-conquer algorithm.
 *
 * Splits the index range `[start, end)` in half recursively (`O(log n)` call-stack
 * depth, zero intermediate array allocations) and combines partial sums exactly
 * in arbitrary-precision `BigInt` arithmetic.
 *
 * For empty vectors `([], [])`, returns `0n` (the additive identity).
 *
 * @param {readonly bigint[]} a - First vector of `BigInt` integers.
 * @param {readonly bigint[]} b - Second vector of `BigInt` integers (must match `a.length`).
 * @returns {bigint} Exact `BigInt` dot product `sum(a[i] * b[i])`.
 * @throws {TypeError} If `a` or `b` is not an Array, or if any element is not a `bigint`.
 * @throws {RangeError} If `a` and `b` have different lengths.
 */
export function dotProductBigIntRecursive(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument "a" must be an Array of bigint values.');
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument "b" must be an Array of bigint values.');
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Vectors must have equal length (received ${a.length} and ${b.length}).`,
		);
	}

	const len = a.length;
	for (let i = 0; i < len; i++) {
		if (typeof a[i] !== 'bigint') {
			throw new TypeError(
				`Element a[${i}] must be a bigint (received ${a[i] === null ? 'null' : typeof a[i]}).`,
			);
		}
		if (typeof b[i] !== 'bigint') {
			throw new TypeError(
				`Element b[${i}] must be a bigint (received ${b[i] === null ? 'null' : typeof b[i]}).`,
			);
		}
	}

	if (len === 0) {
		return 0n;
	}

	return dotRange(a, b, 0, len);
}

/**
 * Divide-and-conquer recursive helper computing `sum_{i=start}^{end-1} a[i] * b[i]`.
 *
 * @param {readonly bigint[]} a
 * @param {readonly bigint[]} b
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index (`end > start`).
 * @returns {bigint}
 */
function dotRange(a, b, start, end) {
	const count = end - start;
	if (count === 1) {
		return a[start] * b[start];
	}
	const mid = start + (count >>> 1);
	return dotRange(a, b, start, mid) + dotRange(a, b, mid, end);
}
