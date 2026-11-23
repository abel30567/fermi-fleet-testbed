/**
 * @typedef {object} Dual
 * @property {number} v - Primal value component.
 * @property {number} d - Forward-mode derivative (tangent) component.
 */

/**
 * Maximum absolute integer exponent permitted by the straightforward O(|n|)
 * iterative implementation, guarding against runaway loop counts.
 */
const MAX_EXPONENT = 1_000_000;

/**
 * Normalizes IEEE 754 negative zero (-0) to positive zero (0).
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x;
}

/**
 * Validates that an input is a finite dual number `{ v, d }`.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {Dual}
 */
function validateDual(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be a dual number object { v, d }`);
	}
	const { v, d } = /** @type {{ v: unknown, d: unknown }} */ (value);
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`${name}.v and ${name}.d must be numbers`);
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`${name}.v and ${name}.d must be finite numbers`);
	}
	return { v, d };
}

/**
 * Validates an integer exponent provided either as a plain number or as a dual
 * number `{ v, d }` whose primal value `v` is an integer.
 *
 * @param {unknown} exponent
 * @returns {Dual}
 */
function validateExponent(exponent) {
	if (typeof exponent === 'number') {
		if (!Number.isInteger(exponent)) {
			throw new RangeError('exponent must be a finite integer');
		}
		if (Math.abs(exponent) > MAX_EXPONENT) {
			throw new RangeError(
				`exponent magnitude must not exceed ${MAX_EXPONENT}`
			);
		}
		return { v: exponent, d: 0 };
	}

	const dualExp = validateDual(exponent, 'exponent');
	if (!Number.isInteger(dualExp.v)) {
		throw new RangeError('exponent.v must be a finite integer');
	}
	if (Math.abs(dualExp.v) > MAX_EXPONENT) {
		throw new RangeError(
			`exponent.v magnitude must not exceed ${MAX_EXPONENT}`
		);
	}
	return dualExp;
}

/**
 * Multiplies two dual numbers:
 * (a.v + a.d * ε) * (b.v + b.d * ε) = (a.v * b.v) + (a.v * b.d + a.d * b.v) * ε.
 *
 * @param {Dual} a
 * @param {Dual} b
 * @returns {Dual}
 */
function multiplyDual(a, b) {
	return {
		v: a.v * b.v,
		d: a.v * b.d + a.d * b.v,
	};
}

/**
 * Computes the multiplicative inverse of a dual number with non-zero value:
 * 1 / (v + d * ε) = (1 / v) + (-d / v^2) * ε.
 * Uses `-(d / v) / v` to avoid premature overflow of `v * v`.
 *
 * @param {Dual} x
 * @returns {Dual}
 */
function invertDual(x) {
	const v = 1 / x.v;
	const d = -(x.d / x.v) / x.v;
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(
			'Reciprocal of dual base overflowed to a non-finite value'
		);
	}
	return { v, d };
}

/**
 * Raises a dual number `{ v, d }` (carrying a forward-mode derivative alongside
 * its value) to an integer power using a straightforward iterative loop of dual
 * multiplications.
 *
 * The exponent may be passed either as a plain integer `number` or as a dual
 * number `{ v, d }` with an integer `v`. When `exponent.d !== 0`, the derivative
 * contribution from the exponent (`base.v^exponent.v * exponent.d * ln(base.v)`)
 * is added via the product rule, requiring `base.v > 0`.
 *
 * Complexity: O(|exponent|) time, O(1) space.
 *
 * @param {Dual} base - Dual number `{ v, d }` with finite `v` and `d`.
 * @param {number | Dual} exponent - Finite integer (|n| <= 1_000_000) or dual
 *   number `{ v, d }` with finite integer `v` (|v| <= 1_000_000) and finite `d`.
 * @returns {Dual} The resulting dual number `{ v, d }`.
 * @throws {TypeError} If `base` or `exponent` has an invalid type or missing fields.
 * @throws {RangeError} If components are non-finite, exponent is non-integer or
 *   exceeds the iteration bound, `base.v === 0` with a negative exponent,
 *   `base.v <= 0` with a non-zero exponent derivative, or computation overflows.
 */
export function powerDualIterative(base, exponent) {
	const a = validateDual(base, 'base');
	const exp = validateExponent(exponent);

	const n = exp.v;
	const expD = exp.d;

	if (n < 0 && a.v === 0) {
		throw new RangeError(
			'Cannot raise a dual number with zero value to a negative exponent'
		);
	}
	if (expD !== 0 && a.v <= 0) {
		throw new RangeError(
			'Cannot compute derivative with respect to exponent when base.v <= 0'
		);
	}

	let acc = { v: 1, d: 0 };

	if (n !== 0) {
		const step = n > 0 ? a : invertDual(a);
		const iterations = Math.abs(n);

		for (let i = 0; i < iterations; i += 1) {
			acc = multiplyDual(acc, step);
			if (!Number.isFinite(acc.v) || !Number.isFinite(acc.d)) {
				throw new RangeError(
					'Dual power computation overflowed to a non-finite value'
				);
			}
			if (acc.v === 0 && acc.d === 0) {
				break;
			}
		}
	}

	if (expD !== 0) {
		const d = acc.d + acc.v * expD * Math.log(a.v);
		if (!Number.isFinite(d)) {
			throw new RangeError(
				'Dual power derivative overflowed to a non-finite value'
			);
		}
		acc = { v: acc.v, d };
	}

	return {
		v: normalizeZero(acc.v),
		d: normalizeZero(acc.d),
	};
}
