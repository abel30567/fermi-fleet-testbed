/**
 * @typedef {{ v: number, d: number }} DualNumber
 * A dual number `v + d*ε` (with `ε² = 0`) representing a primal value `v`
 * and its forward-mode directional derivative `d`.
 */

const MAX_ITERATIONS = 100;

/**
 * Adds two dual numbers: `(a.v + b.v, a.d + b.d)`.
 * @param {DualNumber} a
 * @param {DualNumber} b
 * @returns {DualNumber}
 */
function dualAdd(a, b) {
	return {
		v: a.v + b.v,
		d: a.d + b.d,
	};
}

/**
 * Multiplies two dual numbers: `(a.v * b.v, a.v * b.d + a.d * b.v)`.
 * @param {DualNumber} a
 * @param {DualNumber} b
 * @returns {DualNumber}
 */
function dualMul(a, b) {
	return {
		v: a.v * b.v,
		d: a.v * b.d + a.d * b.v,
	};
}

/**
 * Divides two dual numbers with `b.v !== 0`:
 * `q.v = a.v / b.v`, `q.d = (a.d - q.v * b.d) / b.v`.
 * Uses the factored form to avoid squaring `b.v` (which could overflow or
 * underflow for extreme inputs).
 * @param {DualNumber} a
 * @param {DualNumber} b
 * @returns {DualNumber}
 */
function dualDiv(a, b) {
	const v = a.v / b.v;
	const d = (a.d - v * b.d) / b.v;
	return { v, d };
}

/**
 * Computes the real cube root of a dual number `{ v, d }` using iterative
 * Newton-Raphson in dual arithmetic.
 *
 * Mathematical semantics:
 * For `x = v + d·ε`, computes `y = cbrt(x)` solving `y³ = x`:
 * - Primal value: `y.v = cbrt(v)` (defined for positive, negative, and zero `v`).
 * - Derivative:   `y.d = d / (3 * cbrt(v)²)` for `v !== 0`.
 * - At `v === 0`: returns `{ v: 0, d: 0 }` when `d === 0`; throws `RangeError`
 *   when `d !== 0` because the derivative of `cbrt` is infinite at `0`.
 *
 * Algorithm:
 * Starting from a sign-preserving power-of-two estimate
 * `y₀ = { v: sign(v) * 2^round(log₂(|v|) / 3), d: 0 }`, iterates the dual
 * Newton-Raphson recurrence
 *
 *     y_{k+1} = (2 * y_k + x / y_k²) / 3
 *
 * until both primal and derivative components converge within machine precision.
 *
 * @param {DualNumber} x - Input dual number `{ v, d }` with finite numeric fields.
 * @returns {DualNumber} New dual number `{ v, d }` holding `cbrt(x)` and its derivative.
 * @throws {TypeError} If `x` is not a non-null plain-like object or `x.v` / `x.d` are not numbers.
 * @throws {RangeError} If `x.v` or `x.d` is non-finite (`NaN`, `±Infinity`), if `x.v === 0 && x.d !== 0`
 *   (infinite derivative at zero), or if the computed result overflows finite floating-point range.
 */
export function cbrtDualIterative(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('cbrtDualIterative: expected a dual number object { v, d }');
	}

	const { v, d } = x;

	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('cbrtDualIterative: dual number fields v and d must be numbers');
	}

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('cbrtDualIterative: dual number fields v and d must be finite numbers');
	}

	if (v === 0) {
		if (d !== 0) {
			throw new RangeError(
				'cbrtDualIterative: derivative of cbrt(v) is infinite at v = 0 when d !== 0',
			);
		}
		return { v: 0, d: 0 };
	}

	const exp = Math.round(Math.log2(Math.abs(v)) / 3);
	let y = {
		v: Math.sign(v) * 2 ** exp,
		d: 0,
	};

	const target = { v, d };

	for (let i = 0; i < MAX_ITERATIONS; i += 1) {
		const y2 = dualMul(y, y);
		const q = dualDiv(target, y2);
		const twoY = { v: 2 * y.v, d: 2 * y.d };
		const sum = dualAdd(twoY, q);
		const next = { v: sum.v / 3, d: sum.d / 3 };

		if (!Number.isFinite(next.v) || !Number.isFinite(next.d)) {
			throw new RangeError(
				'cbrtDualIterative: result overflows finite floating-point range',
			);
		}

		const vTol = 4 * Number.EPSILON * Math.abs(next.v);
		const dTol = 4 * Number.EPSILON * Math.abs(next.d);
		const vConverged = Math.abs(next.v - y.v) <= vTol;
		const dConverged = Math.abs(next.d - y.d) <= dTol;

		y = next;

		if (vConverged && dConverged) {
			break;
		}
	}

	return {
		v: y.v === 0 ? 0 : y.v,
		d: y.d === 0 ? 0 : y.d,
	};
}
