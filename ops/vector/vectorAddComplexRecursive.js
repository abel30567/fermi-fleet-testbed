/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Normalizes IEEE-754 negative zero (`-0`) to positive zero (`0`).
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Validates that a value is a finite complex number `{ re, im }`.
 *
 * @param {unknown} value
 * @param {string} label
 * @throws {TypeError} If `value` is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is not a finite number.
 */
function assertComplex(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be a complex number object { re, im }`)
	}
	const { re, im } = /** @type {{ re: unknown, im: unknown }} */ (value)
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${label}.re and ${label}.im must be numbers`)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${label}.re and ${label}.im must be finite numbers`)
	}
}

/**
 * Recursively computes `out[i] = u[i] + v[i]` over the half-open index interval `[lo, hi)`
 * using binary divide-and-conquer (`O(log n)` stack depth).
 *
 * @param {readonly Complex[]} u
 * @param {readonly Complex[]} v
 * @param {Complex[]} out
 * @param {number} lo
 * @param {number} hi
 */
function addRangeRecursive(u, v, out, lo, hi) {
	const count = hi - lo
	if (count === 0) {
		return
	}
	if (count === 1) {
		const a = u[lo]
		const b = v[lo]
		assertComplex(a, `u[${lo}]`)
		assertComplex(b, `v[${lo}]`)

		const re = a.re + b.re
		const im = a.im + b.im
		if (!Number.isFinite(re) || !Number.isFinite(im)) {
			throw new RangeError(`Complex addition overflowed finite range at index ${lo}`)
		}

		out[lo] = {
			re: normalizeZero(re),
			im: normalizeZero(im),
		}
		return
	}

	const mid = lo + (count >>> 1)
	addRangeRecursive(u, v, out, lo, mid)
	addRangeRecursive(u, v, out, mid, hi)
}

/**
 * Adds two complex vectors element-wise using a recursive divide-and-conquer algorithm.
 *
 * Complex numbers are represented as objects `{ re, im }` with finite real numbers.
 * For vectors `u` and `v` of length `n`, the returned vector `w` satisfies:
 * `w[k] = { re: u[k].re + v[k].re, im: u[k].im + v[k].im }` for `0 <= k < n`.
 *
 * Algorithm:
 * - Splits the index range `[lo, hi)` at its midpoint `mid = lo + ((hi - lo) >>> 1)`
 *   and recursively computes the left half `[lo, mid)` and right half `[mid, hi)`.
 * - Achieves `O(n)` time complexity and `O(log n)` recursion depth, avoiding stack
 *   overflows on large vectors.
 * - Normalizes `-0` components to `+0` and leaves input vectors unmutated.
 *
 * @param {readonly Complex[]} u - First complex vector.
 * @param {readonly Complex[]} v - Second complex vector (must match `u.length`).
 * @returns {Complex[]} A new complex vector equal to `u + v`.
 * @throws {TypeError} If `u` or `v` is not an array, or any element is not a `{ re, im }` object with numeric fields.
 * @throws {RangeError} If `u.length !== v.length`, any component is non-finite (`NaN`/`±Infinity`), or addition overflows finite precision.
 */
export function vectorAddComplexRecursive(u, v) {
	if (!Array.isArray(u)) {
		throw new TypeError('First argument u must be an array of complex numbers')
	}
	if (!Array.isArray(v)) {
		throw new TypeError('Second argument v must be an array of complex numbers')
	}
	if (u.length !== v.length) {
		throw new RangeError(`Vector dimension mismatch: u has length ${u.length}, v has length ${v.length}`)
	}

	const out = new Array(u.length)
	addRangeRecursive(u, v, out, 0, u.length)
	return out
}
