const SCALE = 10n ** 18n

/**
 * Computes the fixed-point n-th root of a BigInt using straightforward
 * iterative Newton-Raphson approximation, scaled by 10^18.
 *
 * For non-negative `x`, returns the exact integer floor `r >= 0n` satisfying:
 *   `r ** n <= x * (10n ** (18n * n)) < (r + 1n) ** n`
 *
 * For negative `x` with odd `n`, returns `-r` where `r` satisfies the same
 * inequality for `|x|`. Even roots of negative integers are rejected.
 *
 * @param {bigint} x - Radicand (exact BigInt integer).
 * @param {bigint} n - Root degree (exact BigInt integer, must be >= 1n).
 * @returns {bigint} Fixed-point n-th root of `x` scaled by `10n ** 18n`
 *   (truncated toward zero).
 * @throws {TypeError} If `x` or `n` is not a `bigint`.
 * @throws {RangeError} If `n < 1n`, or if `x < 0n` and `n` is even.
 *
 * @example
 * nthRootBigIntIterative(2n, 2n)   // 1414213562373095048n
 * nthRootBigIntIterative(27n, 3n)  // 3000000000000000000n
 * nthRootBigIntIterative(-8n, 3n)  // -2000000000000000000n
 */
export function nthRootBigIntIterative(x, n) {
	if (typeof x !== 'bigint') {
		throw new TypeError(`Expected radicand x to be a bigint, got ${typeof x}`)
	}
	if (typeof n !== 'bigint') {
		throw new TypeError(`Expected root degree n to be a bigint, got ${typeof n}`)
	}
	if (n < 1n) {
		throw new RangeError(`Expected root degree n to be >= 1n, got ${n}n`)
	}
	if (x < 0n && n % 2n === 0n) {
		throw new RangeError(`Cannot compute even root (n=${n}n) of negative bigint (${x}n)`)
	}

	if (x === 0n) {
		return 0n
	}
	if (n === 1n) {
		return x * SCALE
	}

	const isNegative = x < 0n
	const absX = isNegative ? -x : x

	if (absX === 1n) {
		return isNegative ? -SCALE : SCALE
	}

	const target = absX * (SCALE ** n)
	const nMinus1 = n - 1n

	// Initial upper bound: 2^ceil(bitLength(target) / n) >= target^(1/n)
	const bitLength = BigInt(target.toString(2).length)
	let guess = 1n << ((bitLength + nMinus1) / n)

	// Iterative Newton-Raphson:
	//   next = floor(((n - 1) * guess + floor(target / guess^(n - 1))) / n)
	// Starting at or above floor(target^(1/n)), values strictly decrease until
	// reaching the exact integer floor root, where next >= guess.
	while (true) {
		const next = (nMinus1 * guess + target / (guess ** nMinus1)) / n
		if (next >= guess) {
			break
		}
		guess = next
	}

	return isNegative ? -guess : guess
}
