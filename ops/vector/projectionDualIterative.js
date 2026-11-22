/**
 * @typedef {Object} DualNumber
 * @property {number} v Primal value (finite real number).
 * @property {number} d Forward-mode derivative (finite real number).
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric fields.
 *
 * @param {unknown} value Candidate dual number.
 * @param {string} name Parameter name for error reporting.
 * @param {number} index Element index for error reporting.
 * @throws {TypeError} If the element is not an object with finite numeric `v` and `d` properties.
 */
function assertDualNumber(value, name, index) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(
			`${name}[${index}] must be a dual number object { v, d }`
		);
	}
	if (typeof value.v !== 'number' || !Number.isFinite(value.v)) {
		throw new TypeError(
			`${name}[${index}].v must be a finite number`
		);
	}
	if (typeof value.d !== 'number' || !Number.isFinite(value.d)) {
		throw new TypeError(
			`${name}[${index}].d must be a finite number`
		);
	}
}

/**
 * Multiplies two dual numbers: (a.v, a.d) * (b.v, b.d) = (a.v * b.v, a.v * b.d + a.d * b.v).
 *
 * @param {DualNumber} a First dual operand.
 * @param {DualNumber} b Second dual operand.
 * @returns {DualNumber} Product as a dual number.
 */
function dualMul(a, b) {
	return {
		v: a.v * b.v,
		d: a.v * b.d + a.d * b.v,
	};
}

/**
 * Divides two dual numbers: (a.v, a.d) / (b.v, b.d).
 * Assumes `b.v !== 0`.
 *
 * @param {DualNumber} a Numerator dual number.
 * @param {DualNumber} b Denominator dual number with non-zero primal part.
 * @returns {DualNumber} Quotient as a dual number.
 */
function dualDiv(a, b) {
	const v = a.v / b.v;
	const d = (a.d - v * b.d) / b.v;
	return { v, d };
}

/**
 * Computes the vector projection of dual vector `u` onto dual vector `onto`
 * using a straightforward iterative implementation in forward-mode dual arithmetic:
 *
 *   proj_onto(u) = ((u · onto) / (onto · onto)) * onto
 *
 * Each vector element is a dual number `{ v, d }` carrying a primal value `v`
 * and its forward-mode derivative `d`.
 *
 * @param {DualNumber[]} u Dual vector to be projected.
 * @param {DualNumber[]} onto Non-zero dual vector onto which `u` is projected.
 * @returns {DualNumber[]} Projected dual vector of the same length as `u` and `onto`.
 * @throws {TypeError} If `u` or `onto` is not an array, or any element is not a valid finite dual number `{ v, d }`.
 * @throws {RangeError} If either vector is empty, vector lengths differ, or `onto` has zero primal squared norm.
 */
export function projectionDualIterative(u, onto) {
	if (!Array.isArray(u)) {
		throw new TypeError('u must be an array of dual numbers');
	}
	if (!Array.isArray(onto)) {
		throw new TypeError('onto must be an array of dual numbers');
	}

	const n = u.length;
	if (n === 0 || onto.length === 0) {
		throw new RangeError('u and onto must be non-empty arrays');
	}
	if (n !== onto.length) {
		throw new RangeError(
			`u and onto must have the same length (got ${n} and ${onto.length})`
		);
	}

	let numV = 0;
	let numD = 0;
	let denV = 0;
	let denD = 0;

	for (let i = 0; i < n; i++) {
		const ui = u[i];
		const bi = onto[i];
		assertDualNumber(ui, 'u', i);
		assertDualNumber(bi, 'onto', i);

		const uDotB = dualMul(ui, bi);
		numV += uDotB.v;
		numD += uDotB.d;

		const bDotB = dualMul(bi, bi);
		denV += bDotB.v;
		denD += bDotB.d;
	}

	if (denV === 0) {
		throw new RangeError(
			'onto must have a non-zero primal norm (dot(onto, onto).v === 0)'
		);
	}

	const s = dualDiv({ v: numV, d: numD }, { v: denV, d: denD });

	const result = new Array(n);
	for (let i = 0; i < n; i++) {
		result[i] = dualMul(s, onto[i]);
	}

	return result;
}
