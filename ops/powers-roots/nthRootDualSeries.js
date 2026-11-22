/**
 * Computes the real `n`-th root of a dual number `x = v + d·ε` (with `ε² = 0`),
 * carrying the exact forward-mode first derivative alongside the primal value.
 *
 * Derivation via the generalized binomial series over dual numbers:
 * For `v ≠ 0` and integer `n ≥ 1`, let `r = sign(v) · |v|^(1/n)` so that `r^n = v`.
 * Factoring out `v` gives:
 *
 *     (v + d·ε)^(1/n) = r · (1 + (d / v)·ε)^(1/n)
 *                     = r · (1 + (1 / n)·(d / v)·ε + O(ε²))
 *                     = r + (r · d) / (n · v) · ε
 *                     = r + (d / (n · r^(n - 1))) · ε
 *
 * Because `ε² = 0`, the binomial series truncates identically at the first-order term.
 * Evaluating the derivative via `(d / n) * (r / v)` (equivalent to `d / (n * r^(n - 1))`)
 * avoids accumulated exponentiation rounding error and intermediate overflow/underflow
 * for large `n` or extreme magnitudes of `v`.
 *
 * Domain & boundary rules:
 * - `x` must be an object `{ v, d }` whose `v` and `d` properties are finite numbers.
 * - `n` must be a positive safe integer (`n >= 1`).
 * - Even roots (`n % 2 === 0`) of negative `v` throw a `RangeError`.
 * - Odd roots (`n % 2 === 1`) of negative `v` are real-valued with `r = -|v|^(1/n)`.
 * - At `v === 0`:
 *   - If `n === 1`, returns `{ v: 0, d: x.d }` (normalized so `-0` becomes `0`).
 *   - If `n > 1` and `x.d === 0`, returns `{ v: 0, d: 0 }`.
 *   - If `n > 1` and `x.d !== 0`, throws a `RangeError` because the derivative
 *     `1 / (n · v^((n - 1)/n))` diverges at `v = 0`.
 *
 * @param {{ v: number, d: number }} x - Input dual number with finite primal value `v` and derivative `d`.
 * @param {number} n - Positive integer root degree (`n >= 1`).
 * @returns {{ v: number, d: number }} Dual number `{ v, d }` representing `nthRoot(x, n)`.
 * @throws {TypeError} If `x` is not an object with numeric `v` and `d`, or if `n` is not a number.
 * @throws {RangeError} If `x.v` or `x.d` is non-finite, `n` is not a positive safe integer,
 *   `v < 0` with even `n`, or `v === 0` with `n > 1` and `d !== 0`.
 */
export function nthRootDualSeries(x, n) {
	if (x === null || typeof x !== 'object') {
		throw new TypeError('Expected dual number x to be an object with { v, d } properties')
	}

	const { v, d } = x

	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('Expected dual number properties x.v and x.d to be numbers')
	}

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('Expected dual number properties x.v and x.d to be finite numbers')
	}

	if (typeof n !== 'number') {
		throw new TypeError('Expected root degree n to be a number')
	}

	if (!Number.isSafeInteger(n) || n < 1) {
		throw new RangeError('Expected root degree n to be a positive safe integer (n >= 1)')
	}

	if (n === 1) {
		return { v: v === 0 ? 0 : v, d: d === 0 ? 0 : d }
	}

	if (v === 0) {
		if (d === 0) {
			return { v: 0, d: 0 }
		}
		throw new RangeError(`Derivative of ${n}-th root is undefined at v = 0 when d !== 0`)
	}

	if (v < 0 && n % 2 === 0) {
		throw new RangeError(`Cannot compute even root (n = ${n}) of negative value v = ${v}`)
	}

	let r
	if (n === 2) {
		r = Math.sqrt(v)
	} else if (n === 3) {
		r = Math.cbrt(v)
	} else {
		r = v < 0 ? -Math.pow(-v, 1 / n) : Math.pow(v, 1 / n)
	}

	let deriv
	if (d === 0) {
		deriv = 0
	} else {
		// Algebraically identical to d / (n * r^(n - 1)) since r^n = v => r^(n - 1) = v / r.
		deriv = (d / n) * (r / v)
		if (!Number.isFinite(deriv)) {
			deriv = (d / v) * (r / n)
		}
		if (deriv === 0) {
			deriv = 0
		}
	}

	return { v: r, d: deriv }
}
