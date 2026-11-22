/**
 * Fixed-point scaling factor (10^18) applied to the returned divergence value.
 * @type {bigint}
 */
export const SCALE = 10n ** 18n;

/**
 * Validates that a vector field evaluation returned a BigInt array of the expected length.
 *
 * @param {unknown} result - The value returned by F(point).
 * @param {number} expectedLength - Expected dimension of the vector.
 * @param {string} label - Descriptive label for error messages.
 * @throws {TypeError} If result is not an array or contains a non-BigInt element.
 * @throws {RangeError} If result.length does not match expectedLength.
 */
function validateVectorResult(result, expectedLength, label) {
	if (!Array.isArray(result)) {
		throw new TypeError(`${label} must return an array of BigInt values`);
	}
	if (result.length !== expectedLength) {
		throw new RangeError(
			`${label} must return a vector of length ${expectedLength}, received ${result.length}`,
		);
	}
	for (let j = 0; j < expectedLength; j++) {
		if (typeof result[j] !== 'bigint') {
			throw new TypeError(`${label} returned a non-BigInt value at index ${j}`);
		}
	}
}

/**
 * Divides a BigInt numerator by a strictly positive BigInt denominator,
 * rounding to the nearest BigInt with ties broken to even (round-half-to-even).
 *
 * @param {bigint} numerator - Dividend (may be negative, zero, or positive).
 * @param {bigint} denominator - Strictly positive divisor (> 0n).
 * @returns {bigint} Rounded quotient.
 */
function divideRoundHalfToEven(numerator, denominator) {
	const quotient = numerator / denominator;
	const remainder = numerator % denominator;
	if (remainder === 0n) {
		return quotient;
	}
	const absRemainder = remainder < 0n ? -remainder : remainder;
	const twiceRemainder = absRemainder * 2n;
	if (
		twiceRemainder > denominator ||
		(twiceRemainder === denominator && (quotient & 1n) !== 0n)
	) {
		return numerator > 0n ? quotient + 1n : quotient - 1n;
	}
	return quotient;
}

/**
 * Iteratively computes the divergence of an n-dimensional vector field `F` at a
 * BigInt coordinate vector `point` using central finite differences with step `h`,
 * returning a fixed-point BigInt scaled by `SCALE` (10^18).
 *
 * Mathematical definition:
 *   div(F)(x) = sum_{i=0}^{n-1} (dF_i / dx_i)(x)
 *             ≈ (sum_{i=0}^{n-1} (F_i(x + h*e_i) - F_i(x - h*e_i))) / (2 * h)
 *
 * Fixed-point scaling semantics:
 * - Returns `round((totalDiff * 10n ** 18n) / (2n * h))` using round-half-to-even.
 * - Because `F_i` and `h` appear as a ratio, this formula works identically whether
 *   `point`, `h`, and `F(point)` are unscaled exact BigInt integers or fixed-point
 *   BigInts sharing any common scale factor S.
 * - Central differences are summed exactly before the single final division by `2n * h`
 *   to avoid per-component rounding drift.
 *
 * @param {(point: bigint[]) => bigint[]} F - Vector field mapping an n-element BigInt
 *   array to an n-element BigInt array.
 * @param {bigint[]} point - Non-empty array of BigInt coordinates where divergence is evaluated.
 * @param {bigint} [h=1n] - Strictly positive BigInt step size (> 0n).
 * @returns {bigint} Divergence at `point`, scaled by 10^18 (SCALE).
 * @throws {TypeError} If `F` is not a function, `point` is not an array of BigInts,
 *   `h` is not a BigInt, or `F` returns a non-array or non-BigInt elements.
 * @throws {RangeError} If `point` is empty, `h <= 0n`, or `F` returns a vector whose
 *   length does not match `point.length`.
 */
export function divergenceBigIntIterative(F, point, h = 1n) {
	if (typeof F !== 'function') {
		throw new TypeError(
			'F must be a function mapping a BigInt vector to a BigInt vector',
		);
	}
	if (!Array.isArray(point)) {
		throw new TypeError('point must be an array of BigInt values');
	}
	const n = point.length;
	if (n === 0) {
		throw new RangeError('point must be a non-empty array');
	}
	const basePoint = new Array(n);
	for (let i = 0; i < n; i++) {
		if (typeof point[i] !== 'bigint') {
			throw new TypeError(`point[${i}] must be a BigInt`);
		}
		basePoint[i] = point[i];
	}
	if (typeof h !== 'bigint') {
		throw new TypeError('h must be a BigInt');
	}
	if (h <= 0n) {
		throw new RangeError('h must be a positive BigInt (> 0n)');
	}

	let totalDiff = 0n;
	for (let i = 0; i < n; i++) {
		const plusPoint = basePoint.slice();
		plusPoint[i] = basePoint[i] + h;
		const fPlus = F(plusPoint);
		validateVectorResult(fPlus, n, `F(point + h*e_${i})`);

		const minusPoint = basePoint.slice();
		minusPoint[i] = basePoint[i] - h;
		const fMinus = F(minusPoint);
		validateVectorResult(fMinus, n, `F(point - h*e_${i})`);

		totalDiff += fPlus[i] - fMinus[i];
	}

	return divideRoundHalfToEven(totalDiff * SCALE, 2n * h);
}
