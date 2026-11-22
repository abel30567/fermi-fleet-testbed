/**
 * Computes the exact Euclidean (non-negative) modulo `a mod m` over BigInt
 * integers using an iterative binary long-division (shift-subtract) algorithm.
 *
 * Returns the unique integer remainder `r` satisfying:
 *   - `0n <= r < m`
 *   - `a === q * m + r` for the exact integer quotient `q = floor(a / m)`
 *
 * Scaling / fixed-point semantics:
 *   Discrete integer modulo always yields an exact integer in `[0n, m - 1n]`,
 *   so inputs and outputs are exact unscaled `bigint` values (no `10n ** 18n`
 *   fixed-point scaling is applied).
 *
 * Complexity:
 *   Runs in `O(log(|a| / m))` iterations (at most `2 * floor(log2(|a| / m)) + 1`
 *   shift-subtract steps), handling arbitrarily large BigInts without recursion
 *   or linear repeated subtraction.
 *
 * @param {bigint} a - The dividend (any BigInt integer: negative, zero, or positive).
 * @param {bigint} m - The modulus / divisor (must be a strictly positive BigInt, `m > 0n`).
 * @returns {bigint} The canonical Euclidean remainder `r` in `[0n, m - 1n]`.
 * @throws {TypeError} If `a` or `m` is not a `bigint`.
 * @throws {RangeError} If `m === 0n` (division by zero) or `m < 0n` (non-positive modulus).
 */
export function moduloBigIntIterative(a, m) {
	if (typeof a !== 'bigint') {
		throw new TypeError(`Expected dividend "a" to be a bigint, got ${typeof a}.`)
	}
	if (typeof m !== 'bigint') {
		throw new TypeError(`Expected modulus "m" to be a bigint, got ${typeof m}.`)
	}
	if (m === 0n) {
		throw new RangeError('Modulus "m" cannot be zero (division by zero).')
	}
	if (m < 0n) {
		throw new RangeError('Modulus "m" must be strictly positive (> 0n).')
	}

	const isNegative = a < 0n
	let remainder = isNegative ? -a : a

	if (remainder >= m) {
		// Align the divisor to the highest power-of-two multiple <= remainder.
		let shifted = m
		let next = shifted << 1n
		while (next <= remainder) {
			shifted = next
			next = shifted << 1n
		}

		// Iterative binary long-division (shift-subtract).
		while (shifted >= m) {
			if (remainder >= shifted) {
				remainder -= shifted
			}
			shifted >>= 1n
		}
	}

	// Adjust negative dividends to canonical Euclidean non-negative remainder in [0n, m - 1n].
	if (isNegative && remainder !== 0n) {
		remainder = m - remainder
	}

	return remainder
}
