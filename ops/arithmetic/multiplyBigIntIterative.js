/**
 * Multiplies two exact BigInt integers using a straightforward iterative
 * shift-and-add (Russian peasant / binary multiplication) algorithm.
 *
 * Runs in O(log(min(|a|, |b|))) loop iterations using only BigInt addition,
 * bit-shifting, and bitwise operations.
 *
 * @param {bigint} a - The multiplicand (must be a BigInt).
 * @param {bigint} b - The multiplier (must be a BigInt).
 * @returns {bigint} The exact product `a * b`.
 * @throws {TypeError} If either `a` or `b` is not a BigInt.
 */
export function multiplyBigIntIterative(a, b) {
	if (typeof a !== 'bigint' || typeof b !== 'bigint') {
		throw new TypeError('Both arguments must be BigInt values')
	}

	if (a === 0n || b === 0n) {
		return 0n
	}

	const isNegative = (a < 0n) !== (b < 0n)
	let multiplicand = a < 0n ? -a : a
	let multiplier = b < 0n ? -b : b

	// Iterate over the smaller operand to minimize loop iterations.
	if (multiplicand < multiplier) {
		const tmp = multiplicand
		multiplicand = multiplier
		multiplier = tmp
	}

	let product = 0n
	while (multiplier > 0n) {
		if ((multiplier & 1n) === 1n) {
			product += multiplicand
		}
		multiplicand <<= 1n
		multiplier >>= 1n
	}

	return isNegative ? -product : product
}
