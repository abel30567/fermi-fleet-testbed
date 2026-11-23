/**
 * @typedef {{ v: number, d: number }} DualNumber
 * A dual number representing a primal value `v` and its forward-mode
 * derivative `d` (i.e., `v + d * ε` with `ε² = 0`).
 */

/**
 * Validates that an argument is a 3-element array of finite dual numbers `{ v, d }`.
 *
 * @param {unknown} vec - Candidate 3D dual-number vector.
 * @param {string} name - Parameter name for descriptive error messages.
 * @throws {TypeError} If `vec` is not an array, or any element is not a `{ v, d }` object with numeric fields.
 * @throws {RangeError} If `vec` does not have length 3, or any `v`/`d` component is not finite.
 */
function validateDualVector3(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an array of 3 dual numbers`);
	}
	if (vec.length !== 3) {
		throw new RangeError(`${name} must have length 3, got ${vec.length}`);
	}
	for (let i = 0; i < 3; i++) {
		const el = vec[i];
		if (typeof el !== 'object' || el === null || Array.isArray(el)) {
			throw new TypeError(`${name}[${i}] must be a dual number object { v, d }`);
		}
		if (typeof el.v !== 'number' || typeof el.d !== 'number') {
			throw new TypeError(`${name}[${i}] must have numeric 'v' and 'd' properties`);
		}
		if (!Number.isFinite(el.v) || !Number.isFinite(el.d)) {
			throw new RangeError(`${name}[${i}] must have finite 'v' and 'd' values`);
		}
	}
}

/**
 * Computes the 3D vector cross product `a × b` over dual numbers `{ v, d }`,
 * propagating both primal values and forward-mode derivatives iteratively.
 *
 * For each component `i ∈ {0, 1, 2}` with cyclic indices `j = (i + 1) % 3`
 * and `k = (i + 2) % 3`:
 * - Primal value: `(a × b)[i].v = a[j].v * b[k].v - a[k].v * b[j].v`
 * - Derivative: `(a × b)[i].d = (a[j].v * b[k].d + a[j].d * b[k].v) - (a[k].v * b[j].d + a[k].d * b[j].v)`
 *
 * @param {[DualNumber, DualNumber, DualNumber]} a - First 3D vector of dual numbers.
 * @param {[DualNumber, DualNumber, DualNumber]} b - Second 3D vector of dual numbers.
 * @returns {[DualNumber, DualNumber, DualNumber]} The resulting 3D dual-number cross product vector.
 * @throws {TypeError} If `a` or `b` is not an array or contains invalid dual number objects.
 * @throws {RangeError} If `a` or `b` does not have length 3 or contains non-finite numbers.
 */
export function crossProductDualIterative(a, b) {
	validateDualVector3(a, 'a');
	validateDualVector3(b, 'b');

	const result = new Array(3);

	for (let i = 0; i < 3; i++) {
		const j = (i + 1) % 3;
		const k = (i + 2) % 3;

		const aj = a[j];
		const ak = a[k];
		const bj = b[j];
		const bk = b[k];

		const v1 = aj.v * bk.v;
		const d1 = aj.v * bk.d + aj.d * bk.v;

		const v2 = ak.v * bj.v;
		const d2 = ak.v * bj.d + ak.d * bj.v;

		const v = v1 - v2;
		const d = d1 - d2;

		result[i] = {
			v: v === 0 ? 0 : v,
			d: d === 0 ? 0 : d,
		};
	}

	return result;
}
