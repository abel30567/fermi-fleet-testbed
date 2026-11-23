const SCALE_SQUARED = 10n ** 36n

/**
 * Compute the exact bit-length of a positive BigInt.
 *
 * @param {bigint} n - A positive BigInt (`n >= 1n`).
 * @returns {number} Number of bits required to represent `n`.
 */
function bitLength(n) {
	const hex = n.toString(16)
	const topNibble = parseInt(hex[0], 16)
	const topBits = topNibble >= 8 ? 4 : topNibble >= 4 ? 3 : topNibble >= 2 ? 2 : 1
	return (hex.length - 1) * 4 + topBits
}

/**
 * Compute `[s, r]` such that `m === s * s + r` and `0n <= r <= 2n * s`
 * using Zimmermann's recursive divide-and-conquer Karatsuba square root algorithm.
 *
 * At each step the input bit-length is halved, giving O(log(bitLength(m)))
 * recursion depth and guaranteed single-step correction.
 *
 * @param {bigint} m - Non-negative BigInt radicand.
 * @returns {[bigint, bigint]} Tuple of `[floor(sqrt(m)), remainder]`.
 */
function sqrtRemRecursive(m) {
	if (m === 0n) {
		return [0n, 0n]
	}
	if (m < 4n) {
		return [1n, m - 1n]
	}

	const bits = bitLength(m)
	const quarterBits = BigInt(Math.floor((bits + 1) / 4))
	const mask = (1n << quarterBits) - 1n

	const mHi = m >> (quarterBits * 2n)
	const a1 = (m >> quarterBits) & mask
	const a0 = m & mask

	const [sPrime, rPrime] = sqrtRemRecursive(mHi)

	const num = (rPrime << quarterBits) + a1
	const denom = sPrime << 1n
	const q = num / denom
	const u = num % denom

	let s = (sPrime << quarterBits) + q
	let r = (u << quarterBits) + a0 - q * q

	if (r < 0n) {
		r += (s << 1n) - 1n
		s -= 1n
	}

	return [s, r]
}

/**
 * Compute the square root of a non-negative BigInt integer using a recursive
 * divide-and-conquer (Karatsuba square root) algorithm, returning a fixed-point
 * BigInt scaled by `10^18` (truncated toward zero, i.e., `floor(sqrt(n) * 10^18)`).
 *
 * For example:
 * - `sqrtBigIntRecursive(0n)` -> `0n`
 * - `sqrtBigIntRecursive(4n)` -> `2_000_000_000_000_000_000n` (`2.0 * 10^18`)
 * - `sqrtBigIntRecursive(2n)` -> `1_414_213_562_373_095_048n` (`1.414213562373095048 * 10^18`)
 *
 * @param {bigint} n - Non-negative BigInt integer whose square root is computed.
 * @returns {bigint} Fixed-point BigInt equal to `floor(sqrt(n) * 10^18)`.
 * @throws {TypeError} If `n` is not a `bigint`.
 * @throws {RangeError} If `n` is negative (`n < 0n`).
 */
export function sqrtBigIntRecursive(n) {
	if (typeof n !== 'bigint') {
		throw new TypeError(`Expected a BigInt argument, received ${typeof n}`)
	}
	if (n < 0n) {
		throw new RangeError('Square root of a negative BigInt is not defined')
	}
	if (n === 0n) {
		return 0n
	}

	const [root] = sqrtRemRecursive(n * SCALE_SQUARED)
	return root
}
