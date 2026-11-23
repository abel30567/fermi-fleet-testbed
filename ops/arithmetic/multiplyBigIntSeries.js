/**
 * Multiplies two exact BigInt integers using the closed-form quarter-square
 * (polarization) algebraic identity:
 *
 *   a * b = ((a + b)^2 - (a - b)^2) / 4
 *
 * Because (a + b)^2 - (a - b)^2 = 4ab is always an exact multiple of 4,
 * dividing by 4 via an arithmetic right shift by 2 bits yields the exact
 * BigInt product for all signed integers without using the `*` operator.
 *
 * @param {bigint} a - The first BigInt factor.
 * @param {bigint} b - The second BigInt factor.
 * @returns {bigint} The exact BigInt product of `a` and `b`.
 * @throws {TypeError} If either `a` or `b` is not a BigInt.
 */
export function multiplyBigIntSeries(a, b) {
	if (typeof a !== 'bigint') {
		throw new TypeError(`Expected first argument "a" to be a bigint, got ${typeof a}`)
	}
	if (typeof b !== 'bigint') {
		throw new TypeError(`Expected second argument "b" to be a bigint, got ${typeof b}`)
	}

	if (a === 0n || b === 0n) {
		return 0n
	}

	const sum = a + b
	const diff = a - b
	return (sum ** 2n - diff ** 2n) >> 2n
}
