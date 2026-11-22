/**
 * Computes the factorial n! of a non-negative BigInt integer using a
 * straightforward iterative loop.
 *
 * Scaling / fixed-point semantics:
 * For every non-negative integer n, n! is an exact integer (0! = 1, n! = 1 * 2 * ... * n).
 * Accordingly, this function returns an exact unscaled BigInt integer (no 10^18
 * fixed-point scaling is needed because results are always exact integers).
 *
 * @param {bigint} n - Non-negative BigInt integer whose factorial is to be computed.
 * @returns {bigint} Exact BigInt value of n!.
 * @throws {TypeError} If `n` is not a BigInt.
 * @throws {RangeError} If `n` is negative (`n < 0n`).
 */
export function factorialBigIntIterative(n) {
	if (typeof n !== 'bigint') {
		throw new TypeError(`Expected n to be a BigInt, received ${typeof n}`)
	}
	if (n < 0n) {
		throw new RangeError(`Expected n to be a non-negative BigInt, received ${n}`)
	}

	let result = 1n
	for (let i = 2n; i <= n; i += 1n) {
		result *= i
	}
	return result
}
