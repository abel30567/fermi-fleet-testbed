/**
 * Computes the numerical unilateral Laplace transform of a real-valued sampled
 * signal `f(t)` for each real frequency `s` in `sValues` using a straightforward
 * iterative composite trapezoidal rule over `Float64Array` inputs:
 *
 *   F(s) = ∫_{t_0}^{t_{n-1}} f(t) * exp(-s * t) dt
 *
 * Each element of the returned `Float64Array` corresponds to the transform
 * evaluated at the matching element of `sValues`.
 *
 * @param {Float64Array} values - Sampled signal values `f(t_i)` of length `n`.
 *   All elements must be finite numbers.
 * @param {Float64Array} times - Strictly increasing non-negative sample times
 *   `t_i >= 0` of length `n`. All elements must be finite numbers.
 * @param {Float64Array} sValues - Real Laplace transform parameters `s_k` at
 *   which to evaluate `F(s_k)`. All elements must be finite numbers.
 * @returns {Float64Array} A new `Float64Array` of length `sValues.length`
 *   containing the numerically integrated Laplace transform values.
 * @throws {TypeError} If `values`, `times`, or `sValues` is not a `Float64Array`.
 * @throws {RangeError} If `values.length !== times.length`, if any input
 *   contains a non-finite number (`NaN`, `Infinity`, `-Infinity`), if any time
 *   is negative, if `times` is not strictly increasing, or if evaluation
 *   overflows to a non-finite value.
 */
export function laplaceTransformTypedIterative(values, times, sValues) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError('values must be a Float64Array')
	}
	if (!(times instanceof Float64Array)) {
		throw new TypeError('times must be a Float64Array')
	}
	if (!(sValues instanceof Float64Array)) {
		throw new TypeError('sValues must be a Float64Array')
	}

	const n = values.length
	if (n !== times.length) {
		throw new RangeError(
			`values and times must have the same length (got ${n} and ${times.length})`,
		)
	}

	for (let i = 0; i < n; i++) {
		const v = values[i]
		const t = times[i]
		if (!Number.isFinite(v)) {
			throw new RangeError(`values[${i}] must be a finite number`)
		}
		if (!Number.isFinite(t)) {
			throw new RangeError(`times[${i}] must be a finite number`)
		}
		if (t < 0) {
			throw new RangeError(`times[${i}] must be non-negative (got ${t})`)
		}
		if (i > 0 && t <= times[i - 1]) {
			throw new RangeError(
				`times must be strictly increasing at index ${i} (${times[i - 1]} >= ${t})`,
			)
		}
	}

	const m = sValues.length
	for (let k = 0; k < m; k++) {
		if (!Number.isFinite(sValues[k])) {
			throw new RangeError(`sValues[${k}] must be a finite number`)
		}
	}

	const result = new Float64Array(m)
	if (m === 0 || n < 2) {
		return result
	}

	for (let k = 0; k < m; k++) {
		const s = sValues[k]
		let prevT = times[0]
		let prevIntegrand = values[0] * Math.exp(-s * prevT)
		if (!Number.isFinite(prevIntegrand)) {
			throw new RangeError(
				`overflow evaluating integrand at s=${s}, t=${prevT}`,
			)
		}

		let acc = 0
		for (let i = 1; i < n; i++) {
			const currT = times[i]
			const currIntegrand = values[i] * Math.exp(-s * currT)
			if (!Number.isFinite(currIntegrand)) {
				throw new RangeError(
					`overflow evaluating integrand at s=${s}, t=${currT}`,
				)
			}

			acc += 0.5 * (prevIntegrand + currIntegrand) * (currT - prevT)
			if (!Number.isFinite(acc)) {
				throw new RangeError(`overflow accumulating integral at s=${s}`)
			}

			prevT = currT
			prevIntegrand = currIntegrand
		}

		result[k] = acc === 0 ? 0 : acc
	}

	return result
}
