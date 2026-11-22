const SCALE_CUBED = 10n ** 54n

/**
 * Computes the cube root of an exact BigInt using a straightforward iterative
 * Newton-Raphson method, returning a fixed-point BigInt scaled by `10^18`
 * (truncated toward zero).
 *
 * For any input `x`:
 * - If `x === 0n`, returns `0n`.
 * - Otherwise computes `r = floor((|x| * 10^54)^(1/3))` so that
 *   `r^3 <= |x| * 10^54 < (r + 1)^3`, and restores the sign of `x`
 *   (odd-function symmetry: `cbrt(-x) === -cbrt(x)`).
 *
 * The initial Newton-Raphson estimate is `1n << ceil(bitLength(n) / 3)`, which
 * strictly exceeds `n^(1/3)`. Starting above the root guarantees monotonic
 * convergence to `floor(n^(1/3))` without undershooting.
 *
 * @param {bigint} x - The exact BigInt radicand (positive, zero, or negative).
 * @returns {bigint} Fixed-point cube root of `x`, scaled by `10n ** 18n`.
 * @throws {TypeError} If `x` is not a BigInt.
 *
 * @example
 * cbrtBigIntIterative(8n)   // 2000000000000000000n (2.0 * 10^18)
 * cbrtBigIntIterative(-27n) // -3000000000000000000n (-3.0 * 10^18)
 * cbrtBigIntIterative(2n)   // 1259921049894873164n (~1.259921049894873164 * 10^18)
 */
export function cbrtBigIntIterative(x) {
	if (typeof x !== 'bigint') {
		throw new TypeError(`Expected a BigInt argument, received ${x === null ? 'null' : typeof x}`)
	}

	if (x === 0n) {
		return 0n
	}

	const isNegative = x < 0n
	const absX = isNegative ? -x : x
	const scaled = absX * SCALE_CUBED

	const bitLength = BigInt(scaled.toString(2).length)
	let guess = 1n << ((bitLength + 2n) / 3n)

	while (true) {
		const next = (2n * guess + scaled / (guess * guess)) / 3n
		if (next >= guess) {
			break
		}
		guess = next
	}

	return isNegative ? -guess : guess
}
