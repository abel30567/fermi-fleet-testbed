/**
 * Computes the unilateral Laplace transform element-wise over a `Float64Array`
 * of real frequency parameters `s` for a causal time-domain function given by a
 * finite power series with optional exponential frequency shift and Heaviside
 * time delay:
 *
 * ```
 * f(t) = u(t - delay) * exp(shift * (t - delay)) * sum_{n=0}^{N-1} coeffs[n] * (t - delay)^n
 * ```
 *
 * Using the linearity, monomial (`L{t^n}(s) = n! / s^{n+1}`), frequency-shift
 * (`L{e^{a t} g(t)}(s) = G(s - a)`), and time-shift
 * (`L{u(t - d) g(t - d)}(s) = e^{-d s} G(s)`) identities, the closed-form
 * transform is:
 *
 * ```
 * F(s) = exp(-delay * s) * sum_{n=0}^{N-1} coeffs[n] * n! / (s - shift)^(n + 1)
 * ```
 *
 * for every `s > shift`. Evaluation uses a backward Horner-style recurrence in
 * `(s - shift)` to avoid intermediate factorial overflow and minimize rounding
 * error.
 *
 * @param {Float64Array} sValues - Real Laplace variable values `s`, each strictly greater than `options.shift`.
 * @param {Float64Array} coeffs - Finite power-series coefficients `[c_0, c_1, ..., c_{N-1}]`.
 * @param {object} [options] - Optional transform parameters.
 * @param {number} [options.shift=0] - Finite exponential frequency shift `a` (requires `s > shift`).
 * @param {number} [options.delay=0] - Non-negative finite time delay `d >= 0`.
 * @returns {Float64Array} New `Float64Array` of `F(s_i)` values matching the length of `sValues`.
 * @throws {TypeError} If `sValues` or `coeffs` is not a `Float64Array`, or `options` / its fields have invalid types.
 * @throws {RangeError} If any coefficient, `s` value, `shift`, or `delay` is non-finite, `delay < 0`, or any `s <= shift`.
 */
export function laplaceTransformTypedSeries(sValues, coeffs, options = {}) {
	if (!(sValues instanceof Float64Array)) {
		throw new TypeError('sValues must be a Float64Array')
	}
	if (!(coeffs instanceof Float64Array)) {
		throw new TypeError('coeffs must be a Float64Array')
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be an object')
	}

	const { shift = 0, delay = 0 } = options

	if (typeof shift !== 'number') {
		throw new TypeError('options.shift must be a number')
	}
	if (!Number.isFinite(shift)) {
		throw new RangeError('options.shift must be a finite number')
	}
	if (typeof delay !== 'number') {
		throw new TypeError('options.delay must be a number')
	}
	if (!Number.isFinite(delay) || delay < 0) {
		throw new RangeError('options.delay must be a finite non-negative number')
	}

	let lastNonZero = -1
	for (let n = 0; n < coeffs.length; n++) {
		const c = coeffs[n]
		if (!Number.isFinite(c)) {
			throw new RangeError(`coeffs[${n}] must be a finite number`)
		}
		if (c !== 0) {
			lastNonZero = n
		}
	}

	const len = sValues.length
	const out = new Float64Array(len)

	for (let i = 0; i < len; i++) {
		const s = sValues[i]
		if (!Number.isFinite(s)) {
			throw new RangeError(`sValues[${i}] must be a finite number`)
		}
		const u = s - shift
		if (!(u > 0)) {
			throw new RangeError(
				`sValues[${i}] (${s}) must be strictly greater than shift (${shift})`,
			)
		}

		if (lastNonZero < 0) {
			out[i] = 0
			continue
		}

		// Backward Horner evaluation of sum_{n=0}^{lastNonZero} c_n * n! / u^{n+1}:
		//   acc = c_{lastNonZero}
		//   for n = lastNonZero - 1 .. 0: acc = c_n + (n + 1) * acc / u
		//   value = acc / u
		let acc = coeffs[lastNonZero]
		for (let n = lastNonZero - 1; n >= 0; n--) {
			acc = coeffs[n] + ((n + 1) * acc) / u
		}

		let val = acc / u
		if (delay > 0) {
			val = val === 0 ? 0 : Math.exp(-delay * s) * val
		}
		out[i] = val === 0 ? 0 : val
	}

	return out
}
