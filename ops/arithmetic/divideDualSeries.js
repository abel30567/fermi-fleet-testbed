/**
 * Validates that an argument is a dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} dual - Value to validate.
 * @param {string} name - Parameter name for error reporting.
 * @returns {{ v: number, d: number }} The validated dual number.
 * @throws {TypeError} If the value is not a plain-like object with numeric `v` and `d` properties.
 * @throws {RangeError} If `v` or `d` is not a finite number.
 */
function assertDual(dual, name) {
	if (typeof dual !== 'object' || dual === null || Array.isArray(dual)) {
		throw new TypeError(`${name} must be an object with numeric { v, d } properties`);
	}
	const { v, d } = dual;
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`${name}.v and ${name}.d must be numbers`);
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`${name}.v and ${name}.d must be finite numbers`);
	}
	return { v, d };
}

/**
 * Divides two dual numbers `a = a.v + a.d·ε` and `b = b.v + b.d·ε` (where `ε² = 0`),
 * carrying the forward-mode derivative alongside the primal value.
 *
 * Derived from the terminating geometric series in the nilpotent infinitesimal `ε`:
 * ```
 * (a.v + a.d·ε) / (b.v + b.d·ε)
 *   = (a.v + a.d·ε) / b.v · (1 + (b.d / b.v)·ε)⁻¹
 *   = (a.v / b.v + (a.d / b.v)·ε) · (1 - (b.d / b.v)·ε)
 *   = q + ((a.d - q · b.d) / b.v)·ε,   where q = a.v / b.v
 * ```
 * Using the factored form `(a.d - q * b.d) / b.v` avoids intermediate squaring `b.v²`,
 * preventing spurious overflow/underflow for very large or very small `|b.v|`.
 *
 * @param {{ v: number, d: number }} a - Dividend dual number `{ v, d }`.
 * @param {{ v: number, d: number }} b - Divisor dual number `{ v, d }` with `b.v !== 0`.
 * @returns {{ v: number, d: number }} Quotient dual number `{ v, d }`.
 * @throws {TypeError} If `a` or `b` is not an object with numeric `v` and `d` properties.
 * @throws {RangeError} If any component is non-finite or if `b.v === 0`.
 */
export function divideDualSeries(a, b) {
	const num = assertDual(a, 'a');
	const den = assertDual(b, 'b');

	if (den.v === 0) {
		throw new RangeError('Division by zero dual number: b.v must be non-zero');
	}

	const v = num.v / den.v;
	const d = (num.d - v * den.d) / den.v;

	return {
		v: v === 0 ? 0 : v,
		d: d === 0 ? 0 : d,
	};
}
