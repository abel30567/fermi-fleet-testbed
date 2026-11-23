/**
 * Fixed-point scale factor (10^18) used to represent real numbers as exact BigInt values.
 * A real value `r` is encoded as `BigInt(round(r * 10^18))`.
 */
export const SCALE = 10n ** 18n;

/**
 * Default central finite-difference step size in fixed-point units (10^12, i.e. 10^-6).
 * Balances O(h^2) truncation error against O(1 / (SCALE * h)) fixed-point quantization error.
 */
export const DEFAULT_STEP = 10n ** 12n;

/**
 * Divides a BigInt numerator by a positive BigInt denominator, rounding to the
 * nearest integer (ties rounded half away from zero).
 *
 * @param {bigint} numerator
 * @param {bigint} denominator - Must be strictly positive (> 0n).
 * @returns {bigint}
 */
function divRoundNearest(numerator, denominator) {
	const half = denominator / 2n;
	if (numerator >= 0n) {
		return (numerator + half) / denominator;
	}
	return -((-numerator + half) / denominator);
}

/**
 * Validates that a vector returned by the vector field matches the expected dimension
 * and contains only BigInt components.
 *
 * @param {unknown} value
 * @param {number} expectedDimension
 * @returns {bigint[]}
 */
function validateFieldOutput(value, expectedDimension) {
	if (!Array.isArray(value)) {
		throw new TypeError('vectorField must return an Array of BigInt values');
	}
	if (value.length !== expectedDimension) {
		throw new RangeError(
			`vectorField returned vector of length ${value.length}, expected ${expectedDimension}`
		);
	}
	for (let j = 0; j < expectedDimension; j += 1) {
		if (typeof value[j] !== 'bigint') {
			throw new TypeError(
				`vectorField output component at index ${j} must be a BigInt`
			);
		}
	}
	return value;
}

/**
 * Computes the divergence (∇ · F) of an n-dimensional vector field F at a given point
 * using an iterative central finite-difference approximation over fixed-point BigInt
 * values scaled by 10^18.
 *
 * For a point x = [x_0, ..., x_{n-1}] (each scaled by 10^18) and step h (scaled by 10^18):
 *   div F(x) ≈ Σ_{i=0}^{n-1} (F_i(x + h·e_i) - F_i(x - h·e_i)) / (2·h)
 *
 * The partial differences are summed before scaling by 10^18 and dividing once by 2·h
 * (rounded to nearest integer, half away from zero) to avoid accumulating per-axis
 * rounding error and preserve exact cancellation for solenoidal fields.
 *
 * @param {(point: bigint[]) => bigint[]} vectorField
 *   Vector field mapping an n-element fixed-point BigInt array (scaled by 10^18)
 *   to an n-element fixed-point BigInt array (scaled by 10^18).
 * @param {bigint[]} point
 *   Non-empty array of fixed-point BigInt coordinates (scaled by 10^18) at which
 *   to evaluate the divergence.
 * @param {bigint} [step=DEFAULT_STEP]
 *   Positive BigInt step size (scaled by 10^18) for central finite differences.
 *   Defaults to 10^12 (representing 10^-6).
 * @returns {bigint}
 *   The divergence of `vectorField` at `point`, as a fixed-point BigInt scaled by 10^18.
 * @throws {TypeError} If `vectorField` is not a function, `point` is not an array of BigInts,
 *   `step` is not a BigInt, or `vectorField` does not return an array of BigInts.
 * @throws {RangeError} If `point` is empty, `step <= 0n`, or `vectorField` returns a vector
 *   whose dimension does not match `point.length`.
 */
export function divergenceBigIntIterative(vectorField, point, step = DEFAULT_STEP) {
	if (typeof vectorField !== 'function') {
		throw new TypeError('vectorField must be a function');
	}
	if (!Array.isArray(point)) {
		throw new TypeError('point must be an Array of BigInt coordinates');
	}
	const n = point.length;
	if (n === 0) {
		throw new RangeError('point must be a non-empty Array');
	}
	for (let i = 0; i < n; i += 1) {
		if (typeof point[i] !== 'bigint') {
			throw new TypeError(`point[${i}] must be a BigInt`);
		}
	}
	if (typeof step !== 'bigint') {
		throw new TypeError('step must be a BigInt');
	}
	if (step <= 0n) {
		throw new RangeError('step must be a positive BigInt (> 0n)');
	}

	let totalDelta = 0n;
	for (let i = 0; i < n; i += 1) {
		const plusPoint = point.slice();
		plusPoint[i] = point[i] + step;
		const plusVal = validateFieldOutput(vectorField(plusPoint), n);

		const minusPoint = point.slice();
		minusPoint[i] = point[i] - step;
		const minusVal = validateFieldOutput(vectorField(minusPoint), n);

		totalDelta += plusVal[i] - minusVal[i];
	}

	return divRoundNearest(totalDelta * SCALE, 2n * step);
}
