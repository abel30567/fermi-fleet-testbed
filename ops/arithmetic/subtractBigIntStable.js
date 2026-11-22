/**
 * Computes the exact difference `a - b` over arbitrary-precision `BigInt` values.
 *
 * Unlike IEEE-754 floating-point subtraction, which suffers from rounding error
 * and catastrophic cancellation when subtracting nearly equal values of large
 * magnitude, this function operates strictly on exact `BigInt` operands (including
 * fixed-point `BigInt` values scaled by `10^18`). It rejects non-`BigInt` inputs
 * rather than coercing values that may have already lost precision, short-circuits
 * exact cancellation (`a === b -> 0n`) and zero identities, and preserves full
 * arbitrary-precision exactness with a zero error bound.
 *
 * @param {bigint} a - The minuend (must be a primitive `bigint`).
 * @param {bigint} b - The subtrahend (must be a primitive `bigint`).
 * @returns {bigint} The exact difference `a - b`.
 * @throws {TypeError} If `a` or `b` is not a primitive `bigint`.
 */
export function subtractBigIntStable(a, b) {
	if (typeof a !== 'bigint') {
		throw new TypeError(
			`subtractBigIntStable: expected argument "a" to be a bigint, received ${a === null ? 'null' : typeof a}`
		)
	}
	if (typeof b !== 'bigint') {
		throw new TypeError(
			`subtractBigIntStable: expected argument "b" to be a bigint, received ${b === null ? 'null' : typeof b}`
		)
	}

	// Exact cancellation fast path avoids intermediate allocation for huge equal operands.
	if (a === b) {
		return 0n
	}
	if (b === 0n) {
		return a
	}
	if (a === 0n) {
		return -b
	}

	return a - b
}
