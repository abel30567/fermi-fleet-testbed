/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Validates that a value is a finite complex number object `{ re, im }`.
 *
 * @param {unknown} value - Candidate complex number.
 * @param {string} vectorName - Parameter name for error reporting.
 * @param {number} index - Element index for error reporting.
 * @throws {TypeError} If `value` is not a non-null object with numeric `re` and `im` properties.
 * @throws {RangeError} If `value.re` or `value.im` is not a finite number (`NaN` or `±Infinity`).
 */
function assertValidComplex(value, vectorName, index) {
	if (typeof value !== 'object' || value === null) {
		throw new TypeError(
			`${vectorName}[${index}] must be a complex number object { re, im }`
		);
	}
	if (typeof value.re !== 'number' || typeof value.im !== 'number') {
		throw new TypeError(
			`${vectorName}[${index}] must have numeric re and im properties`
		);
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError(
			`${vectorName}[${index}] must have finite re and im components`
		);
	}
}

/**
 * Normalizes `-0` to `0` while leaving all other numbers unchanged.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x;
}

/**
 * Recursively computes the Hermitian inner product over the inclusive index
 * range `[lo, hi]` using a pairwise divide-and-conquer split.
 *
 * @param {Complex[]} a
 * @param {Complex[]} b
 * @param {number} lo - Inclusive lower index.
 * @param {number} hi - Inclusive upper index.
 * @returns {Complex}
 */
function dotRange(a, b, lo, hi) {
	if (lo === hi) {
		const ak = a[lo];
		const bk = b[lo];
		// ak * conj(bk) = (ak.re + i*ak.im) * (bk.re - i*bk.im)
		const re = ak.re * bk.re + ak.im * bk.im;
		const im = ak.im * bk.re - ak.re * bk.im;
		return {
			re: normalizeZero(re),
			im: normalizeZero(im),
		};
	}

	const mid = (lo + hi) >>> 1;
	const left = dotRange(a, b, lo, mid);
	const right = dotRange(a, b, mid + 1, hi);

	return {
		re: normalizeZero(left.re + right.re),
		im: normalizeZero(left.im + right.im),
	};
}

/**
 * Computes the Hermitian inner product (complex dot product) of two equal-length
 * vectors of complex numbers `{ re, im }`:
 *
 *   dot(a, b) = sum_{k=0}^{n-1} a[k] * conj(b[k])
 *             = sum_{k=0}^{n-1} ((a[k].re * b[k].re + a[k].im * b[k].im)
 *                                + i * (a[k].im * b[k].re - a[k].re * b[k].im))
 *
 * Uses a recursive divide-and-conquer pairwise split (`mid = (lo + hi) >>> 1`),
 * achieving `O(log n)` recursion depth and pairwise summation accuracy.
 * Returns `{ re: 0, im: 0 }` when both vectors are empty.
 *
 * @param {Complex[]} a - First complex vector.
 * @param {Complex[]} b - Second complex vector (conjugated in the inner product).
 * @returns {Complex} The complex Hermitian inner product `{ re, im }`.
 * @throws {TypeError} If `a` or `b` is not an array, or any element is not a `{ re, im }` object with numeric fields.
 * @throws {RangeError} If `a` and `b` have different lengths, or any component is `NaN` or infinite.
 */
export function dotProductComplexRecursive(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument "a" must be an array');
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument "b" must be an array');
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Vectors must have the same length (received ${a.length} and ${b.length})`
		);
	}

	const n = a.length;
	for (let i = 0; i < n; i++) {
		assertValidComplex(a[i], 'a', i);
		assertValidComplex(b[i], 'b', i);
	}

	if (n === 0) {
		return { re: 0, im: 0 };
	}

	return dotRange(a, b, 0, n - 1);
}
