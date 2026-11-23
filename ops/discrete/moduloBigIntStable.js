/**
 * Computes the exact Euclidean (mathematical non-negative) modulo of two
 * arbitrary-precision `BigInt` integers.
 *
 * For any dividend `a ∈ ℤ` and non-zero modulus `m ∈ ℤ \ {0}`, returns the
 * unique integer remainder `r ∈ ℤ` satisfying the Euclidean division identity:
 *
 *   `a = q * m + r`  with  `0n <= r < |m|`
 *
 * Unlike JavaScript's built-in `%` operator (truncated division, which can
 * yield negative remainders when `a < 0n`), this function always returns a
 * canonical least non-negative residue in `[0n, |m| - 1n]`. Computation is
 * performed entirely in exact `BigInt` arithmetic using a single division and
 * at most one adjustment addition, avoiding floating-point precision loss,
 * overflow, or redundant reductions for arbitrarily large integers.
 *
 * @param {bigint} a - The exact `BigInt` dividend.
 * @param {bigint} m - The exact non-zero `BigInt` modulus (positive or negative).
 * @returns {bigint} The canonical Euclidean remainder `r` such that `0n <= r < |m|`.
 * @throws {TypeError} If `a` or `m` is not a `bigint`.
 * @throws {RangeError} If `m` is `0n`.
 */
export function moduloBigIntStable(a, m) {
	if (typeof a !== 'bigint') {
		throw new TypeError(`Expected dividend "a" to be a bigint, received ${a === null ? 'null' : typeof a}`)
	}
	if (typeof m !== 'bigint') {
		throw new TypeError(`Expected modulus "m" to be a bigint, received ${m === null ? 'null' : typeof m}`)
	}
	if (m === 0n) {
		throw new RangeError('Modulus "m" must be a non-zero bigint')
	}

	const absM = m < 0n ? -m : m
	const remainder = a % absM
	return remainder < 0n ? remainder + absM : remainder
}
