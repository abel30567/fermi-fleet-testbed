const HALF_PI = Math.PI / 2;
const REDUCTION_THRESHOLD = 0.125;
const LARGE_V_THRESHOLD = 1e150;
const DEFAULT_MAX_ITERATIONS = 1000;
const DEFAULT_TOLERANCE = 0;

/**
 * Validates that the input is a finite dual number `{ v, d }`.
 *
 * @param {unknown} x - Candidate dual number.
 * @throws {TypeError} If `x` is not a plain-like object with numeric `v` and `d`.
 * @throws {RangeError} If `x.v` or `x.d` is not a finite number.
 */
function validateDual(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Expected a dual number object { v, d }');
	}
	if (typeof x.v !== 'number' || typeof x.d !== 'number') {
		throw new TypeError('Dual number properties "v" and "d" must be numbers');
	}
	if (!Number.isFinite(x.v) || !Number.isFinite(x.d)) {
		throw new RangeError('Dual number properties "v" and "d" must be finite numbers');
	}
}

/**
 * Validates optional iteration configuration.
 *
 * @param {unknown} options - Candidate options object.
 * @returns {{ maxIterations: number, tolerance: number }} Normalized options.
 * @throws {TypeError} If `options` or its fields have invalid types.
 * @throws {RangeError} If `maxIterations` or `tolerance` are out of range.
 */
function validateOptions(options) {
	if (options === undefined) {
		return { maxIterations: DEFAULT_MAX_ITERATIONS, tolerance: DEFAULT_TOLERANCE };
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('Options must be an object');
	}

	const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
	const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;

	if (typeof maxIterations !== 'number') {
		throw new TypeError('options.maxIterations must be a number');
	}
	if (!Number.isInteger(maxIterations) || maxIterations < 1) {
		throw new RangeError('options.maxIterations must be a positive integer');
	}

	if (typeof tolerance !== 'number') {
		throw new TypeError('options.tolerance must be a number');
	}
	if (!Number.isFinite(tolerance) || tolerance < 0) {
		throw new RangeError('options.tolerance must be a finite non-negative number');
	}

	return { maxIterations, tolerance };
}

/**
 * Computes `arctan(v)` iteratively using argument inversion for `|v| > 1`,
 * iterative half-angle reduction `t -> t / (1 + sqrt(1 + t^2))`, and the
 * alternating Maclaurin series `sum_{k>=0} (-1)^k * t^(2k+1) / (2k+1)`.
 *
 * @param {number} v - Finite real value.
 * @param {number} maxIterations - Maximum number of Maclaurin series terms.
 * @param {number} tolerance - Relative convergence tolerance (`0` iterates to machine precision).
 * @returns {number} Approximate `arctan(v)` in `(-pi/2, pi/2)`.
 */
function atanValueIterative(v, maxIterations, tolerance) {
	if (v === 0) {
		return v;
	}

	const negative = v < 0;
	let t = negative ? -v : v;
	let inverted = false;

	if (t > 1) {
		t = 1 / t;
		inverted = true;
	}

	let scale = 1;
	while (t > REDUCTION_THRESHOLD) {
		t = t / (1 + Math.sqrt(1 + t * t));
		scale *= 2;
	}

	const t2 = t * t;
	let power = t;
	let sum = 0;

	for (let k = 0; k < maxIterations; k++) {
		const term = power / (2 * k + 1);
		const next = sum + term;
		if (
			next === sum ||
			(tolerance > 0 && Math.abs(term) <= tolerance * Math.max(1, Math.abs(sum)))
		) {
			sum = next;
			break;
		}
		sum = next;
		power = -power * t2;
	}

	let result = sum * scale;
	if (inverted) {
		result = HALF_PI - result;
	}
	return negative ? -result : result;
}

/**
 * Computes the trigonometric arctangent of a dual number `{ v, d }` carrying
 * a forward-mode derivative alongside the value, using a straightforward
 * iterative algorithm (range reduction + Maclaurin series) for the primal value
 * and the exact forward-mode chain rule `d / (1 + v^2)` for the derivative.
 *
 * @param {{ v: number, d: number }} x - Input dual number with finite real value `v`
 *   and finite derivative `d`.
 * @param {{ maxIterations?: number, tolerance?: number }} [options] - Optional
 *   convergence controls for the iterative series.
 * @returns {{ v: number, d: number }} Resulting dual number `{ v: arctan(x.v), d: x.d / (1 + x.v^2) }`.
 * @throws {TypeError} If `x` is not a `{ v, d }` object with numeric fields, or if `options` has invalid types.
 * @throws {RangeError} If `x.v` or `x.d` is non-finite (`NaN`, `Infinity`, `-Infinity`),
 *   or if `options` values are out of range.
 */
export function arctanDualIterative(x, options) {
	validateDual(x);
	const { maxIterations, tolerance } = validateOptions(options);

	const { v, d } = x;
	const value = atanValueIterative(v, maxIterations, tolerance);

	const absV = Math.abs(v);
	const derivative = absV > LARGE_V_THRESHOLD ? (d / v) / v : d / (1 + v * v);

	return { v: value, d: derivative };
}
