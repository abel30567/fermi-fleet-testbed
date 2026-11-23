/**
 * Computes the mathematical Euclidean modulo of two exact BigInt integers
 * using a straightforward iterative binary long division (shift-subtract)
 * algorithm.
 *
 * For any integers `a` and `m` (`m !== 0n`), returns the unique remainder `r`
 * satisfying:
 *   `a = q * m + r`  with  `0n <= r < |m|`
 *
 * Unlike JavaScript's built-in `%` operator (which computes truncated division
 * remainder matching the sign of `a`), Euclidean modulo always returns a
 * non-negative BigInt in `[0n, |m|)`.
 *
 * @param {bigint} a - The dividend (exact BigInt integer).
 * @param {bigint} m - The modulus / divisor (non-zero exact BigInt integer).
 * @returns {bigint} The non-negative Euclidean remainder in `[0n, |m|)`.
 * @throws {TypeError} If `a` or `m` is not a `bigint`.
 * @throws {RangeError} If `m` is `0n`.
 */
export function moduloBigIntIterative(a, m) {
	if (typeof a !== 'bigint') {
		throw new TypeError(`Expected dividend 'a' to be a bigint, got ${typeof a}`)
	}
	if (typeof m !== 'bigint') {
		throw new TypeError(`Expected modulus 'm' to be a bigint, got ${typeof m}`)
	}
	if (m === 0n) {
		throw new RangeError("Modulus 'm' must not be zero (0n)")
	}

	const absM = m < 0n ? -m : m
	if (a === 0n || absM === 1n) {
		return 0n
	}

	let rem = a < 0n ? -a : a

	if (rem >= absM) {
		// Iteratively shift absM left to find the largest power-of-two multiple <= rem.
		let shifted = absM
		while ((shifted << 1n) <= rem) {
			shifted <<= 1n
		}

		// Iteratively subtract shifted multiples from most-significant to least-significant.
		while (shifted >= absM && rem >= absM) {
			if (rem >= shifted) {
				rem -= shifted
			}
			shifted >>= 1n
		}
	}

	// Adjust unsigned remainder to Euclidean remainder in [0n, |m|) for negative dividends.
	if (a < 0n && rem !== 0n) {
		return absM - rem
	}

	return rem
}
