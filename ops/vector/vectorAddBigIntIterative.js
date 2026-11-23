/**
 * Adds two vectors of exact `BigInt` values element-wise using a
 * straightforward iterative loop.
 *
 * Works identically for plain integer `BigInt` vectors and fixed-point
 * `BigInt` vectors sharing a common scale factor (such as `10n ** 18n`),
 * because addition preserves scale without rounding or precision loss.
 *
 * Time complexity: O(n), Space complexity: O(n).
 *
 * @param {readonly bigint[]} a - First input vector of `BigInt` elements.
 * @param {readonly bigint[]} b - Second input vector of `BigInt` elements (same length as `a`).
 * @returns {bigint[]} A new array where each element `i` equals `a[i] + b[i]`.
 * @throws {TypeError} If `a` or `b` is not an array, or if any element is not a `bigint`.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 */
export function vectorAddBigIntIterative(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument "a" must be an array of BigInt values')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument "b" must be an array of BigInt values')
	}

	const len = a.length
	if (len !== b.length) {
		throw new RangeError(`Vector length mismatch: a.length (${len}) !== b.length (${b.length})`)
	}

	const result = new Array(len)
	for (let i = 0; i < len; i++) {
		const ai = a[i]
		const bi = b[i]
		if (typeof ai !== 'bigint') {
			throw new TypeError(`Element a[${i}] must be a bigint, got ${typeof ai}`)
		}
		if (typeof bi !== 'bigint') {
			throw new TypeError(`Element b[${i}] must be a bigint, got ${typeof bi}`)
		}
		result[i] = ai + bi
	}

	return result
}
