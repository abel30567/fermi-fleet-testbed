/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal value (0th-order term).
 * @property {number} d - Forward-mode derivative (1st-order dual term).
 */

/**
 * Validates that the input is a non-empty array of finite dual numbers `{ v, d }`.
 *
 * @param {unknown} vec - Candidate dual vector.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `vec` is not an array or contains invalid dual number objects.
 * @throws {RangeError} If `vec` is empty or contains non-finite numeric components.
 */
function validateDualVector(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an array of dual numbers { v, d }`)
	}
	if (vec.length === 0) {
		throw new RangeError(`${name} must be a non-empty array`)
	}
	for (let i = 0; i < vec.length; i++) {
		const el = vec[i]
		if (el === null || typeof el !== 'object') {
			throw new TypeError(`${name}[${i}] must be a dual number object { v, d }`)
		}
		if (typeof el.v !== 'number' || typeof el.d !== 'number') {
			throw new TypeError(`${name}[${i}] must have numeric v and d properties`)
		}
		if (!Number.isFinite(el.v) || !Number.isFinite(el.d)) {
			throw new RangeError(`${name}[${i}] must have finite v and d values`)
		}
	}
}

/**
 * Computes the vector projection of dual vector `a` onto dual vector `b`:
 *
 *   proj_b(a) = ((a · b) / (b · b)) * b
 *
 * over first-order dual numbers `{ v, d }` (representing `v + d * ε` with `ε² = 0`),
 * carrying the exact forward-mode directional derivative alongside the primal value.
 *
 * Uses the closed-form dual quotient and product identities:
 *   p = a · b,  q = b · b,  s = p / q = (p_v / q_v, (p_d - s_v * q_d) / q_v),
 *   proj_b(a)_i = s * b_i = (s_v * b_{v,i}, s_d * b_{v,i} + s_v * b_{d,i}).
 *
 * @param {DualNumber[]} a - Dual vector to project.
 * @param {DualNumber[]} b - Non-zero dual target vector onto which `a` is projected.
 * @returns {DualNumber[]} Projected dual vector of the same dimension as `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not an array of `{ v, d }` objects with numeric fields.
 * @throws {RangeError} If `a` or `b` is empty, lengths differ, values are non-finite, or `b` has zero primal norm.
 */
export function projectionDualSeries(a, b) {
	validateDualVector(a, 'a')
	validateDualVector(b, 'b')

	const n = a.length
	if (n !== b.length) {
		throw new RangeError(`Vector dimension mismatch: a has length ${n}, b has length ${b.length}`)
	}

	let maxAbsB = 0
	for (let i = 0; i < n; i++) {
		const absV = Math.abs(b[i].v)
		if (absV > maxAbsB) {
			maxAbsB = absV
		}
	}

	if (maxAbsB === 0) {
		throw new RangeError('Cannot project onto a vector with zero primal norm')
	}

	// Scale b by an exact power of two for extreme magnitudes to prevent overflow/underflow in b · b.
	// Because the scale factor is constant with respect to the dual variable, proj_{c*b}(a) === proj_b(a).
	let scale = 1
	if (maxAbsB > 1e150 || maxAbsB < 1e-150) {
		const exp = Math.max(-1022, Math.min(1023, -Math.floor(Math.log2(maxAbsB))))
		scale = 2 ** exp
	}

	let pv = 0
	let pd = 0
	let qv = 0
	let qd = 0

	for (let i = 0; i < n; i++) {
		const av = a[i].v
		const ad = a[i].d
		const bv = b[i].v * scale
		const bd = b[i].d * scale

		pv += av * bv
		pd += ad * bv + av * bd
		qv += bv * bv
		qd += 2 * bv * bd
	}

	const sv = pv / qv
	const sd = (pd - sv * qd) / qv

	const result = new Array(n)
	for (let i = 0; i < n; i++) {
		const bv = b[i].v * scale
		const bd = b[i].d * scale
		const rv = sv * bv
		const rd = sd * bv + sv * bd
		result[i] = {
			v: rv === 0 ? 0 : rv,
			d: rd === 0 ? 0 : rd,
		}
	}

	return result
}
