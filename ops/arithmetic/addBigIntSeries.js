/**
 * Exact BigInt addition implemented via bitwise carry/borrow-propagation
 * series identities:
 *
 * - Non-negative sum identity:
 *     x + y = (x ^ y) + 2 * (x & y)
 *   Iterating (s, c) -> (s ^ c, (s & c) << 1n) converges to x + y once c === 0n.
 *
 * - Non-negative difference identity (for x >= y >= 0n):
 *     x - y = (x ^ y) - 2 * ((~x) & y)
 *   Iterating (d, b) -> (d ^ b, ((~d) & b) << 1n) converges to x - y once b === 0n.
 *
 * Signed inputs are reduced to these exact non-negative identities via
 * sign-magnitude decomposition, guaranteeing termination for all arbitrary-precision
 * BigInt values (including exact fixed-point values scaled by 10^18).
 *
 * @param {bigint} a - First exact BigInt addend.
 * @param {bigint} b - Second exact BigInt addend.
 * @returns {bigint} Exact sum a + b as a BigInt.
 * @throws {TypeError} If either argument is not a BigInt.
 */
export function addBigIntSeries(a, b) {
	if (typeof a !== 'bigint') {
		throw new TypeError(`Expected first argument "a" to be a bigint, received ${typeof a}`)
	}
	if (typeof b !== 'bigint') {
		throw new TypeError(`Expected second argument "b" to be a bigint, received ${typeof b}`)
	}

	if (a === 0n) return b
	if (b === 0n) return a

	if (a > 0n && b > 0n) {
		return addNonNegative(a, b)
	}
	if (a < 0n && b < 0n) {
		return -addNonNegative(-a, -b)
	}

	if (a > 0n) {
		const absB = -b
		if (a === absB) return 0n
		return a > absB ? subNonNegative(a, absB) : -subNonNegative(absB, a)
	}

	const absA = -a
	if (b === absA) return 0n
	return b > absA ? subNonNegative(b, absA) : -subNonNegative(absA, b)
}

/**
 * Adds two non-negative BigInts using the carry-propagation identity series:
 *   s_{k+1} = s_k ^ c_k,  c_{k+1} = (s_k & c_k) << 1n
 *
 * @param {bigint} x
 * @param {bigint} y
 * @returns {bigint}
 */
function addNonNegative(x, y) {
	let sum = x
	let carry = y
	while (carry !== 0n) {
		const nextCarry = (sum & carry) << 1n
		sum = sum ^ carry
		carry = nextCarry
	}
	return sum
}

/**
 * Subtracts two non-negative BigInts (x >= y >= 0n) using the borrow-propagation
 * identity series:
 *   d_{k+1} = d_k ^ b_k,  b_{k+1} = ((~d_k) & b_k) << 1n
 *
 * @param {bigint} x
 * @param {bigint} y
 * @returns {bigint}
 */
function subNonNegative(x, y) {
	let diff = x
	let borrow = y
	while (borrow !== 0n) {
		const nextBorrow = (~diff & borrow) << 1n
		diff = diff ^ borrow
		borrow = nextBorrow
	}
	return diff
}
