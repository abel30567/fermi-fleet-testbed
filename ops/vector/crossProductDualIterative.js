/**
 * @typedef {Object} Dual
 * @property {number} v - Primal value (finite number).
 * @property {number} d - Forward-mode derivative value (finite number).
 */

/**
 * Validates that a value is a 3-element array of finite dual numbers `{ v, d }`.
 *
 * @param {unknown} vec - Candidate 3D dual vector.
 * @param {string} name - Parameter name for descriptive error messages.
 * @throws {TypeError} If `vec` is not an array or any element is not a `{ v, d }` object with numeric fields.
 * @throws {RangeError} If `vec.length !== 3` or any `v`/`d` field is not a finite number.
 */
function validateDualVector3(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an array of 3 dual numbers { v, d }`)
	}
	if (vec.length !== 3) {
		throw new RangeError(`${name} must have length 3, got ${vec.length}`)
	}
	for (let i = 0; i < 3; i += 1) {
		const el = vec[i]
		if (typeof el !== 'object' || el === null || Array.isArray(el)) {
			throw new TypeError(`${name}[${i}] must be a dual number object { v, d }`)
		}
		if (typeof el.v !== 'number' || typeof el.d !== 'number') {
			throw new TypeError(`${name}[${i}] must have numeric properties v and d`)
		}
		if (!Number.isFinite(el.v) || !Number.isFinite(el.d)) {
			throw new RangeError(`${name}[${i}] properties v and d must be finite numbers`)
		}
	}
}

/**
 * Multiplies two dual numbers: `(x.v + x.d * ε) * (y.v + y.d * ε)`.
 *
 * @param {Dual} x
 * @param {Dual} y
 * @returns {Dual}
 */
function dualMul(x, y) {
	return {
		v: x.v * y.v,
		d: x.v * y.d + x.d * y.v,
	}
}

/**
 * Subtracts two dual numbers: `x - y`.
 *
 * @param {Dual} x
 * @param {Dual} y
 * @returns {Dual}
 */
function dualSub(x, y) {
	const v = x.v - y.v
	const d = x.d - y.d
	return {
		v: v === 0 ? 0 : v,
		d: d === 0 ? 0 : d,
	}
}

/**
 * Computes the 3D vector cross product `a × b` over dual numbers `{ v, d }`
 * using a straightforward iterative loop over cyclic indices.
 *
 * Each input is a 3-element array of dual numbers where `v` is the primal value
 * and `d` is the forward-mode derivative. The output carries both the primal
 * cross product `a.v × b.v` and its exact forward-mode derivative
 * `a.d × b.v + a.v × b.d`.
 *
 * @param {Dual[]} a - First 3D dual vector (length 3).
 * @param {Dual[]} b - Second 3D dual vector (length 3).
 * @returns {Dual[]} Resulting 3D dual vector `a × b` (length 3).
 * @throws {TypeError} If `a` or `b` is not an array or contains invalid dual elements.
 * @throws {RangeError} If `a` or `b` does not have length 3 or contains non-finite numbers.
 */
export function crossProductDualIterative(a, b) {
	validateDualVector3(a, 'a')
	validateDualVector3(b, 'b')

	const res = new Array(3)
	for (let i = 0; i < 3; i += 1) {
		const j = (i + 1) % 3
		const k = (i + 2) % 3
		res[i] = dualSub(dualMul(a[j], b[k]), dualMul(a[k], b[j]))
	}
	return res
}
