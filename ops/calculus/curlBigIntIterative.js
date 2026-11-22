/**
 * Fixed-point scaling factor (10^18) applied to curl output components.
 * @type {bigint}
 */
export const SCALE = 10n ** 18n;

/**
 * Validates that a value is a 3-element array of BigInt values.
 *
 * @param {unknown} vec - Value to validate.
 * @param {string} name - Descriptive name for error messages.
 * @throws {TypeError} If `vec` is not an Array or any element is not a BigInt.
 * @throws {RangeError} If `vec` does not have length 3.
 */
function validateVector3(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an Array of 3 BigInts`);
	}
	if (vec.length !== 3) {
		throw new RangeError(`${name} must have length 3, got ${vec.length}`);
	}
	for (let i = 0; i < 3; i++) {
		if (typeof vec[i] !== 'bigint') {
			throw new TypeError(`${name}[${i}] must be a BigInt, got ${typeof vec[i]}`);
		}
	}
}

/**
 * Performs exact BigInt division with rounding to nearest integer (half away from zero).
 *
 * @param {bigint} numerator - Dividend (may be negative, zero, or positive).
 * @param {bigint} denominator - Strictly positive divisor (> 0n).
 * @returns {bigint} Rounded quotient.
 */
function divRoundHalfAwayFromZero(numerator, denominator) {
	const quotient = numerator / denominator;
	const remainder = numerator % denominator;
	if (remainder === 0n) {
		return quotient;
	}
	const absRemainder = remainder < 0n ? -remainder : remainder;
	if (absRemainder * 2n >= denominator) {
		return numerator < 0n ? quotient - 1n : quotient + 1n;
	}
	return quotient;
}

/**
 * Computes the 3D curl (∇ × F) of a vector field `F([x, y, z])` at a 3D BigInt point
 * `[x, y, z]` using iterative central finite differences with step `h`.
 *
 * For each coordinate axis `j ∈ {0 (x), 1 (y), 2 (z)}`, the partial derivative is
 * approximated by the 2nd-order central difference:
 *
 *   ∂F / ∂x_j ≈ (F(point + h·e_j) - F(point - h·e_j)) / (2·h)
 *
 * The 3D curl components are then computed iteratively as:
 *   - curl_x = (∂F_z / ∂y - ∂F_y / ∂z) * SCALE
 *   - curl_y = (∂F_x / ∂z - ∂F_z / ∂x) * SCALE
 *   - curl_z = (∂F_y / ∂x - ∂F_x / ∂y) * SCALE
 *
 * Fixed-point semantics:
 * - Each output component is a BigInt scaled by `SCALE = 10n ** 18n` (representing
 *   18 fractional decimal digits), rounded to the nearest integer (half away from zero).
 * - Because the curl is a ratio ΔF / (2h), this scaling is consistent both when `point`,
 *   `h`, and `F` use unscaled BigInt integers and when all three share a common fixed-point
 *   scale (e.g., 10^18).
 * - Central differences are exact (zero truncation error) for all linear and quadratic
 *   polynomial vector fields.
 *
 * @param {(p: [bigint, bigint, bigint]) => [bigint, bigint, bigint]} F
 *   Vector field mapping a 3-element BigInt array `[x, y, z]` to a 3-element BigInt array `[Fx, Fy, Fz]`.
 * @param {[bigint, bigint, bigint]} point
 *   3D evaluation point `[x, y, z]` with BigInt coordinates (never mutated).
 * @param {bigint} [h=1n]
 *   Strictly positive BigInt step size for central finite differences.
 * @returns {[bigint, bigint, bigint]}
 *   3-element array `[curl_x, curl_y, curl_z]` of fixed-point BigInt values scaled by `10n ** 18n`.
 * @throws {TypeError} If `F` is not a function, `point` or any `F(...)` result is not an Array of BigInts, or `h` is not a BigInt.
 * @throws {RangeError} If `point` or any `F(...)` result does not have length 3, or if `h <= 0n`.
 */
export function curlBigIntIterative(F, point, h = 1n) {
	if (typeof F !== 'function') {
		throw new TypeError(`F must be a function, got ${typeof F}`);
	}
	validateVector3(point, 'point');
	if (typeof h !== 'bigint') {
		throw new TypeError(`h must be a BigInt, got ${typeof h}`);
	}
	if (h <= 0n) {
		throw new RangeError(`h must be a positive BigInt (> 0n), got ${h}`);
	}

	// Evaluate central differences along each of the 3 coordinate axes:
	// diffs[axis][comp] = F_comp(point + h * e_axis) - F_comp(point - h * e_axis)
	const diffs = new Array(3);
	for (let axis = 0; axis < 3; axis++) {
		const pPlus = [point[0], point[1], point[2]];
		const pMinus = [point[0], point[1], point[2]];
		pPlus[axis] += h;
		pMinus[axis] -= h;

		const fPlus = F(pPlus);
		validateVector3(fPlus, 'F(point + h*e)');

		const fMinus = F(pMinus);
		validateVector3(fMinus, 'F(point - h*e)');

		const axisDiff = new Array(3);
		for (let comp = 0; comp < 3; comp++) {
			axisDiff[comp] = fPlus[comp] - fMinus[comp];
		}
		diffs[axis] = axisDiff;
	}

	// Combine differences into the 3 curl components using cyclic indices:
	// k = 0 (x): a = 1 (y), b = 2 (z) -> ∂F_z/∂y - ∂F_y/∂z
	// k = 1 (y): a = 2 (z), b = 0 (x) -> ∂F_x/∂z - ∂F_z/∂x
	// k = 2 (z): a = 0 (x), b = 1 (y) -> ∂F_y/∂x - ∂F_x/∂y
	const denominator = 2n * h;
	const result = new Array(3);
	for (let k = 0; k < 3; k++) {
		const a = (k + 1) % 3;
		const b = (k + 2) % 3;
		const numerator = (diffs[a][b] - diffs[b][a]) * SCALE;
		result[k] = divRoundHalfAwayFromZero(numerator, denominator);
	}

	return result;
}
