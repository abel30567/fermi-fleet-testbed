const SCALE = 10n ** 18n
const SCALE_SQ = SCALE * SCALE

/**
 * Computes the exact integer floor square root of a non-negative BigInt
 * using iterative Newton-Raphson (Heron's method).
 *
 * Satisfies `r * r <= n < (r + 1n) * (r + 1n)` for all `n >= 0n`.
 *
 * @param {bigint} n - Non-negative BigInt radicand.
 * @returns {bigint} Exact floor of `sqrt(n)`.
 */
function isqrtIterative(n) {
	if (n === 0n) {
		return 0n
	}

	const bitLength = n.toString(2).length
	let x = 1n << (BigInt(bitLength + 1) >> 1n)
	let next = (x + n / x) >> 1n

	while (next < x) {
		x = next
		next = (x + n / x) >> 1n
	}

	return x
}

/**
 * Computes the Euclidean magnitude (L2 norm) of a vector of exact BigInt
 * components using a straightforward iterative implementation.
 *
 * The result is returned as a fixed-point BigInt scaled by `10n ** 18n`,
 * truncated toward zero (i.e., `floor(sqrt(sum(v_i^2)) * 10^18)`).
 * Specifically, it iteratively accumulates `sumSq = sum(v_i * v_i)` and
 * computes `isqrt(sumSq * 10n ** 36n)` via iterative Newton-Raphson.
 *
 * For an empty vector `[]` or a zero vector, returns `0n`.
 *
 * @param {readonly bigint[]} vector - Array of BigInt vector components.
 * @returns {bigint} Fixed-point Euclidean norm scaled by `10n ** 18n`.
 * @throws {TypeError} If `vector` is not an Array or any element is not a BigInt.
 *
 * @example
 * magnitudeBigIntIterative([3n, 4n])
 * // => 5000000000000000000n (5 * 10^18)
 *
 * @example
 * magnitudeBigIntIterative([1n, 1n])
 * // => 1414213562373095048n (floor(sqrt(2) * 10^18))
 */
export function magnitudeBigIntIterative(vector) {
	if (!Array.isArray(vector)) {
		throw new TypeError(
			`Expected vector to be an Array of BigInts, got ${vector === null ? 'null' : typeof vector}`
		)
	}

	let sumSq = 0n
	for (let i = 0; i < vector.length; i++) {
		const value = vector[i]
		if (typeof value !== 'bigint') {
			throw new TypeError(
				`Expected vector[${i}] to be a bigint, got ${value === null ? 'null' : typeof value}`
			)
		}
		sumSq += value * value
	}

	if (sumSq === 0n) {
		return 0n
	}

	return isqrtIterative(sumSq * SCALE_SQ)
}
