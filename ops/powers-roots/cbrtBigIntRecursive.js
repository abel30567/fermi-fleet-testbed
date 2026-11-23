/**
 * Fixed-point scale factor (10^18) for representing non-integer cube root results.
 * @type {bigint}
 */
const SCALE = 10n ** 18n

/**
 * Cube of the fixed-point scale factor (10^54), since cbrt(n) * 10^18 = cbrt(n * 10^54).
 * @type {bigint}
 */
const SCALE_CUBED = SCALE ** 3n

/**
 * Computes the exact bit length of a strictly positive BigInt.
 *
 * @param {bigint} n - Positive BigInt (`n > 0n`).
 * @returns {number} Number of bits required to represent `n`.
 */
function bitLength(n) {
	const hex = n.toString(16)
	const firstNibble = parseInt(hex[0], 16)
	const leadingBits = 32 - Math.clz32(firstNibble)
	return (hex.length - 1) * 4 + leadingBits
}

/**
 * Computes the exact integer floor cube root `floor(m^(1/3))` of a non-negative BigInt
 * using a Zimmermann-style recursive divide-and-conquer algorithm.
 *
 * At each recursion level for `m >= 64n` with `L = bitLength(m)`, we choose
 * `k = floor((L - 1) / 6) >= 1` and recursively solve the subproblem on the upper
 * `L - 3k` bits (`m >> (3k)`), roughly halving the bit length at every step
 * (`O(log L)` recursion depth). Lifting the recursive root by `k` bits gives an
 * underestimate `a = rHi << k` within `2^k` of the true root with `a >= 2^(2k)`.
 * One Newton-Raphson refinement step `a + floor((m - a^3) / (3 * a^2))` then lands
 * in `[floor(m^(1/3)), floor(m^(1/3)) + 2]`, requiring at most two unit decrements
 * to obtain the exact floor integer cube root.
 *
 * @param {bigint} m - Non-negative BigInt (`m >= 0n`).
 * @returns {bigint} Exact integer `r >= 0n` such that `r^3 <= m < (r + 1)^3`.
 */
function icbrtRecursive(m) {
	if (m === 0n) return 0n
	if (m < 8n) return 1n
	if (m < 27n) return 2n
	if (m < 64n) return 3n

	const bits = bitLength(m)
	const k = BigInt(Math.floor((bits - 1) / 6))
	const rHi = icbrtRecursive(m >> (3n * k))

	const a = rHi << k
	const a2 = a * a
	const a3 = a2 * a
	let r = a + (m - a3) / (3n * a2)

	while (r * r * r > m) {
		r -= 1n
	}

	return r
}

/**
 * Computes the cube root of an exact BigInt integer, returning a fixed-point BigInt
 * scaled by `10^18`, using a recursive divide-and-conquer algorithm.
 *
 * Results are truncated toward zero, preserving exact odd symmetry
 * (`cbrtBigIntRecursive(-n) === -cbrtBigIntRecursive(n)`) and satisfying
 * `|r|^3 <= |n| * 10^54 < (|r| + 1)^3` for every valid input `n`.
 * For perfect cubes `k^3`, the result is exact: `k * 10^18`.
 *
 * @param {bigint} n - Exact BigInt integer (positive, zero, or negative).
 * @returns {bigint} Fixed-point cube root of `n` scaled by `10^18`.
 * @throws {TypeError} If `n` is not a `bigint`.
 *
 * @example
 * cbrtBigIntRecursive(8n)   // 2000000000000000000n  (2.0 * 10^18)
 * cbrtBigIntRecursive(-27n) // -3000000000000000000n (-3.0 * 10^18)
 * cbrtBigIntRecursive(2n)   // 1259921049894873164n  (floor(cbrt(2) * 10^18))
 */
export function cbrtBigIntRecursive(n) {
	if (typeof n !== 'bigint') {
		const received = n === null ? 'null' : typeof n
		throw new TypeError(
			`cbrtBigIntRecursive expects a BigInt argument, received ${received}`
		)
	}

	if (n === 0n) return 0n

	const negative = n < 0n
	const absN = negative ? -n : n
	const root = icbrtRecursive(absN * SCALE_CUBED)
	return negative ? -root : root
}
