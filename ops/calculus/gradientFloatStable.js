/**
 * Numerically stable gradient computation over IEEE-754 float64 numbers.
 *
 * Computes the gradient vector ∇f(x) = [∂f/∂x_0, ..., ∂f/∂x_{n-1}] of a scalar
 * function f: R^n -> R at point x using Ridders' method (Neville-Richardson
 * extrapolation on central differences) with:
 * - Coordinate-scaled initial step sizes and overflow/underflow protection
 * - Exact IEEE-754 effective step accounting (span = (x + h) - (x - h))
 * - Scale-invariant Neville extrapolation ratios to prevent overflow/underflow
 * - Incremental extrapolation updates to minimize catastrophic cancellation
 * - Automatic domain-boundary step shrinking with one-sided Richardson fallback
 * - A-posteriori error bounds with tolerance and roundoff-divergence stopping
 *
 * @module ops/calculus/gradientFloatStable
 */

const DEFAULT_REL_TOL = 1e-12;
const DEFAULT_ABS_TOL = 1e-15;
const DEFAULT_MAX_ORDER = 10;
const MAX_ALLOWED_ORDER = 20;
const DEFAULT_CONTRACT_FACTOR = 1.4;
const ROUNDOFF_SAFE_FACTOR = 2.0;
const INITIAL_STEP_SCALE = 0.03125; // 2^-5, exact in binary float64
const MAX_DOMAIN_SHRINKS = 64;

/**
 * Validate that a value is a finite IEEE-754 number.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {number}
 */
function assertFiniteNumber(value, name) {
	if (typeof value !== 'number') {
		throw new TypeError(`${name} must be a number`);
	}
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be a finite number`);
	}
	return value;
}

/**
 * Validate and normalize the input point vector x into a fresh float64 array copy.
 *
 * @param {unknown} x
 * @returns {number[]}
 */
function normalizePoint(x) {
	if (!Array.isArray(x) && !(x instanceof Float64Array)) {
		throw new TypeError('x must be an Array or Float64Array of finite numbers');
	}
	const n = x.length;
	const out = new Array(n);
	for (let i = 0; i < n; i++) {
		out[i] = assertFiniteNumber(x[i], `x[${i}]`);
	}
	return out;
}

/**
 * Validate and normalize optional configuration.
 *
 * @param {unknown} options
 * @param {number} dim
 * @returns {{
 *   steps: (number | undefined)[],
 *   relTol: number,
 *   absTol: number,
 *   maxOrder: number,
 *   contractFactor: number,
 *   withError: boolean
 * }}
 */
function normalizeOptions(options, dim) {
	if (options === undefined) {
		return {
			steps: new Array(dim),
			relTol: DEFAULT_REL_TOL,
			absTol: DEFAULT_ABS_TOL,
			maxOrder: DEFAULT_MAX_ORDER,
			contractFactor: DEFAULT_CONTRACT_FACTOR,
			withError: false,
		};
	}

	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object');
	}

	const steps = new Array(dim);
	if (options.step !== undefined) {
		if (Array.isArray(options.step) || options.step instanceof Float64Array) {
			if (options.step.length !== dim) {
				throw new RangeError(`options.step length (${options.step.length}) must match x.length (${dim})`);
			}
			for (let i = 0; i < dim; i++) {
				const s = assertFiniteNumber(options.step[i], `options.step[${i}]`);
				if (s <= 0) {
					throw new RangeError(`options.step[${i}] must be positive`);
				}
				steps[i] = s;
			}
		} else {
			const s = assertFiniteNumber(options.step, 'options.step');
			if (s <= 0) {
				throw new RangeError('options.step must be positive');
			}
			steps.fill(s);
		}
	}

	let relTol = DEFAULT_REL_TOL;
	if (options.relTol !== undefined) {
		relTol = assertFiniteNumber(options.relTol, 'options.relTol');
		if (relTol < 0) {
			throw new RangeError('options.relTol must be non-negative');
		}
	}

	let absTol = DEFAULT_ABS_TOL;
	if (options.absTol !== undefined) {
		absTol = assertFiniteNumber(options.absTol, 'options.absTol');
		if (absTol < 0) {
			throw new RangeError('options.absTol must be non-negative');
		}
	}

	let maxOrder = DEFAULT_MAX_ORDER;
	if (options.maxOrder !== undefined) {
		maxOrder = assertFiniteNumber(options.maxOrder, 'options.maxOrder');
		if (!Number.isInteger(maxOrder) || maxOrder < 1 || maxOrder > MAX_ALLOWED_ORDER) {
			throw new RangeError(`options.maxOrder must be an integer between 1 and ${MAX_ALLOWED_ORDER}`);
		}
	}

	let contractFactor = DEFAULT_CONTRACT_FACTOR;
	if (options.contractFactor !== undefined) {
		contractFactor = assertFiniteNumber(options.contractFactor, 'options.contractFactor');
		if (contractFactor <= 1) {
			throw new RangeError('options.contractFactor must be greater than 1');
		}
	}

	let withError = false;
	if (options.withError !== undefined) {
		if (typeof options.withError !== 'boolean') {
			throw new TypeError('options.withError must be a boolean');
		}
		withError = options.withError;
	}

	return { steps, relTol, absTol, maxOrder, contractFactor, withError };
}

/**
 * Safely evaluate f on a fresh copy of point so caller state and work buffers
 * cannot be mutated by f.
 *
 * @param {(point: number[]) => number} f
 * @param {number[]} point
 * @param {boolean} strictType
 * @returns {number}
 */
function evalFn(f, point, strictType) {
	const value = f(point.slice());
	if (typeof value !== 'number') {
		if (strictType) {
			throw new TypeError('f(x) must return a number');
		}
		return Number.NaN;
	}
	return value;
}

/**
 * Choose a coordinate-scaled initial step size that avoids overflow/underflow.
 *
 * @param {number} xi
 * @param {number | undefined} userStep
 * @returns {number}
 */
function chooseInitialStep(xi, userStep) {
	if (userStep !== undefined) {
		return userStep;
	}
	const mag = Math.abs(xi);
	const scale = mag > 1 ? mag : 1;
	return scale * INITIAL_STEP_SCALE;
}

/**
 * Snap a step h to an exact representable offset relative to xi when possible.
 *
 * @param {number} xi
 * @param {number} h
 * @returns {number}
 */
function exactStep(xi, h) {
	const shifted = xi + h;
	if (!Number.isFinite(shifted)) {
		return h;
	}
	const diff = shifted - xi;
	return diff > 0 ? diff : h;
}

/**
 * Compute a central difference quotient at coordinate i for step h.
 * Returns null if endpoints overflow, collapse to zero span, or f is non-finite.
 *
 * @param {(point: number[]) => number} f
 * @param {number[]} work
 * @param {number} index
 * @param {number} xi
 * @param {number} h
 * @returns {{ value: number, span: number } | null}
 */
function evalCentral(f, work, index, xi, h) {
	const hEff = exactStep(xi, h);
	const xPlus = xi + hEff;
	const xMinus = xi - hEff;
	if (!Number.isFinite(xPlus) || !Number.isFinite(xMinus)) {
		return null;
	}
	const span = xPlus - xMinus;
	if (!(span > 0) || !Number.isFinite(span)) {
		return null;
	}

	work[index] = xPlus;
	const fPlus = evalFn(f, work, false);
	if (!Number.isFinite(fPlus)) {
		work[index] = xi;
		return null;
	}

	work[index] = xMinus;
	const fMinus = evalFn(f, work, false);
	work[index] = xi;
	if (!Number.isFinite(fMinus)) {
		return null;
	}

	const diff = fPlus - fMinus;
	const value = diff / span;
	if (!Number.isFinite(value)) {
		return null;
	}
	return { value, span };
}

/**
 * Compute a one-sided difference quotient (direction +1 or -1) at coordinate i.
 *
 * @param {(point: number[]) => number} f
 * @param {number[]} work
 * @param {number} index
 * @param {number} xi
 * @param {number} f0
 * @param {number} h
 * @param {1 | -1} dir
 * @returns {{ value: number, span: number } | null}
 */
function evalOneSided(f, work, index, xi, f0, h, dir) {
	const xMoved = xi + dir * h;
	if (!Number.isFinite(xMoved)) {
		return null;
	}
	const signedStep = xMoved - xi;
	const span = Math.abs(signedStep);
	if (!(span > 0) || !Number.isFinite(span)) {
		return null;
	}

	work[index] = xMoved;
	const fMoved = evalFn(f, work, false);
	work[index] = xi;
	if (!Number.isFinite(fMoved)) {
		return null;
	}

	const value = (fMoved - f0) / signedStep;
	if (!Number.isFinite(value)) {
		return null;
	}
	return { value, span };
}

/**
 * Find the largest valid step <= initialH for a difference evaluator, shrinking
 * past domain boundaries or overflow regions.
 *
 * @param {number} xi
 * @param {number} initialH
 * @param {(h: number) => { value: number, span: number } | null} probe
 * @returns {{ h: number, sample: { value: number, span: number } } | null}
 */
function findValidInitialStep(xi, initialH, probe) {
	let h = initialH;
	const mag = Math.abs(xi);
	let jumpedToMag = false;

	for (let attempt = 0; attempt < MAX_DOMAIN_SHRINKS; attempt++) {
		if (!(h > 0) || !Number.isFinite(h)) {
			return null;
		}
		const sample = probe(h);
		if (sample !== null) {
			return { h, sample };
		}
		if (!jumpedToMag && mag > 0 && h > mag * 0.5) {
			h = mag * 0.25;
			jumpedToMag = true;
		} else {
			h *= 0.5;
		}
	}
	return null;
}

/**
 * Run Neville-Richardson / Ridders extrapolation on a sequence of difference
 * quotients with exact effective spans.
 *
 * For central differences, the asymptotic error expansion is in span^2 (power = 2).
 * For one-sided differences, the asymptotic error expansion is in span^1 (power = 1).
 *
 * @param {number} initialH
 * @param {{ value: number, span: number }} firstSample
 * @param {(h: number) => { value: number, span: number } | null} probe
 * @param {1 | 2} orderPower
 * @param {{ relTol: number, absTol: number, maxOrder: number, contractFactor: number }} cfg
 * @returns {{ derivative: number, error: number }}
 */
function extrapolateRidders(initialH, firstSample, probe, orderPower, cfg) {
	const { relTol, absTol, maxOrder, contractFactor } = cfg;

	// Tableau column prevCol stores A[j][k - 1] for j = 0..k-1
	let prevCol = [firstSample.value];
	const spans = [firstSample.span];

	let best = firstSample.value;
	let bestErr = Number.POSITIVE_INFINITY;
	let h = initialH;

	for (let k = 1; k <= maxOrder; k++) {
		h /= contractFactor;
		if (!(h > 0)) {
			break;
		}
		const sample = probe(h);
		if (sample === null) {
			break;
		}
		// Ensure effective span actually shrank beyond ULP granularity
		if (!(sample.span < spans[k - 1])) {
			break;
		}
		spans.push(sample.span);

		const currCol = new Array(k + 1);
		currCol[0] = sample.value;

		for (let j = 1; j <= k; j++) {
			// Scale-invariant ratio avoids overflow/underflow for extreme spans
			const spanRatio = spans[k - j] / sample.span;
			const fac = orderPower === 2 ? spanRatio * spanRatio : spanRatio;
			const denom = fac - 1;
			if (!(denom > 0) || !Number.isFinite(denom)) {
				currCol[j] = currCol[j - 1];
				continue;
			}
			// Incremental Neville update minimizes subtractive cancellation
			const curr = currCol[j - 1];
			const prev = prevCol[j - 1];
			const next = curr + (curr - prev) / denom;
			if (!Number.isFinite(next)) {
				return {
					derivative: best === 0 ? 0 : best,
					error: Number.isFinite(bestErr) ? bestErr : 0,
				};
			}
			currCol[j] = next;

			const errt = Math.max(Math.abs(next - curr), Math.abs(next - prev));
			if (errt <= bestErr) {
				bestErr = errt;
				best = next;
			}
		}

		const tol = absTol + relTol * Math.abs(best);
		if (bestErr <= tol) {
			break;
		}

		// Ridders roundoff-noise guard: stop when highest-order diagonal degrades
		if (Number.isFinite(bestErr) && Math.abs(currCol[k] - prevCol[k - 1]) >= ROUNDOFF_SAFE_FACTOR * bestErr) {
			break;
		}

		prevCol = currCol;
	}

	return {
		derivative: best === 0 ? 0 : best,
		error: Number.isFinite(bestErr) ? bestErr : 0,
	};
}

/**
 * Compute the gradient ∇f(x) of a scalar multivariate function f: R^n -> R
 * over IEEE-754 float64 numbers using a numerically robust Ridders/Richardson
 * extrapolation scheme with adaptive scaling and a-posteriori error control.
 *
 * @param {(point: number[]) => number} f - Scalar function taking a length-n point array.
 * @param {number[] | Float64Array} x - Evaluation point in R^n (not mutated).
 * @param {object} [options] - Optional numerical controls.
 * @param {number | number[] | Float64Array} [options.step] - Positive initial step size (scalar or per-coordinate).
 * @param {number} [options.relTol=1e-12] - Relative error tolerance for early stopping.
 * @param {number} [options.absTol=1e-15] - Absolute error tolerance for early stopping.
 * @param {number} [options.maxOrder=10] - Maximum extrapolation tableau depth (integer 1..20).
 * @param {number} [options.contractFactor=1.4] - Step contraction factor (> 1).
 * @param {boolean} [options.withError=false] - If true, return `{ gradient, errors }`.
 * @returns {number[] | { gradient: number[], errors: number[] }}
 *   Gradient vector (or `{ gradient, errors }` when `options.withError` is true).
 * @throws {TypeError} If `f`, `x`, `options`, or `f(x)` have invalid types.
 * @throws {RangeError} If `x`, `options`, or `f(x)` contain non-finite or out-of-range values,
 *   or if a finite derivative cannot be evaluated at some coordinate.
 */
export function gradientFloatStable(f, x, options) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function');
	}

	const point = normalizePoint(x);
	const dim = point.length;
	const cfg = normalizeOptions(options, dim);

	// Validate f at the base point x
	const f0 = evalFn(f, point, true);
	if (!Number.isFinite(f0)) {
		throw new RangeError('f(x) must evaluate to a finite number at x');
	}

	const gradient = new Array(dim);
	const errors = new Array(dim);
	const work = point.slice();

	for (let i = 0; i < dim; i++) {
		const xi = point[i];
		const h0 = chooseInitialStep(xi, cfg.steps[i]);

		// Prefer central difference Ridders extrapolation (O(h^(2k)))
		const centralProbe = (h) => evalCentral(f, work, i, xi, h);
		const centralInit = findValidInitialStep(xi, h0, centralProbe);

		let result;
		if (centralInit !== null) {
			result = extrapolateRidders(centralInit.h, centralInit.sample, centralProbe, 2, cfg);
		} else {
			// Domain-boundary fallback: one-sided forward or backward Richardson extrapolation
			const forwardProbe = (h) => evalOneSided(f, work, i, xi, f0, h, 1);
			const forwardInit = findValidInitialStep(xi, h0, forwardProbe);
			if (forwardInit !== null) {
				result = extrapolateRidders(forwardInit.h, forwardInit.sample, forwardProbe, 1, cfg);
			} else {
				const backwardProbe = (h) => evalOneSided(f, work, i, xi, f0, h, -1);
				const backwardInit = findValidInitialStep(xi, h0, backwardProbe);
				if (backwardInit !== null) {
					result = extrapolateRidders(backwardInit.h, backwardInit.sample, backwardProbe, 1, cfg);
				} else {
					throw new RangeError(`Unable to evaluate finite partial derivative at coordinate ${i}`);
				}
			}
		}

		gradient[i] = result.derivative;
		errors[i] = result.error;
	}

	return cfg.withError ? { gradient, errors } : gradient;
}
