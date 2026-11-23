/**
 * Binary-indexed powers of 10 used for recursive divide-and-conquer
 * range reduction across the full IEEE-754 float64 positive exponent range
 * (5e-324 through 1.7976931348623157e+308).
 *
 * @type {ReadonlyArray<readonly [number, number]>}
 */
const POW10_TABLE = Object.freeze([
	[256, 1e256],
	[128, 1e128],
	[64, 1e64],
	[32, 1e32],
	[16, 1e16],
	[8, 1e8],
	[4, 1e4],
	[2, 1e2],
	[1, 1e1],
])

/**
 * Recursively reduces a large positive float64 (`x >= 10`) into `[1, 10)`
 * by divide-and-conquer over binary powers of 10.
 *
 * @param {number} x - Current positive mantissa candidate (`x >= 1`).
 * @param {number} idx - Current index into `POW10_TABLE`.
 * @param {number} exponent - Accumulated base-10 integer exponent.
 * @returns {[number, number]} Tuple `[m, k]` where `originalX ≈ m * 10^k`.
 */
function reduceLarge(x, idx, exponent) {
	if (idx >= POW10_TABLE.length) {
		return [x, exponent]
	}
	const [stepExp, factor] = POW10_TABLE[idx]
	if (x >= factor) {
		return reduceLarge(x / factor, idx + 1, exponent + stepExp)
	}
	return reduceLarge(x, idx + 1, exponent)
}

/**
 * Recursively scales a small positive float64 (`0 < x < 0.5`) up toward `[1, 10)`
 * by divide-and-conquer over binary powers of 10.
 *
 * @param {number} x - Current positive mantissa candidate (`0 < x < 10`).
 * @param {number} idx - Current index into `POW10_TABLE`.
 * @param {number} exponent - Accumulated negative base-10 integer exponent.
 * @returns {[number, number]} Tuple `[m, k]` where `originalX ≈ m * 10^k`.
 */
function reduceSmall(x, idx, exponent) {
	if (idx >= POW10_TABLE.length) {
		return [x, exponent]
	}
	const [stepExp, factor] = POW10_TABLE[idx]
	if (x * factor < 10) {
		return reduceSmall(x * factor, idx + 1, exponent - stepExp)
	}
	return reduceSmall(x, idx + 1, exponent)
}

/**
 * Recursively computes `log10(1 + u)` for `0 <= u < 9` using binary
 * squaring / divide-and-conquer on the fractional exponent bits:
 *
 *   log10(1 + u) = 0.5 * log10((1 + u)^2) = 0.5 * log10(1 + 2u + u^2)
 *
 * Operating directly on `u = m - 1` avoids catastrophic cancellation when `m`
 * is close to `1`, preserving full float64 precision.
 *
 * @param {number} u - Non-negative offset `m - 1` with `0 <= u < 9`.
 * @param {number} depth - Current recursion depth guard.
 * @param {number} sigBits - Number of significant binary digits extracted since the first 1-bit.
 * @returns {number} Base-10 logarithm of `1 + u`.
 */
function log10FracRecursive(u, depth, sigBits) {
	if (u === 0 || sigBits >= 56 || depth >= 128) {
		return 0
	}
	const uSquared = 2 * u + u * u
	if (uSquared >= 9) {
		return 0.5 * (1 + log10FracRecursive((uSquared - 9) / 10, depth + 1, sigBits + 1))
	}
	return 0.5 * log10FracRecursive(uSquared, depth + 1, sigBits > 0 ? sigBits + 1 : 0)
}

/**
 * Recursively computes `log10(m)` for a range-reduced positive number `m`
 * near `[0.5, 10)`, handling any boundary rounding across `0.5` or `10`.
 *
 * @param {number} m - Range-reduced positive float64.
 * @returns {number} Base-10 logarithm of `m`.
 */
function log10Normalized(m) {
	if (m === 1) {
		return 0
	}
	if (m >= 10) {
		return 1 + log10Normalized(m / 10)
	}
	if (m < 0.5) {
		return -1 + log10Normalized(m * 10)
	}
	if (m < 1) {
		// Use log10(m) = -log10(1 / m) = -log10(1 + (1 - m) / m) to avoid cancellation near 1.
		return -log10FracRecursive((1 - m) / m, 0, 0)
	}
	return log10FracRecursive(m - 1, 0, 0)
}

/**
 * Computes the base-10 logarithm (`log10`) of an IEEE-754 float64 number
 * using a two-stage recursive divide-and-conquer algorithm:
 *
 * 1. Recursive binary-exponent range reduction by powers of 10 (`10^256` down to `10^1`),
 *    reducing any positive finite float64 (including subnormals) to `[0.5, 10)`.
 * 2. Recursive binary squaring on `u = m - 1` to extract the fractional bits of
 *    `log10(1 + u)` without calling `Math.log10` or other transcendental functions.
 *
 * IEEE-754 special-value semantics:
 * - `NaN` or `x < 0` returns `NaN`
 * - `+0` or `-0` returns `-Infinity`
 * - `Infinity` returns `Infinity`
 * - `1` returns `+0`
 *
 * @param {number} x - The IEEE-754 float64 input value.
 * @returns {number} The base-10 logarithm of `x`.
 * @throws {TypeError} If `x` is not of type `'number'`.
 */
export function log10FloatRecursive(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected a number, received ${typeof x}`)
	}
	if (Number.isNaN(x) || x < 0) {
		return NaN
	}
	if (x === 0) {
		return -Infinity
	}
	if (x === Infinity) {
		return Infinity
	}
	if (x === 1) {
		return 0
	}
	if (x >= 10) {
		const [m, k] = reduceLarge(x, 0, 0)
		return k + log10Normalized(m)
	}
	if (x < 0.5) {
		const [m, k] = reduceSmall(x, 0, 0)
		return k + log10Normalized(m)
	}
	return log10Normalized(x)
}
