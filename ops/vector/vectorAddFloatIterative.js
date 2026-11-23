/**
 * Computes the element-wise vector sum of two equal-length arrays of IEEE-754
 * float64 numbers using a straightforward iterative loop.
 *
 * Does not mutate either input array.
 *
 * @param {readonly number[]} a - First input vector of finite IEEE-754 float64 numbers.
 * @param {readonly number[]} b - Second input vector of finite IEEE-754 float64 numbers.
 * @returns {number[]} New array where `result[i] === a[i] + b[i]` for each index `i`.
 * @throws {TypeError} If `a` or `b` is not an Array, or if any element is not a `number` (including sparse array holes).
 * @throws {RangeError} If `a` and `b` have different lengths, or if any element is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
export function vectorAddFloatIterative(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument "a" must be an Array')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument "b" must be an Array')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Vector lengths must match (received ${a.length} and ${b.length})`
		)
	}

	const len = a.length
	const result = new Array(len)

	for (let i = 0; i < len; i++) {
		if (!(i in a) || typeof a[i] !== 'number') {
			throw new TypeError(`Element a[${i}] must be a number`)
		}
		if (!(i in b) || typeof b[i] !== 'number') {
			throw new TypeError(`Element b[${i}] must be a number`)
		}
		const av = a[i]
		const bv = b[i]
		if (!Number.isFinite(av)) {
			throw new RangeError(`Element a[${i}] must be a finite float64 number`)
		}
		if (!Number.isFinite(bv)) {
			throw new RangeError(`Element b[${i}] must be a finite float64 number`)
		}
		result[i] = av + bv
	}

	return result
}
