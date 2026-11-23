/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Validates that a value is a finite complex number object `{ re, im }`.
 *
 * @param {unknown} value - Candidate complex element.
 * @param {string} vectorName - Parameter name for error context.
 * @param {number} index - Element index for error context.
 * @throws {TypeError} If the element is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
function assertComplex(value, vectorName, index) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${vectorName}[${index}] must be a complex object { re, im }`)
	}
	const { re, im } = /** @type {{ re: unknown, im: unknown }} */ (value)
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${vectorName}[${index}] must have numeric re and im properties`)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${vectorName}[${index}] must have finite re and im values`)
	}
}

/**
 * Recursively computes element-wise complex vector addition over the half-open
 * range `[lo, hi)` using divide-and-conquer splitting at `mid = (lo + hi) >>> 1`.
 *
 * @param {Complex[]} a - First complex vector.
 * @param {Complex[]} b - Second complex vector.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @param {Complex[]} out - Pre-allocated output vector.
 */
function addRange(a, b, lo, hi, out) {
	if (lo >= hi) {
		return
	}
	if (hi - lo === 1) {
		assertComplex(a[lo], 'a', lo)
		assertComplex(b[lo], 'b', lo)
		out[lo] = {
			re: a[lo].re + b[lo].re,
			im: a[lo].im + b[lo].im,
		}
		return
	}

	const mid = (lo + hi) >>> 1
	addRange(a, b, lo, mid, out)
	addRange(a, b, mid, hi, out)
}

/**
 * Computes element-wise vector addition of two arrays of complex numbers `{ re, im }`
 * using a divide-and-conquer recursive algorithm (`mid = (lo + hi) >>> 1`).
 *
 * Runs in O(n) time and O(log n) call-stack depth without mutating input arrays
 * or sharing element object references with the inputs.
 *
 * @param {Complex[]} a - First input vector of complex numbers.
 * @param {Complex[]} b - Second input vector of complex numbers.
 * @returns {Complex[]} New vector where `result[i] = { re: a[i].re + b[i].re, im: a[i].im + b[i].im }`.
 * @throws {TypeError} If either argument is not an array or contains a malformed complex element.
 * @throws {RangeError} If vector lengths differ or any element has non-finite `re` or `im`.
 */
export function vectorAddComplexRecursive(a, b) {
	if (!Array.isArray(a) || !Array.isArray(b)) {
		throw new TypeError('Both inputs a and b must be arrays of complex { re, im } objects')
	}
	if (a.length !== b.length) {
		throw new RangeError(`Vector lengths must match (received ${a.length} and ${b.length})`)
	}

	const n = a.length
	if (n === 0) {
		return []
	}

	const out = new Array(n)
	addRange(a, b, 0, n, out)
	return out
}
