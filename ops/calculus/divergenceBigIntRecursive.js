/**
 * Default fixed-point scaling factor (10^18) for representing non-integer
 * BigInt divergence results with 18 decimal digits of fractional precision.
 *
 * @type {bigint}
 */
export const FIXED_POINT_SCALE = 10n ** 18n;

/**
 * Exact BigInt division with round-half-to-even (banker's rounding) for
 * positive denominators. Guarantees sign symmetry:
 * `divideRoundHalfToEven(-n, d) === -divideRoundHalfToEven(n, d)`.
 *
 * @param {bigint} numerator
 * @param {bigint} denominator Must be strictly positive (> 0n).
 * @returns {bigint}
 */
function divideRoundHalfToEven(numerator, denominator) {
	const quotient = numerator / denominator;
	const remainder = numerator % denominator;
	if (remainder === 0n) {
		return quotient;
	}

	const absTwiceRemainder = (remainder < 0n ? -remainder : remainder) * 2n;
	if (absTwiceRemainder > denominator) {
		return remainder > 0n ? quotient + 1n : quotient - 1n;
	}
	if (absTwiceRemainder === denominator && quotient % 2n !== 0n) {
		return remainder > 0n ? quotient + 1n : quotient - 1n;
	}
	return quotient;
}

/**
 * Recursively computes the sum of central finite-difference numerators
 * `F_i(point + step * e_i) - F_i(point - step * e_i)` for component indices
 * in `[start, end)` using divide-and-conquer binary splitting.
 *
 * @param {ReadonlyArray<(point: bigint[]) => bigint>} vectorField
 * @param {readonly bigint[]} basePoint
 * @param {bigint} step
 * @param {number} start Inclusive start dimension index.
 * @param {number} end Exclusive end dimension index.
 * @returns {bigint}
 */
function sumCentralDifferencesRecursive(vectorField, basePoint, step, start, end) {
	if (end - start === 1) {
		const i = start;
		const component = vectorField[i];

		const plusPoint = basePoint.slice();
		plusPoint[i] = basePoint[i] + step;
		const fPlus = component(plusPoint);
		if (typeof fPlus !== 'bigint') {
			throw new TypeError(
				`vectorField[${i}] must return a BigInt (received ${typeof fPlus}) at +step point`
			);
		}

		const minusPoint = basePoint.slice();
		minusPoint[i] = basePoint[i] - step;
		const fMinus = component(minusPoint);
		if (typeof fMinus !== 'bigint') {
			throw new TypeError(
				`vectorField[${i}] must return a BigInt (received ${typeof fMinus}) at -step point`
			);
		}

		return fPlus - fMinus;
	}

	const mid = start + Math.floor((end - start) / 2);
	const leftSum = sumCentralDifferencesRecursive(vectorField, basePoint, step, start, mid);
	const rightSum = sumCentralDifferencesRecursive(vectorField, basePoint, step, mid, end);
	return leftSum + rightSum;
}

/**
 * Computes the numerical divergence of an n-dimensional vector field over exact
 * BigInt coordinates using central finite differences and a recursive
 * divide-and-conquer summation, returning a fixed-point BigInt scaled by `scale`
 * (default `10n ** 18n`).
 *
 * For a vector field `F = [F_0, F_1, ..., F_{n-1}]` at `point = [x_0, ..., x_{n-1}]`
 * with step size `h = step`:
 *
 *   div(F)(x) ≈ sum_{i=0}^{n-1} (F_i(x + h*e_i) - F_i(x - h*e_i)) / (2 * h)
 *
 * All central-difference numerators are accumulated recursively via binary
 * splitting and divided once by `2 * step` after scaling by `scale`, using
 * exact round-half-to-even arithmetic to prevent intermediate rounding drift.
 *
 * Note: For any component `F_i` of degree at most 2 in `x_i`, the central
 * finite difference equals the exact analytical partial derivative for every
 * positive integer step `h`.
 *
 * @param {ReadonlyArray<(point: bigint[]) => bigint>} vectorField Non-empty array of n component functions `(point) => bigint`.
 * @param {readonly bigint[]} point Array of n BigInt coordinates matching `vectorField.length`.
 * @param {bigint} [step=1n] Positive BigInt step size `h` for central differences.
 * @param {bigint} [scale=FIXED_POINT_SCALE] Positive BigInt fixed-point scale factor (default `10n ** 18n`).
 * @returns {bigint} Fixed-point divergence scaled by `scale` (i.e. `round(div(F)(point) * scale)`).
 * @throws {TypeError} If `vectorField`, `point`, `step`, `scale`, or any component function/return value has an invalid type.
 * @throws {RangeError} If `vectorField` is empty, `point.length !== vectorField.length`, `step <= 0n`, or `scale <= 0n`.
 */
export function divergenceBigIntRecursive(
	vectorField,
	point,
	step = 1n,
	scale = FIXED_POINT_SCALE
) {
	if (!Array.isArray(vectorField)) {
		throw new TypeError('vectorField must be an Array of component functions');
	}
	if (vectorField.length === 0) {
		throw new RangeError('vectorField must not be empty');
	}
	for (let i = 0; i < vectorField.length; i++) {
		if (typeof vectorField[i] !== 'function') {
			throw new TypeError(`vectorField[${i}] must be a function (received ${typeof vectorField[i]})`);
		}
	}

	if (!Array.isArray(point)) {
		throw new TypeError('point must be an Array of BigInt coordinates');
	}
	if (point.length !== vectorField.length) {
		throw new RangeError(
			`point dimension (${point.length}) must match vectorField dimension (${vectorField.length})`
		);
	}
	for (let i = 0; i < point.length; i++) {
		if (typeof point[i] !== 'bigint') {
			throw new TypeError(`point[${i}] must be a BigInt (received ${typeof point[i]})`);
		}
	}

	if (typeof step !== 'bigint') {
		throw new TypeError(`step must be a BigInt (received ${typeof step})`);
	}
	if (step <= 0n) {
		throw new RangeError('step must be a strictly positive BigInt (> 0n)');
	}

	if (typeof scale !== 'bigint') {
		throw new TypeError(`scale must be a BigInt (received ${typeof scale})`);
	}
	if (scale <= 0n) {
		throw new RangeError('scale must be a strictly positive BigInt (> 0n)');
	}

	const basePoint = point.slice();
	const totalDelta = sumCentralDifferencesRecursive(
		vectorField,
		basePoint,
		step,
		0,
		vectorField.length
	);

	return divideRoundHalfToEven(totalDelta * scale, 2n * step);
}
