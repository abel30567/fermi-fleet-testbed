/**
 * Computes the exact mathematical Euclidean modulo `a mod m` over BigInt integers,
 * returning the canonical non-negative residue `r` in `[0n, |m| - 1n]` satisfying
 * the Euclidean division identity `a = q * m + r` with `0n <= r < |m|`.
 *
 * Uses the exact closed-form identity:
 *   `a mod m = ((a % m) + |m|) % |m|`
 *
 * @param {bigint} a - The dividend (must be a BigInt).
 * @param {bigint} m - The non-zero modulus (must be a non-zero BigInt).
 * @returns {bigint} The canonical non-negative residue in `[0n, |m| - 1n]`.
 * @throws {TypeError} If `a` or `m` is not a BigInt.
 * @throws {RangeError} If `m` is `0n`.
 */
export function moduloBigIntSeries(a, m) {
	if (typeof a !== 'bigint') {
		throw new TypeError(`Expected dividend 'a' to be a bigint, received ${typeof a}`)
	}
	if (typeof m !== 'bigint') {
		throw new TypeError(`Expected modulus 'm' to be a bigint, received ${typeof m}`)
	}
	if (m === 0n) {
		throw new RangeError("Modulus 'm' must not be 0n")
	}

	const absM = m < 0n ? -m : m
	return ((a % m) + absM) % absM
}
