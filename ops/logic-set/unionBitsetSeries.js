/**
 * Validate that a value is a non-negative BigInt representing a finite bitset.
 *
 * @param {unknown} value - Candidate bitset value.
 * @param {number} index - Zero-based argument position for diagnostics.
 * @returns {bigint} The validated non-negative BigInt bitset.
 * @throws {TypeError} If `value` is not a `bigint`.
 * @throws {RangeError} If `value` is negative.
 */
function assertBitset(value, index) {
	if (typeof value !== 'bigint') {
		throw new TypeError(
			`unionBitsetSeries: argument at index ${index} must be a non-negative BigInt, received ${value === null ? 'null' : typeof value}`
		)
	}
	if (value < 0n) {
		throw new RangeError(
			`unionBitsetSeries: argument at index ${index} must be a non-negative BigInt (>= 0n), received ${value}n`
		)
	}
	return value
}

/**
 * Compute the binary set union of two non-negative BigInt bitsets using the
 * closed-form inclusion-exclusion power-series identity:
 *
 *   A ∪ B = Σ_{k ≥ 0} (a_k + b_k - a_k·b_k)·2^k
 *         = A + B - (A ∩ B)
 *
 * Since (A ⊕ B) and (A & B) have disjoint 1-bits, A + B = (A ⊕ B) + 2(A & B),
 * hence A + B - (A & B) = (A ⊕ B) + (A & B) = A | B with no carry interference
 * for arbitrary non-negative bitset widths.
 *
 * @param {bigint} a - First validated non-negative BigInt bitset.
 * @param {bigint} b - Second validated non-negative BigInt bitset.
 * @returns {bigint} The union bitset A ∪ B.
 */
function binaryUnionSeries(a, b) {
	return a + b - (a & b)
}

/**
 * Compute the set union over one or more arbitrary-width non-negative BigInt
 * bitsets using the closed-form inclusion-exclusion series identity
 * `A ∪ B = A + B - (A & B)`, folded associatively across all inputs.
 *
 * Each bit at index `k >= 0` (value `1n << BigInt(k)`) represents membership of
 * element `k` in the set. Negative BigInts are rejected because two's-complement
 * negative integers represent co-finite (infinite) bitsets.
 *
 * @param {bigint} first - First non-negative BigInt bitset.
 * @param {...bigint} rest - Additional non-negative BigInt bitsets to union.
 * @returns {bigint} The resulting non-negative BigInt bitset representing the union.
 * @throws {TypeError} If no arguments are provided or any argument is not a BigInt.
 * @throws {RangeError} If any argument is a negative BigInt.
 *
 * @example
 * unionBitsetSeries(0b1010n, 0b1100n) // => 0b1110n
 * unionBitsetSeries(1n << 200n, 1n << 500n) // => (1n << 200n) + (1n << 500n)
 */
export function unionBitsetSeries(first, ...rest) {
	if (arguments.length === 0) {
		throw new TypeError('unionBitsetSeries: expected at least one BigInt bitset argument')
	}

	let acc = assertBitset(first, 0)
	for (let i = 0; i < rest.length; i += 1) {
		const next = assertBitset(rest[i], i + 1)
		acc = binaryUnionSeries(acc, next)
	}
	return acc
}
