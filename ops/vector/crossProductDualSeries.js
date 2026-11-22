/**
 * @typedef {{ v: number, d: number }} DualNumber
 * A forward-mode dual number `v + ε·d` where `ε² = 0`, representing a real
 * value `v` (primal) paired with its first-order directional derivative `d`
 * (tangent).
 */

/**
 * Normalizes `-0` to `+0` while leaving all other numeric values unchanged.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Validates that `vec` is a 3-element array of finite dual numbers `{ v, d }`.
 *
 * @param {unknown} vec - Candidate 3D dual vector.
 * @param {string} name - Parameter name for error diagnostics.
 * @throws {TypeError} If `vec` is not an array, an element is not a plain-like
 *   object, or `.v`/`.d` is not a number.
 * @throws {RangeError} If `vec.length !== 3` or any `.v`/`.d` is non-finite.
 */
function assertDualVector3(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an array of 3 dual numbers { v, d }`)
	}
	if (vec.length !== 3) {
		throw new RangeError(`${name} must have length 3, received ${vec.length}`)
	}
	for (let i = 0; i < 3; i++) {
		const el = vec[i]
		if (el === null || typeof el !== 'object' || Array.isArray(el)) {
			throw new TypeError(`${name}[${i}] must be a dual number object { v, d }`)
		}
		if (typeof el.v !== 'number') {
			throw new TypeError(`${name}[${i}].v must be a finite number`)
		}
		if (!Number.isFinite(el.v)) {
			throw new RangeError(`${name}[${i}].v must be finite`)
		}
		if (typeof el.d !== 'number') {
			throw new TypeError(`${name}[${i}].d must be a finite number`)
		}
		if (!Number.isFinite(el.d)) {
			throw new RangeError(`${name}[${i}].d must be finite`)
		}
	}
}

/**
 * Computes the standard 3D real cross product `u × w`.
 *
 * @param {number} u0
 * @param {number} u1
 * @param {number} u2
 * @param {number} w0
 * @param {number} w1
 * @param {number} w2
 * @returns {[number, number, number]}
 */
function cross3(u0, u1, u2, w0, w1, w2) {
	return [
		u1 * w2 - u2 * w1,
		u2 * w0 - u0 * w2,
		u0 * w1 - u1 * w0,
	]
}

/**
 * Computes the 3D vector cross product over dual numbers `{ v, d }` using the
 * first-order dual-series / Leibniz product identity.
 *
 * Treating each 3D dual vector as a truncated power series in the nilpotent
 * infinitesimal `ε` (`ε² = 0`):
 *
 *     a(ε) = a_v + ε · a_d
 *     b(ε) = b_v + ε · b_d
 *
 * Bilinearity of the cross product yields the exact closed-form expansion:
 *
 *     (a × b)(ε) = (a_v × b_v) + ε · (a_v × b_d + a_d × b_v)
 *
 * @param {readonly [DualNumber, DualNumber, DualNumber]} a - First 3D dual vector.
 * @param {readonly [DualNumber, DualNumber, DualNumber]} b - Second 3D dual vector.
 * @returns {[DualNumber, DualNumber, DualNumber]} Resulting 3D dual vector `a × b`.
 * @throws {TypeError} If `a` or `b` is not an array of dual number objects with numeric `v` and `d`.
 * @throws {RangeError} If `a` or `b` does not have length 3 or contains non-finite numbers.
 */
export function crossProductDualSeries(a, b) {
	assertDualVector3(a, 'a')
	assertDualVector3(b, 'b')

	const [a0, a1, a2] = a
	const [b0, b1, b2] = b

	// Primal term: a_v × b_v
	const primal = cross3(a0.v, a1.v, a2.v, b0.v, b1.v, b2.v)

	// Tangent (Leibniz) terms: (a_v × b_d) + (a_d × b_v)
	const avCrossBd = cross3(a0.v, a1.v, a2.v, b0.d, b1.d, b2.d)
	const adCrossBv = cross3(a0.d, a1.d, a2.d, b0.v, b1.v, b2.v)

	return [
		{ v: normalizeZero(primal[0]), d: normalizeZero(avCrossBd[0] + adCrossBv[0]) },
		{ v: normalizeZero(primal[1]), d: normalizeZero(avCrossBd[1] + adCrossBv[1]) },
		{ v: normalizeZero(primal[2]), d: normalizeZero(avCrossBd[2] + adCrossBv[2]) },
	]
}
