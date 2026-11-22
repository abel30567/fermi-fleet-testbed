/**
 * Recursively computes element-wise division over the half-open index range [lo, hi).
 *
 * @param {Float64Array} a - Dividend array.
 * @param {Float64Array} b - Divisor array.
 * @param {Float64Array} out - Preallocated output array.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @throws {RangeError} If any divisor in [lo, hi) is zero (including -0).
 */
function divideRange(a, b, out, lo, hi) {
	const len = hi - lo;
	if (len === 0) {
		return;
	}
	if (len === 1) {
		const divisor = b[lo];
		if (divisor === 0) {
			throw new RangeError(`Division by zero at index ${lo}`);
		}
		out[lo] = a[lo] / divisor;
		return;
	}
	const mid = lo + (len >>> 1);
	divideRange(a, b, out, lo, mid);
	divideRange(a, b, out, mid, hi);
}

/**
 * Performs element-wise arithmetic division (`a[i] / b[i]`) over two `Float64Array`
 * inputs using a divide-and-conquer recursive algorithm that splits the index range
 * `[lo, hi)` into halves.
 *
 * Does not mutate either input array and returns a newly allocated `Float64Array`.
 *
 * @param {Float64Array} a - Dividend values.
 * @param {Float64Array} b - Divisor values (must contain no zeros).
 * @returns {Float64Array} A new `Float64Array` containing the element-wise quotients.
 * @throws {TypeError} If either `a` or `b` is not a `Float64Array`.
 * @throws {RangeError} If `a` and `b` have different lengths, or if any `b[i] === 0`.
 */
export function divideTypedRecursive(a, b) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('First argument "a" must be a Float64Array');
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Second argument "b" must be a Float64Array');
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Input Float64Arrays must have equal length (got ${a.length} and ${b.length})`
		);
	}

	const out = new Float64Array(a.length);
	divideRange(a, b, out, 0, a.length);
	return out;
}
