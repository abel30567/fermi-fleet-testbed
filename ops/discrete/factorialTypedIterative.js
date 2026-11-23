/**
 * Computes the discrete factorial (n!) element-wise over a Float64Array
 * using a straightforward iterative implementation.
 *
 * Each element must be a finite non-negative integer (0, 1, 2, ...).
 * Values greater than 170 overflow IEEE 754 double precision and yield Infinity.
 * The input array is not mutated.
 *
 * @param {Float64Array} input - Float64Array of non-negative integer values.
 * @returns {Float64Array} A new Float64Array containing the factorial of each input element.
 * @throws {TypeError} If input is not a Float64Array.
 * @throws {RangeError} If any element is not a finite non-negative integer.
 */
export function factorialTypedIterative(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array')
	}

	const len = input.length
	const output = new Float64Array(len)

	for (let i = 0; i < len; i++) {
		const n = input[i]
		if (!Number.isInteger(n) || n < 0) {
			throw new RangeError(
				`Expected non-negative integer at index ${i}, got ${n}`
			)
		}

		let result = 1
		for (let k = 2; k <= n; k++) {
			result *= k
			if (!Number.isFinite(result)) {
				break
			}
		}
		output[i] = result
	}

	return output
}
