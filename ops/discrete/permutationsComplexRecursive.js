/**
 * Normalizes negative zero (`-0`) to positive zero (`0`).
 *
 * @param {number} value - Finite numeric value.
 * @returns {number} Normalized numeric value without `-0`.
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Validates that a value is a complex number object `{ re, im }` with finite numeric parts.
 *
 * @param {unknown} z - Candidate complex number.
 * @throws {TypeError} If `z` is not a non-null non-array object with numeric `re` and `im` properties.
 * @throws {RangeError} If `z.re` or `z.im` is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
function validateComplex(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('Expected z to be a complex number object { re, im }')
	}
	if (typeof z.re !== 'number' || typeof z.im !== 'number') {
		throw new TypeError('Expected z.re and z.im to be numbers')
	}
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError('Expected z.re and z.im to be finite numbers')
	}
}

/**
 * Validates that `k` is a non-negative safe integer.
 *
 * @param {unknown} k - Number of falling factors.
 * @throws {TypeError} If `k` is not a number.
 * @throws {RangeError} If `k` is not a finite, non-negative safe integer.
 */
function validateCount(k) {
	if (typeof k !== 'number') {
		throw new TypeError('Expected k to be a number')
	}
	if (!Number.isFinite(k) || !Number.isInteger(k) || k < 0) {
		throw new RangeError('Expected k to be a non-negative integer')
	}
	if (!Number.isSafeInteger(k)) {
		throw new RangeError('Expected k to be a safe integer')
	}
}

/**
 * Multiplies two complex numbers and validates that the result remains finite.
 *
 * @param {{ re: number, im: number }} a - First complex factor.
 * @param {{ re: number, im: number }} b - Second complex factor.
 * @returns {{ re: number, im: number }} Product `a * b` with `-0` normalized to `0`.
 * @throws {RangeError} If the product overflows finite IEEE-754 floating-point range.
 */
function complexMul(a, b) {
	const re = a.re * b.re - a.im * b.im
	const im = a.re * b.im + a.im * b.re
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Complex permutation product overflowed finite floating-point range')
	}
	return {
		re: normalizeZero(re),
		im: normalizeZero(im),
	}
}

/**
 * Recursively computes the product `prod_{j = lo}^{hi} (z - j)` using a
 * divide-and-conquer binary product tree (`O(log(hi - lo + 1))` recursion depth).
 *
 * @param {{ re: number, im: number }} z - Complex base value.
 * @param {number} lo - Inclusive lower offset index.
 * @param {number} hi - Inclusive upper offset index.
 * @returns {{ re: number, im: number }} Complex product over `[lo, hi]`.
 * @throws {RangeError} If any factor or intermediate product overflows finite floating-point range.
 */
function productRange(z, lo, hi) {
	if (z.im === 0 && Number.isInteger(z.re) && z.re >= lo && z.re <= hi) {
		return { re: 0, im: 0 }
	}
	if (lo === hi) {
		const re = z.re - lo
		if (!Number.isFinite(re)) {
			throw new RangeError('Complex permutation factor overflowed finite floating-point range')
		}
		return {
			re: normalizeZero(re),
			im: normalizeZero(z.im),
		}
	}
	const mid = lo + Math.floor((hi - lo) / 2)
	const left = productRange(z, lo, mid)
	if (left.re === 0 && left.im === 0) {
		return { re: 0, im: 0 }
	}
	const right = productRange(z, mid + 1, hi)
	return complexMul(left, right)
}

/**
 * Computes discrete permutations (falling factorial) `P(z, k) = z(z - 1)...(z - k + 1)`
 * for a complex number `z = { re, im }` and a non-negative integer `k`.
 *
 * Uses a recursive divide-and-conquer binary product tree over the factor index range
 * `[0, k - 1]`, splitting at the midpoint and multiplying the left and right sub-products.
 * This yields `O(k)` complex multiplications with `O(log k)` call-stack depth, and
 * short-circuits exact zero factors when `z` is a real integer in `[0, k - 1]`.
 *
 * @param {{ re: number, im: number }} z - Complex number `{ re, im }` with finite numeric parts.
 * @param {number} k - Non-negative safe integer count of falling factors.
 * @returns {{ re: number, im: number }} Falling factorial `P(z, k)` as `{ re, im }` without `-0`.
 * @throws {TypeError} If `z` is not a complex `{ re, im }` object or `k` is not a number.
 * @throws {RangeError} If `z.re`/`z.im` are non-finite, `k` is not a non-negative safe integer,
 *   or the result overflows finite IEEE-754 floating-point range.
 */
export function permutationsComplexRecursive(z, k) {
	validateComplex(z)
	validateCount(k)

	if (k === 0) {
		return { re: 1, im: 0 }
	}

	return productRange(z, 0, k - 1)
}
