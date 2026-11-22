const SCALE_SQUARED = 10n ** 36n

/**
 * Compute the exact bit length of a positive BigInt.
 *
 * @param {bigint} n - A positive BigInt.
 * @returns {number} Number of bits required to represent `n`.
 */
function bitLength(n) {
	const hex = n.toString(16)
	const leadBits = 32 - Math.clz32(parseInt(hex[0], 16))
	return (hex.length - 1) * 4 + leadBits
}

/**
 * Compute the exact integer square root floor(sqrt(n)) via Heron's / Newton's
 * iterative identity: x_{k+1} = floor((x_k + floor(n / x_k)) / 2).
 *
 * Starting from x_0 = 2^ceil(bitLength(n) / 2) > sqrt(n), the sequence is
 * strictly decreasing until x_{k+1} >= x_k, at which point x_k === floor(sqrt(n)).
 *
 * @param {bigint} n - A non-negative BigInt.
 * @returns {bigint} Exact floor(sqrt(n)).
 */
function isqrtFloor(n) {
	if (n < 2n) return n

	let x = 1n << BigInt((bitLength(n) + 1) >> 1)
	while (true) {
		const next = (x + n / x) >> 1n
		if (next >= x) return x
		x = next
	}
}

/**
 * Compute the Euclidean magnitude (L2 norm) of a vector of exact BigInt
 * integers, returned as a fixed-point BigInt scaled by 10^18.
 *
 * Computes `round(sqrt(sum(v_i^2) * 10^36))` using exact BigInt arithmetic
 * and Heron's (Newton-Raphson) square-root identity with exact rounding to
 * the nearest scaled integer (since `(r + 1/2)^2 = r^2 + r + 1/4` is never an
 * integer, `sqrt(N) > r + 1/2` holds if and only if `N - r^2 > r`).
 *
 * @param {readonly bigint[]} vector - Array of BigInt vector components.
 * @returns {bigint} Fixed-point Euclidean magnitude scaled by 10^18 (`0n` for an empty or zero vector).
 * @throws {TypeError} If `vector` is not an Array or any element is not a BigInt.
 */
export function magnitudeBigIntSeries(vector) {
	if (!Array.isArray(vector)) {
		throw new TypeError('vector must be an Array of BigInt values')
	}

	let sumSquares = 0n
	for (let i = 0; i < vector.length; i++) {
		const component = vector[i]
		if (typeof component !== 'bigint') {
			throw new TypeError(`vector[${i}] must be a BigInt`)
		}
		sumSquares += component * component
	}

	if (sumSquares === 0n) return 0n

	const scaledSumSquares = sumSquares * SCALE_SQUARED
	const root = isqrtFloor(scaledSumSquares)
	const remainder = scaledSumSquares - root * root

	return remainder > root ? root + 1n : root
}
