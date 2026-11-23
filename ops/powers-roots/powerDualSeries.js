/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal (function) value.
 * @property {number} d - Forward-mode derivative (dual/tangent component).
 */

const MIN_NORMAL = 2.2250738585072014e-308;

/**
 * Normalizes -0 to +0 to keep dual-number outputs canonical.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x;
}

/**
 * Validates and normalizes an argument into a finite dual number { v, d }.
 * Accepts either a dual number object { v, d } or a finite real scalar (treated as { v: x, d: 0 }).
 *
 * @param {DualNumber | number} input
 * @param {string} name
 * @returns {DualNumber}
 */
function toDual(input, name) {
	if (typeof input === 'number') {
		if (!Number.isFinite(input)) {
			throw new RangeError(`${name} must be a finite number`);
		}
		return { v: normalizeZero(input), d: 0 };
	}

	if (input === null || typeof input !== 'object' || Array.isArray(input)) {
		throw new TypeError(`${name} must be a finite number or a dual number { v, d }`);
	}

	const { v, d } = input;
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`${name} must have numeric v and d properties`);
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`${name} components v and d must be finite numbers`);
	}

	return { v: normalizeZero(v), d: normalizeZero(d) };
}

/**
 * Computes ln(a) with improved precision when a is close to 1.
 *
 * @param {number} a - Strictly positive finite number.
 * @returns {number}
 */
function safeLog(a) {
	return a >= 0.5 && a <= 1.5 ? Math.log1p(a - 1) : Math.log(a);
}

/**
 * Raises a dual number base to a dual number (or real scalar) exponent:
 *   (a + a'ε)^(b + b'ε)
 * where ε² = 0 carries the forward-mode first derivative.
 *
 * Mathematical basis (closed-form / first-order Taylor series in ε):
 * - For a > 0, using A^B = exp(B * ln(A)) with
 *   ln(a + a'ε) = ln(a) + (a'/a)ε and exp(u + u'ε) = e^u (1 + u'ε):
 *     v = a^b
 *     d = b * a^(b - 1) * a' + a^b * ln(a) * b'
 * - For a < 0 with integer b and b' = 0, by the truncated binomial series:
 *     (a + a'ε)^b = a^b + b * a^(b - 1) * a'ε
 * - For a = 0, limiting / exact power-rule cases are handled when finite and well-defined.
 *
 * @param {DualNumber | number} base - Dual number { v, d } or finite scalar base.
 * @param {DualNumber | number} exponent - Dual number { v, d } or finite scalar exponent.
 * @returns {DualNumber} Resulting dual number { v, d }.
 * @throws {TypeError} If base or exponent is not a number or dual number object { v, d }.
 * @throws {RangeError} If inputs are non-finite, outside the real differentiable domain,
 *   or if the result overflows to a non-finite value.
 */
export function powerDualSeries(base, exponent) {
	const { v: a, d: da } = toDual(base, 'base');
	const { v: b, d: db } = toDual(exponent, 'exponent');

	let v;
	let d;

	if (a > 0) {
		v = Math.pow(a, b);
		if (!Number.isFinite(v)) {
			throw new RangeError('powerDualSeries primal value overflowed to non-finite');
		}

		let daTerm = 0;
		if (da !== 0 && b !== 0) {
			if (b === 1) {
				daTerm = da;
			} else if (b === 2) {
				daTerm = 2 * a * da;
			} else {
				const powMinus1 = Math.abs(v) >= MIN_NORMAL ? v / a : Math.pow(a, b - 1);
				daTerm = b * powMinus1 * da;
			}
		}

		let dbTerm = 0;
		if (db !== 0 && a !== 1) {
			dbTerm = v * safeLog(a) * db;
		}

		d = daTerm + dbTerm;
	} else if (a === 0) {
		if (b < 0) {
			throw new RangeError('Zero base cannot be raised to a negative exponent');
		}
		if (b === 0) {
			if (db !== 0) {
				throw new RangeError('Derivative with respect to exponent is undefined for 0^0');
			}
			v = 1;
			d = 0;
		} else if (b < 1) {
			if (da !== 0) {
				throw new RangeError('Derivative with respect to base is singular at 0 for 0 < exponent < 1');
			}
			v = 0;
			d = 0;
		} else if (b === 1) {
			v = 0;
			d = da;
		} else {
			v = 0;
			d = 0;
		}
	} else {
		// a < 0
		if (!Number.isInteger(b)) {
			throw new RangeError('Negative base requires an integer exponent for real dual numbers');
		}
		if (db !== 0) {
			throw new RangeError('Derivative with respect to exponent is not real-valued for a negative base');
		}

		v = Math.pow(a, b);
		if (!Number.isFinite(v)) {
			throw new RangeError('powerDualSeries primal value overflowed to non-finite');
		}

		if (da === 0 || b === 0) {
			d = 0;
		} else if (b === 1) {
			d = da;
		} else if (b === 2) {
			d = 2 * a * da;
		} else {
			const powMinus1 = Math.abs(v) >= MIN_NORMAL ? v / a : Math.pow(a, b - 1);
			d = b * powMinus1 * da;
		}
	}

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('powerDualSeries result overflowed to non-finite');
	}

	return {
		v: normalizeZero(v),
		d: normalizeZero(d),
	};
}
