/**
 * Validates that a value is a finite IEEE-754 float64 Number.
 *
 * @param {unknown} value - The value to validate.
 * @param {string} label - Vector label for error reporting.
 * @param {number} index - Element index for error reporting.
 * @throws {TypeError} If the value is not of type `number`.
 * @throws {RangeError} If the value is `NaN`, `Infinity`, or `-Infinity`.
 */
function assertFiniteNumber(value, label, index) {
	if (typeof value !== 'number') {
		throw new TypeError(`${label}[${index}] must be a number (got ${typeof value})`);
	}
	if (!Number.isFinite(value)) {
		throw new RangeError(`${label}[${index}] must be a finite number (got ${value})`);
	}
}

/**
 * Recursively computes element-wise float64 vector addition over the half-open
 * index range `[lo, hi)` using divide-and-conquer bisection.
 *
 * @param {number[]} a - First input vector.
 * @param {number[]} b - Second input vector.
 * @param {number} lo - Inclusive lower index bound.
 * @param {number} hi - Exclusive upper index bound.
 * @param {number[]} out - Pre-allocated output array receiving sums.
 */
function addRange(a, b, lo, hi, out) {
	const span = hi - lo;
	if (span <= 0) {
		return;
	}
	if (span === 1) {
		const va = a[lo];
		const vb = b[lo];
		assertFiniteNumber(va, 'a', lo);
		assertFiniteNumber(vb, 'b', lo);
		out[lo] = va + vb;
		return;
	}

	const mid = lo + (span >>> 1);
	addRange(a, b, lo, mid, out);
	addRange(a, b, mid, hi, out);
}

/**
 * Computes the element-wise sum of two vectors of finite IEEE-754 float64
 * Numbers using a recursive divide-and-conquer algorithm that bisects the
 * index range `[lo, hi)` into left and right halves.
 *
 * Neither input array is mutated. Recursion depth is O(log n).
 *
 * @param {number[]} a - First vector of finite IEEE-754 float64 numbers.
 * @param {number[]} b - Second vector of finite IEEE-754 float64 numbers.
 * @returns {number[]} New array where `result[i] === a[i] + b[i]`.
 * @throws {TypeError} If either argument is not an Array or contains non-number elements.
 * @throws {RangeError} If the vectors have different lengths or contain `NaN`/`±Infinity`.
 */
export function vectorAddFloatRecursive(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument "a" must be an Array');
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument "b" must be an Array');
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Vectors must have equal length (got ${a.length} and ${b.length})`,
		);
	}

	const result = new Array(a.length);
	addRange(a, b, 0, a.length, result);
	return result;
}
