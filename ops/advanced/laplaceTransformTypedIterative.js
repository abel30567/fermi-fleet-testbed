/**
 * Computes the numerical unilateral Laplace transform element-wise over a
 * `Float64Array` of query frequencies `s`, using a straightforward iterative
 * trapezoidal quadrature over `Float64Array` inputs:
 *
 *   F(s) = ∫ f(t) * exp(-s * t) dt
 *
 * Supports either an explicit strictly increasing sample-time grid
 * (`times: Float64Array` with `t >= 0`) or a uniform positive step size
 * (`dt: number`, corresponding to `t_i = i * dt`).
 *
 * @param {Float64Array} values - Sampled function values f(t_i). All entries must be finite.
 * @param {Float64Array | number} timesOrDt - Either a `Float64Array` of strictly increasing,
 *   non-negative, finite sample times with the same length as `values`, or a finite positive
 *   uniform time step `dt`.
 * @param {Float64Array} sValues - Query Laplace frequencies s_k. All entries must be finite.
 * @returns {Float64Array} Evaluated Laplace transform values F(s_k) with length `sValues.length`.
 * @throws {TypeError} If `values` or `sValues` is not a `Float64Array`, or `timesOrDt` is
 *   neither a `Float64Array` nor a `number`.
 * @throws {RangeError} If lengths mismatch, `dt` is not a finite positive number, any input
 *   contains non-finite values, or `times` contains negative or non-strictly-increasing values.
 */
export function laplaceTransformTypedIterative(values, timesOrDt, sValues) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError('values must be a Float64Array')
	}

	const isTimesArray = timesOrDt instanceof Float64Array
	const isUniformStep = typeof timesOrDt === 'number'
	if (!isTimesArray && !isUniformStep) {
		throw new TypeError('timesOrDt must be a Float64Array or a number')
	}

	if (!(sValues instanceof Float64Array)) {
		throw new TypeError('sValues must be a Float64Array')
	}

	const n = values.length
	const m = sValues.length

	if (isUniformStep) {
		if (!Number.isFinite(timesOrDt) || timesOrDt <= 0) {
			throw new RangeError('dt must be a finite positive number')
		}
	} else {
		if (timesOrDt.length !== n) {
			throw new RangeError('times and values must have the same length')
		}
		for (let i = 0; i < n; i++) {
			const t = timesOrDt[i]
			if (!Number.isFinite(t)) {
				throw new RangeError(`times[${i}] must be a finite number`)
			}
			if (t < 0) {
				throw new RangeError(`times[${i}] must be non-negative`)
			}
			if (i > 0 && t <= timesOrDt[i - 1]) {
				throw new RangeError(`times must be strictly increasing (failed at index ${i})`)
			}
		}
	}

	for (let i = 0; i < n; i++) {
		if (!Number.isFinite(values[i])) {
			throw new RangeError(`values[${i}] must be a finite number`)
		}
	}

	for (let k = 0; k < m; k++) {
		if (!Number.isFinite(sValues[k])) {
			throw new RangeError(`sValues[${k}] must be a finite number`)
		}
	}

	const result = new Float64Array(m)
	if (m === 0 || n < 2) {
		return result
	}

	if (isUniformStep) {
		const dt = timesOrDt
		const lastIdx = n - 1
		const lastT = lastIdx * dt

		for (let k = 0; k < m; k++) {
			const s = sValues[k]
			const firstVal = values[0]
			const lastSample = values[lastIdx]
			const lastVal = lastSample === 0 ? 0 : lastSample * Math.exp(-s * lastT)

			let acc = 0.5 * (firstVal + lastVal)
			for (let i = 1; i < lastIdx; i++) {
				const sample = values[i]
				if (sample !== 0) {
					acc += sample * Math.exp(-s * (i * dt))
				}
			}

			result[k] = acc * dt
		}
	} else {
		const times = timesOrDt

		for (let k = 0; k < m; k++) {
			const s = sValues[k]
			let sum = 0
			let prevT = times[0]
			const firstSample = values[0]
			let prevVal = firstSample === 0 ? 0 : firstSample * Math.exp(-s * prevT)

			for (let i = 1; i < n; i++) {
				const currT = times[i]
				const sample = values[i]
				const currVal = sample === 0 ? 0 : sample * Math.exp(-s * currT)
				sum += 0.5 * (prevVal + currVal) * (currT - prevT)
				prevT = currT
				prevVal = currVal
			}

			result[k] = sum
		}
	}

	return result
}
