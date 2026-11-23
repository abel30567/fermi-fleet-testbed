const SCALE = 10n ** 18n
const SCALE_SQ = SCALE * SCALE

/**
 * Computes the exact integer square root floor(sqrt(n)) for a non-negative BigInt
 * using iterative Newton-Raphson (Heron's method).
 *
 * @param {bigint} n - Non-negative BigInt radicand.
 * @returns {bigint} Largest BigInt r such that r * r <= n.
 */
function isqrtBigInt(n) {
	if (n === 0n) return 0n

	const bitLength = n.toString(2).length
	let x = 1n << (BigInt(bitLength + 1) >> 1n)

	while (true) {
		const next = (x + n / x) >> 1n
		if (next >= x) return x
		x = next
	}
}

/**
 * Computes the Euclidean magnitude (L2 norm) of a vector of exact BigInt integers,
 * returned as a fixed-point BigInt scaled by 10^18 (truncated toward zero):
 * `floor(sqrt(sum(v[i]^2)) * 10^18)`.
 *
 * Uses a straightforward iterative accumulation of squared components followed by
 * an iterative Newton-Raphson integer square root.
 *
 * @param {readonly bigint[]} vector - Array of exact BigInt vector components.
 * @returns {bigint} Fixed-point Euclidean magnitude scaled by 10^18.
 * @throws {TypeError} If `vector` is not an Array or contains any non-BigInt element.
 */
export function magnitudeBigIntIterative(vector) {
	if (!Array.isArray(vector)) {
		throw new TypeError(`Expected vector to be an Array, got ${typeof vector}`)
	}

	let sumOfSquares = 0n
	for (let i = 0; i < vector.length; i++) {
		const component = vector[i]
		if (typeof component !== 'bigint') {
			throw new TypeError(
				`Expected bigint component at index ${i}, got ${typeof component}`,
			)
		}
		sumOfSquares += component * component
	}

	if (sumOfSquares === 0n) return 0n

	return isqrtBigInt(sumOfSquares * SCALE_SQ)
}
