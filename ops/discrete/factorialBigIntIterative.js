/**
 * Computes the exact factorial `n!` of a non-negative BigInt integer
 * using a straightforward iterative loop.
 *
 * By definition, `0! = 1n`, `1! = 1n`, and `n! = 1n * 2n * ... * n` for `n >= 2n`.
 *
 * @param {bigint} n - Non-negative BigInt integer whose factorial is computed.
 * @returns {bigint} The exact BigInt value of `n!`.
 * @throws {TypeError} If `n` is not a `bigint`.
 * @throws {RangeError} If `n` is negative (`n < 0n`).
 */
export function factorialBigIntIterative(n) {
	if (typeof n !== 'bigint') {
		throw new TypeError(`Expected a BigInt argument, received ${typeof n}`)
	}
	if (n < 0n) {
		throw new RangeError(`Expected a non-negative BigInt, received ${n}n`)
	}

	let result = 1n
	for (let i = 2n; i <= n; i++) {
		result *= i
	}
	return result
}
