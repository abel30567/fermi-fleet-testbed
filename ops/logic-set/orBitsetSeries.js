const BLOCK_BITS = 30n;
const BLOCK_RADIX = 2n ** BLOCK_BITS;

/**
 * Validates that a value is a non-negative primitive BigInt bitset.
 *
 * @param {unknown} value - Candidate bitset operand.
 * @param {string} name - Parameter name for error reporting.
 * @throws {TypeError} If the value is not a BigInt.
 * @throws {RangeError} If the value is negative.
 */
function assertBitset(value, name) {
	if (typeof value !== 'bigint') {
		throw new TypeError(`Expected "${name}" to be a BigInt bitset, received ${typeof value}`);
	}
	if (value < 0n) {
		throw new RangeError(`Expected "${name}" to be a non-negative BigInt bitset`);
	}
}

/**
 * Computes the bitwise OR (set union) of two arbitrary-width non-negative BigInt
 * bitsets using the bit-plane inclusion-exclusion power-of-2 series.
 *
 * Algorithm:
 * Every non-negative integer bitset has a unique binary expansion
 *   a = sum_{k >= 0} a_k * 2^k,  b = sum_{k >= 0} b_k * 2^k,  a_k, b_k in {0, 1}.
 * On each bit plane k, the indicator for set union obeys inclusion-exclusion:
 *   c_k = a_k + b_k - a_k * b_k in {0, 1},
 * yielding the exact power-of-2 series:
 *   OR(a, b) = sum_{k >= 0} (a_k + b_k - a_k * b_k) * 2^k
 *            = a + b - (a & b).
 *
 * To support arbitrarily wide bitsets efficiently without bitwise operators,
 * the series is grouped into 30-bit radix blocks (k = 30*m + j, 0 <= j < 30),
 * evaluating the exact 30-term inclusion-exclusion sum in safe integers per
 * block and adding any remaining tail directly once one operand reaches 0.
 *
 * @param {bigint} a - First non-negative BigInt bitset.
 * @param {bigint} b - Second non-negative BigInt bitset.
 * @returns {bigint} Non-negative BigInt bitset representing the bitwise OR (union) of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not a primitive BigInt.
 * @throws {RangeError} If `a` or `b` is negative.
 */
export function orBitsetSeries(a, b) {
	assertBitset(a, 'a');
	assertBitset(b, 'b');

	let result = 0n;
	let remA = a;
	let remB = b;
	let blockWeight = 1n;

	while (remA > 0n && remB > 0n) {
		const modA = remA % BLOCK_RADIX;
		const modB = remB % BLOCK_RADIX;
		let chunkA = Number(modA);
		let chunkB = Number(modB);

		// Evaluate sum_{j=0}^{29} (a_j + b_j - a_j * b_j) * 2^j within the block.
		let chunkOr = 0;
		let bitWeight = 1;
		while (chunkA > 0 || chunkB > 0) {
			const bitA = chunkA % 2;
			const bitB = chunkB % 2;
			const bitOr = bitA + bitB - bitA * bitB;
			if (bitOr !== 0) {
				chunkOr += bitWeight;
			}
			chunkA = (chunkA - bitA) / 2;
			chunkB = (chunkB - bitB) / 2;
			bitWeight *= 2;
		}

		if (chunkOr !== 0) {
			result += BigInt(chunkOr) * blockWeight;
		}

		remA = (remA - modA) / BLOCK_RADIX;
		remB = (remB - modB) / BLOCK_RADIX;
		blockWeight *= BLOCK_RADIX;
	}

	// Tail of the series where the other operand's remaining bit planes are all 0:
	// sum_{k >= 30*m} r_k * 2^k = rem * (2^30)^m.
	if (remA > 0n) {
		result += remA * blockWeight;
	} else if (remB > 0n) {
		result += remB * blockWeight;
	}

	return result;
}
