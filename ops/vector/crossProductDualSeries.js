/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal value (finite real number).
 * @property {number} d - Forward-mode derivative / tangent part (finite real number).
 */

/**
 * Normalize negative zero (`-0`) to positive zero (`0`).
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Validate that a value is a 3D vector of finite dual numbers `{ v, d }`.
 *
 * @param {unknown} vec
 * @param {string} name
 * @returns {readonly [DualNumber, DualNumber, DualNumber]}
 */
function validateDualVector3(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an array of 3 dual numbers { v, d }`)
	}
	if (vec.length !== 3) {
		throw new RangeError(`${name} must have length 3, received ${vec.length}`)
	}
	for (let i = 0; i < 3; i++) {
		const el = vec[i]
		if (el === null || typeof el !== 'object') {
			throw new TypeError(`${name}[${i}] must be a dual number object { v, d }`)
		}
		if (typeof el.v !== 'number' || typeof el.d !== 'number') {
			throw new TypeError(`${name}[${i}].v and ${name}[${i}].d must be numbers`)
		}
		if (!Number.isFinite(el.v) || !Number.isFinite(el.d)) {
			throw new RangeError(`${name}[${i}].v and ${name}[${i}].d must be finite numbers`)
		}
	}
	return vec
}

/**
 * Compute a single component `(a_j * b_k - a_k * b_j)` over dual numbers
 * using the exact truncated Taylor series in ε (ε² = 0) / Leibniz identity:
 *   (a_j + a_j'ε)(b_k + b_k'ε) - (a_k + a_k'ε)(b_j + b_j'ε)
 *   = (a_j b_k - a_k b_j) + (a_j' b_k + a_j b_k' - a_k' b_j - a_k b_j') ε
 *
 * @param {DualNumber} aj
 * @param {DualNumber} ak
 * @param {DualNumber} bj
 * @param {DualNumber} bk
 * @returns {DualNumber}
 */
function dualCrossComponent(aj, ak, bj, bk) {
	const v = normalizeZero(aj.v * bk.v - ak.v * bj.v)
	const d = normalizeZero(aj.d * bk.v + aj.v * bk.d - ak.d * bj.v - ak.v * bj.d)
	return { v, d }
}

/**
 * Compute the 3D vector cross product over dual numbers `{ v, d }`, carrying the
 * forward-mode derivative alongside the primal value.
 *
 * Treating each 3D dual vector as a first-order series in the nilpotent
 * infinitesimal ε (ε² = 0), `a(ε) = a_v + ε a_d` and `b(ε) = b_v + ε b_d`,
 * bilinearity of the cross product gives the exact closed-form identity:
 *
 *   a(ε) × b(ε) = (a_v × b_v) + ε (a_d × b_v + a_v × b_d)
 *
 * @param {readonly [DualNumber, DualNumber, DualNumber]} a - First 3D vector of dual numbers `{ v, d }`.
 * @param {readonly [DualNumber, DualNumber, DualNumber]} b - Second 3D vector of dual numbers `{ v, d }`.
 * @returns {[DualNumber, DualNumber, DualNumber]} Resulting 3D vector of dual numbers `{ v, d }`.
 * @throws {TypeError} If either argument is not an array of `{ v, d }` dual number objects with numeric fields.
 * @throws {RangeError} If either vector does not have length 3 or contains non-finite values.
 */
export function crossProductDualSeries(a, b) {
	const [a0, a1, a2] = validateDualVector3(a, 'a')
	const [b0, b1, b2] = validateDualVector3(b, 'b')

	return [
		dualCrossComponent(a1, a2, b1, b2),
		dualCrossComponent(a2, a0, b2, b0),
		dualCrossComponent(a0, a1, b0, b1),
	]
}
