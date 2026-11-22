/**
 * Computes the element-wise Euclidean (non-negative) modulo of two equal-length
 * Float64Array inputs using a straightforward iterative loop.
 *
 * For each index `i`, computes `r = dividends[i] mod divisors[i]` satisfying the
 * Euclidean division identity:
 *
 *   a = b * q + r,   with   0 <= r < |b|
 *
 * where `q = b > 0 ? Math.floor(a / b) : Math.ceil(a / b)`.
 *
 * Algorithm:
 * For each element `(a, b)`, takes `absB = Math.abs(b)`, computes the IEEE 754
 * truncated remainder `r = a % absB`, adds `absB` when `r < 0`, and normalizes
 * `-0` and floating-point boundary rounding (`r >= absB`) to `+0`. Unlike the
 * naive `((a % b) + b) % b` form, avoiding the unconditional addition preserves
 * full significand precision for small positive remainders and yields a
 * non-negative remainder even when `b < 0`.
 *
 * @param {Float64Array} dividends - Element-wise dividends (finite numbers).
 * @param {Float64Array} divisors - Element-wise divisors (finite, non-zero numbers).
 * @returns {Float64Array} A new Float64Array containing the element-wise Euclidean
 *   remainders in `[0, |divisors[i]|)`.
 * @throws {TypeError} If `dividends` or `divisors` is not a `Float64Array`.
 * @throws {RangeError} If `dividends` and `divisors` differ in length, if any
 *   element is `NaN` or non-finite (`±Infinity`), or if any divisor is `0` (`±0`).
 */
export function moduloTypedIterative(dividends, divisors) {
	if (!(dividends instanceof Float64Array)) {
		throw new TypeError('dividends must be a Float64Array')
	}
	if (!(divisors instanceof Float64Array)) {
		throw new TypeError('divisors must be a Float64Array')
	}

	const length = dividends.length
	if (length !== divisors.length) {
		throw new RangeError(
			`Length mismatch: dividends has length ${length}, divisors has length ${divisors.length}`,
		)
	}

	const result = new Float64Array(length)

	for (let i = 0; i < length; i++) {
		const a = dividends[i]
		const b = divisors[i]

		if (!Number.isFinite(a)) {
			throw new RangeError(`dividends[${i}] must be a finite number, got ${a}`)
		}
		if (!Number.isFinite(b)) {
			throw new RangeError(`divisors[${i}] must be a finite number, got ${b}`)
		}
		if (b === 0) {
			throw new RangeError(`divisors[${i}] must be non-zero (division by zero)`)
		}

		const absB = Math.abs(b)
		let rem = a % absB
		if (rem < 0) {
			rem += absB
		}
		if (rem === 0 || rem >= absB) {
			rem = 0
		}

		result[i] = rem
	}

	return result
}
