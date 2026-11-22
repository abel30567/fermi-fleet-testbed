/**
 * Complex 3D vector calculus curl via recursive Richardson extrapolation
 * and divide-and-conquer partial derivative computation.
 *
 * Pure ESM, Node 20+, zero dependencies.
 */

const DEFAULT_STEP = 1e-2;
const DEFAULT_MAX_DEPTH = 6;
const DEFAULT_TOLERANCE = 1e-12;
const MAX_ALLOWED_DEPTH = 16;

/**
 * Normalizes IEEE-754 negative zero (-0) to positive zero (0).
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value;
}

/**
 * Constructs a normalized complex number `{ re, im }` free of `-0`.
 *
 * @param {number} re
 * @param {number} im
 * @returns {{ re: number, im: number }}
 */
function makeComplex(re, im) {
	return { re: normalizeZero(re), im: normalizeZero(im) };
}

/**
 * Validates that a value is a finite complex number `{ re, im }`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {{ re: number, im: number }}
 * @throws {TypeError} If value is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
function validateComplex(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be a complex number object { re, im }`);
	}
	if (typeof value.re !== 'number' || typeof value.im !== 'number') {
		throw new TypeError(`${label}.re and ${label}.im must be numbers`);
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError(`${label}.re and ${label}.im must be finite numbers`);
	}
	return makeComplex(value.re, value.im);
}

/**
 * Validates a 3D complex vector `[c0, c1, c2]`.
 *
 * @param {unknown} vec
 * @param {string} label
 * @returns {[{ re: number, im: number }, { re: number, im: number }, { re: number, im: number }]}
 * @throws {TypeError} If `vec` is not an array or contains invalid complex entries.
 * @throws {RangeError} If `vec.length !== 3` or any component has non-finite parts.
 */
function validateComplexVector3(vec, label) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${label} must be an array of 3 complex numbers`);
	}
	if (vec.length !== 3) {
		throw new RangeError(`${label} must have length 3, got ${vec.length}`);
	}
	return [
		validateComplex(vec[0], `${label}[0]`),
		validateComplex(vec[1], `${label}[1]`),
		validateComplex(vec[2], `${label}[2]`),
	];
}

/**
 * Validates and normalizes optional configuration parameters.
 *
 * @param {unknown} options
 * @returns {{ step: number, maxDepth: number, tolerance: number }}
 * @throws {TypeError} If `options` or any field has an invalid type.
 * @throws {RangeError} If any numeric option is out of its valid range.
 */
function validateOptions(options) {
	if (options === undefined) {
		return {
			step: DEFAULT_STEP,
			maxDepth: DEFAULT_MAX_DEPTH,
			tolerance: DEFAULT_TOLERANCE,
		};
	}
	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('options must be a plain object');
	}

	const step = options.step === undefined ? DEFAULT_STEP : options.step;
	if (typeof step !== 'number') {
		throw new TypeError('options.step must be a number');
	}
	if (!Number.isFinite(step) || step <= 0) {
		throw new RangeError('options.step must be a finite positive number');
	}

	const maxDepth = options.maxDepth === undefined ? DEFAULT_MAX_DEPTH : options.maxDepth;
	if (typeof maxDepth !== 'number') {
		throw new TypeError('options.maxDepth must be a number');
	}
	if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > MAX_ALLOWED_DEPTH) {
		throw new RangeError(
			`options.maxDepth must be an integer between 0 and ${MAX_ALLOWED_DEPTH}`,
		);
	}

	const tolerance = options.tolerance === undefined ? DEFAULT_TOLERANCE : options.tolerance;
	if (typeof tolerance !== 'number') {
		throw new TypeError('options.tolerance must be a number');
	}
	if (!Number.isFinite(tolerance) || tolerance < 0) {
		throw new RangeError('options.tolerance must be a finite non-negative number');
	}

	return { step, maxDepth, tolerance };
}

/**
 * Subtracts two complex numbers: `a - b`.
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function complexSub(a, b) {
	return makeComplex(a.re - b.re, a.im - b.im);
}

/**
 * Adds two complex numbers: `a + b`.
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function complexAdd(a, b) {
	return makeComplex(a.re + b.re, a.im + b.im);
}

/**
 * Scales a complex number by a real scalar: `s * a`.
 *
 * @param {{ re: number, im: number }} a
 * @param {number} s
 * @returns {{ re: number, im: number }}
 */
function complexScale(a, s) {
	return makeComplex(a.re * s, a.im * s);
}

/**
 * Computes the modulus `|a|` of a complex number.
 *
 * @param {{ re: number, im: number }} a
 * @returns {number}
 */
function complexAbs(a) {
	return Math.hypot(a.re, a.im);
}

/**
 * Computes the infinity norm (max component modulus) of a 3D complex vector.
 *
 * @param {Array<{ re: number, im: number }>} vec
 * @returns {number}
 */
function vectorNorm(vec) {
	return Math.max(complexAbs(vec[0]), complexAbs(vec[1]), complexAbs(vec[2]));
}

/**
 * Computes the infinity-norm distance between two 3D complex vectors.
 *
 * @param {Array<{ re: number, im: number }>} a
 * @param {Array<{ re: number, im: number }>} b
 * @returns {number}
 */
function vectorDist(a, b) {
	return Math.max(
		complexAbs(complexSub(a[0], b[0])),
		complexAbs(complexSub(a[1], b[1])),
		complexAbs(complexSub(a[2], b[2])),
	);
}

/**
 * Evaluates the vector field at a freshly cloned perturbed point and validates its output.
 *
 * @param {(point: Array<{ re: number, im: number }>) => Array<{ re: number, im: number }>} field
 * @param {Array<{ re: number, im: number }>} basePoint
 * @param {number} axis
 * @param {number} delta
 * @returns {[{ re: number, im: number }, { re: number, im: number }, { re: number, im: number }]}
 */
function evaluatePerturbed(field, basePoint, axis, delta) {
	const perturbed = [
		makeComplex(basePoint[0].re + (axis === 0 ? delta : 0), basePoint[0].im),
		makeComplex(basePoint[1].re + (axis === 1 ? delta : 0), basePoint[1].im),
		makeComplex(basePoint[2].re + (axis === 2 ? delta : 0), basePoint[2].im),
	];
	const result = field(perturbed);
	return validateComplexVector3(result, 'field(point)');
}

/**
 * Computes the symmetric central difference `(F(p + h*e_axis) - F(p - h*e_axis)) / (2h)`
 * for all three components of the vector field along a given coordinate axis.
 *
 * @param {(point: Array<{ re: number, im: number }>) => Array<{ re: number, im: number }>} field
 * @param {Array<{ re: number, im: number }>} point
 * @param {number} axis
 * @param {number} h
 * @returns {[{ re: number, im: number }, { re: number, im: number }, { re: number, im: number }]}
 */
function centralDifference(field, point, axis, h) {
	const forward = evaluatePerturbed(field, point, axis, h);
	const backward = evaluatePerturbed(field, point, axis, -h);
	const inv2h = 0.5 / h;
	return [
		complexScale(complexSub(forward[0], backward[0]), inv2h),
		complexScale(complexSub(forward[1], backward[1]), inv2h),
		complexScale(complexSub(forward[2], backward[2]), inv2h),
	];
}

/**
 * Recursively computes one row of the Richardson extrapolation tableau.
 *
 * Given the previous row `R(k-1, 0..k-1)` and the current estimate `R(k, order)`,
 * eliminates the `O(h^(2*(order+1)))` error term via:
 *   `R(k, m) = R(k, m-1) + (R(k, m-1) - R(k-1, m-1)) / (4^m - 1)`
 *
 * @param {Array<Array<{ re: number, im: number }>>} prevRow
 * @param {Array<{ re: number, im: number }>} currEstimate
 * @param {number} order
 * @param {number} powerOfFour - Equals `4^(order + 1)`.
 * @returns {Array<Array<{ re: number, im: number }>>}
 */
function extrapolateRowRecursive(prevRow, currEstimate, order, powerOfFour) {
	if (order >= prevRow.length) {
		return [currEstimate];
	}

	const denom = powerOfFour - 1;
	const prev = prevRow[order];
	const nextEstimate = [
		complexAdd(currEstimate[0], complexScale(complexSub(currEstimate[0], prev[0]), 1 / denom)),
		complexAdd(currEstimate[1], complexScale(complexSub(currEstimate[1], prev[1]), 1 / denom)),
		complexAdd(currEstimate[2], complexScale(complexSub(currEstimate[2], prev[2]), 1 / denom)),
	];

	return [
		currEstimate,
		...extrapolateRowRecursive(prevRow, nextEstimate, order + 1, powerOfFour * 4),
	];
}

/**
 * Recursively refines the partial derivative vector `dF / d(point[axis])`
 * by halving the step size `h -> h / 2` and building the Richardson extrapolation tableau.
 *
 * Monitors convergence and guards against floating-point roundoff amplification
 * by retaining the lowest-error estimate.
 *
 * @param {(point: Array<{ re: number, im: number }>) => Array<{ re: number, im: number }>} field
 * @param {Array<{ re: number, im: number }>} point
 * @param {number} axis
 * @param {number} h
 * @param {number} depth
 * @param {number} maxDepth
 * @param {number} tolerance
 * @param {Array<Array<{ re: number, im: number }>> | null} prevRow
 * @param {Array<{ re: number, im: number }> | null} bestEstimate
 * @param {number} bestError
 * @returns {Array<{ re: number, im: number }>}
 */
function refinePartialRecursive(
	field,
	point,
	axis,
	h,
	depth,
	maxDepth,
	tolerance,
	prevRow,
	bestEstimate,
	bestError,
) {
	const diff = centralDifference(field, point, axis, h);

	if (depth === 0 || prevRow === null) {
		if (maxDepth === 0) {
			return diff;
		}
		return refinePartialRecursive(
			field,
			point,
			axis,
			h * 0.5,
			1,
			maxDepth,
			tolerance,
			[diff],
			diff,
			Infinity,
		);
	}

	const row = extrapolateRowRecursive(prevRow, diff, 0, 4);
	const candidate = row[row.length - 1];
	const errVertical = vectorDist(candidate, prevRow[prevRow.length - 1]);
	const errHorizontal = vectorDist(candidate, row[row.length - 2]);
	const err = Math.max(errVertical, errHorizontal);

	let nextBest = bestEstimate;
	let nextBestError = bestError;
	if (err <= nextBestError) {
		nextBest = candidate;
		nextBestError = err;
	}

	const threshold = tolerance * Math.max(1, vectorNorm(candidate));

	if (depth >= 2 && err <= threshold) {
		return nextBest;
	}

	if (depth >= 2 && bestError < Infinity && err > bestError * 4) {
		return bestEstimate;
	}

	if (depth >= maxDepth) {
		return nextBest;
	}

	return refinePartialRecursive(
		field,
		point,
		axis,
		h * 0.5,
		depth + 1,
		maxDepth,
		tolerance,
		row,
		nextBest,
		nextBestError,
	);
}

/**
 * Divide-and-conquer computation of the partial derivative vectors across a range of axes `[start, end]`.
 *
 * Splits the axis interval in half recursively and combines the resulting Jacobian columns.
 *
 * @param {(point: Array<{ re: number, im: number }>) => Array<{ re: number, im: number }>} field
 * @param {Array<{ re: number, im: number }>} point
 * @param {number} start
 * @param {number} end
 * @param {{ step: number, maxDepth: number, tolerance: number }} opts
 * @returns {Array<Array<{ re: number, im: number }>>}
 */
function computePartialsDivideAndConquer(field, point, start, end, opts) {
	if (start === end) {
		return [
			refinePartialRecursive(
				field,
				point,
				start,
				opts.step,
				0,
				opts.maxDepth,
				opts.tolerance,
				null,
				null,
				Infinity,
			),
		];
	}

	const mid = Math.floor((start + end) / 2);
	const left = computePartialsDivideAndConquer(field, point, start, mid, opts);
	const right = computePartialsDivideAndConquer(field, point, mid + 1, end, opts);
	return [...left, ...right];
}

/**
 * Computes the 3D curl `∇ × F(point)` of a complex vector field `F: C^3 -> C^3`
 * at a complex point `[x, y, z]`, where each complex number is `{ re, im }`.
 *
 * Algorithm:
 * Uses divide-and-conquer over the three coordinate axes combined with recursive
 * Richardson extrapolation on symmetric central differences (`h -> h / 2`),
 * eliminating even-order truncation errors (`O(h^2), O(h^4), ...`) while
 * monitoring convergence and guarding against floating-point roundoff growth.
 *
 * For `F(x, y, z) = [Fx, Fy, Fz]`, returns:
 *   `[∂Fz/∂y - ∂Fy/∂z, ∂Fx/∂z - ∂Fz/∂x, ∂Fy/∂x - ∂Fx/∂y]`
 *
 * @param {(point: [{ re: number, im: number }, { re: number, im: number }, { re: number, im: number }]) => [{ re: number, im: number }, { re: number, im: number }, { re: number, im: number }]} field
 *   3D complex vector field accepting `[x, y, z]` and returning `[Fx, Fy, Fz]`.
 * @param {[{ re: number, im: number }, { re: number, im: number }, { re: number, im: number }]} point
 *   3D complex evaluation point `[x, y, z]` where each entry is `{ re, im }`.
 * @param {{ step?: number, maxDepth?: number, tolerance?: number }} [options]
 *   Optional numerical differentiation parameters:
 *   - `step`: initial positive finite step size (default `1e-2`).
 *   - `maxDepth`: maximum Richardson recursion depth in `[0, 16]` (default `6`).
 *   - `tolerance`: target relative/absolute convergence tolerance `>= 0` (default `1e-12`).
 * @returns {[{ re: number, im: number }, { re: number, im: number }, { re: number, im: number }]}
 *   The 3D curl vector `[curlX, curlY, curlZ]` with complex `{ re, im }` entries (no `-0`).
 * @throws {TypeError} If `field` is not a function, `point` or `field(point)` is not a valid 3D complex array,
 *   or `options` has invalid field types.
 * @throws {RangeError} If `point` or `field(point)` does not have length 3, contains non-finite complex parts,
 *   or numeric options are out of range.
 */
export function curlComplexRecursive(field, point, options) {
	if (typeof field !== 'function') {
		throw new TypeError('field must be a function');
	}
	const validatedPoint = validateComplexVector3(point, 'point');
	const opts = validateOptions(options);

	const partials = computePartialsDivideAndConquer(field, validatedPoint, 0, 2, opts);
	const [dFx, dFy, dFz] = partials;

	// partials[axis][component] = ∂(F_component) / ∂(x_axis)
	const curlX = complexSub(dFy[2], dFz[1]); // ∂Fz/∂y - ∂Fy/∂z
	const curlY = complexSub(dFz[0], dFx[2]); // ∂Fx/∂z - ∂Fz/∂x
	const curlZ = complexSub(dFx[1], dFy[0]); // ∂Fy/∂x - ∂Fx/∂y

	return [curlX, curlY, curlZ];
}
