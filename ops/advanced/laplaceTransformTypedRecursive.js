/**
 * Evaluates the Laplace integrand `value * exp(-s * time)` at a single sample.
 * Short-circuits zero signal values to avoid `0 * Infinity = NaN` when `s < 0`.
 *
 * @param {number} value - Sampled function value f(t).
 * @param {number} time - Sample time t >= 0.
 * @param {number} s - Laplace-domain evaluation point.
 * @returns {number} Integrand value f(t) * exp(-s * t).
 */
function evalIntegrand(value, time, s) {
	if (value === 0) {
		return 0
	}
	return value * Math.exp(-s * time)
}

/**
 * Validates inputs for {@link laplaceTransformTypedRecursive}.
 *
 * @param {Float64Array} values - Sampled function values f(t_i).
 * @param {Float64Array} times - Strictly increasing non-negative sample times t_i.
 * @param {Float64Array} sValues - Laplace-domain evaluation points s_j.
 * @throws {TypeError} If any argument is not a Float64Array.
 * @throws {RangeError} If lengths mismatch, any element is non-finite, or times are negative or not strictly increasing.
 */
function validateInputs(values, times, sValues) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError('values must be a Float64Array')
	}
	if (!(times instanceof Float64Array)) {
		throw new TypeError('times must be a Float64Array')
	}
	if (!(sValues instanceof Float64Array)) {
		throw new TypeError('sValues must be a Float64Array')
	}
	if (values.length !== times.length) {
		throw new RangeError(
			`values and times must have the same length (got ${values.length} and ${times.length})`,
		)
	}

	for (let i = 0; i < values.length; i++) {
		const v = values[i]
		if (!Number.isFinite(v)) {
			throw new RangeError(`values[${i}] must be a finite number`)
		}
		const t = times[i]
		if (!Number.isFinite(t)) {
			throw new RangeError(`times[${i}] must be a finite number`)
		}
		if (t < 0) {
			throw new RangeError(`times[${i}] must be non-negative (got ${t})`)
		}
		if (i > 0 && t <= times[i - 1]) {
			throw new RangeError(
				`times must be strictly increasing (times[${i - 1}]=${times[i - 1]}, times[${i}]=${t})`,
			)
		}
	}

	for (let j = 0; j < sValues.length; j++) {
		if (!Number.isFinite(sValues[j])) {
			throw new RangeError(`sValues[${j}] must be a finite number`)
		}
	}
}

/**
 * Recursively integrates the Laplace integrand over interval indices `[lo, hi)`
 * using divide-and-conquer pairwise summation of composite trapezoidal areas.
 * Pairwise summation achieves O(log n) recursion depth and O(eps * log n) rounding error.
 *
 * @param {Float64Array} values - Sampled function values f(t_i).
 * @param {Float64Array} times - Strictly increasing non-negative sample times t_i.
 * @param {number} s - Laplace-domain evaluation point.
 * @param {number} lo - Inclusive start interval index.
 * @param {number} hi - Exclusive end interval index.
 * @returns {number} Approximate integral over [times[lo], times[hi]].
 */
function integrateIntervalsRecursive(values, times, s, lo, hi) {
	const count = hi - lo
	if (count <= 0) {
		return 0
	}
	if (count === 1) {
		const dt = times[lo + 1] - times[lo]
		const y0 = evalIntegrand(values[lo], times[lo], s)
		const y1 = evalIntegrand(values[lo + 1], times[lo + 1], s)
		return 0.5 * (y0 + y1) * dt
	}
	const mid = lo + (count >>> 1)
	return (
		integrateIntervalsRecursive(values, times, s, lo, mid) +
		integrateIntervalsRecursive(values, times, s, mid, hi)
	)
}

/**
 * Recursively evaluates the Laplace transform across the slice `[sLo, sHi)` of `sValues`
 * using divide-and-conquer traversal and writes results into `out`.
 *
 * @param {Float64Array} values - Sampled function values f(t_i).
 * @param {Float64Array} times - Strictly increasing non-negative sample times t_i.
 * @param {Float64Array} sValues - Laplace-domain evaluation points s_j.
 * @param {Float64Array} out - Pre-allocated output buffer matching sValues.length.
 * @param {number} sLo - Inclusive start index into sValues.
 * @param {number} sHi - Exclusive end index into sValues.
 * @param {number} intervalCount - Total number of integration intervals (values.length - 1).
 */
function transformRangeRecursive(values, times, sValues, out, sLo, sHi, intervalCount) {
	const count = sHi - sLo
	if (count <= 0) {
		return
	}
	if (count === 1) {
		out[sLo] = integrateIntervalsRecursive(values, times, sValues[sLo], 0, intervalCount)
		return
	}
	const mid = sLo + (count >>> 1)
	transformRangeRecursive(values, times, sValues, out, sLo, mid, intervalCount)
	transformRangeRecursive(values, times, sValues, out, mid, sHi, intervalCount)
}

/**
 * Computes the numerical unilateral Laplace transform:
 *
 *   F(s) = ∫ f(t) * e^(-s * t) dt
 *
 * element-wise for each `s` in `sValues` over sampled `Float64Array` inputs `(values, times)`,
 * using a recursive divide-and-conquer pairwise trapezoidal quadrature (O(log n) stack depth).
 *
 * Supports both uniform and non-uniform strictly increasing time grids. When fewer than two
 * time samples are provided, the integral over a zero-width domain is 0 for every `s`.
 *
 * @param {Float64Array} values - Sampled signal values f(t_i). All entries must be finite.
 * @param {Float64Array} times - Strictly increasing non-negative sample times t_i >= 0, matching `values.length`.
 * @param {Float64Array} sValues - Finite Laplace-domain points s_j at which to evaluate F(s_j).
 * @returns {Float64Array} A new Float64Array of length `sValues.length` containing F(s_j) for each s_j.
 * @throws {TypeError} If `values`, `times`, or `sValues` is not a Float64Array.
 * @throws {RangeError} If `values` and `times` lengths differ, any entry is non-finite, or `times` is negative or not strictly increasing.
 */
export function laplaceTransformTypedRecursive(values, times, sValues) {
	validateInputs(values, times, sValues)

	const out = new Float64Array(sValues.length)
	if (sValues.length === 0 || values.length < 2) {
		return out
	}

	transformRangeRecursive(values, times, sValues, out, 0, sValues.length, values.length - 1)
	return out
}
