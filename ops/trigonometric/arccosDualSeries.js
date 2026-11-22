/**
 * Evaluates the inverse cosine (arccos) over dual numbers using forward-mode
 * automatic differentiation.
 *
 * A dual number `x = v + d·ε` (with `ε² = 0`) carries a primal value `v` and
 * a first-order directional derivative `d`. Because `ε² = 0`, the Taylor series
 * of `arccos(v + d·ε)` around `v` truncates exactly at the first-order term:
 *
 * ```
 * arccos(v + d·ε) = acos(v) + (-d / sqrt(1 - v²)) · ε
 * ```
 *
 * Internally, `1 - v²` is evaluated as `(1 - v) * (1 + v)` to avoid catastrophic
 * cancellation when `|v|` is close to `1`.
 *
 * Domain and boundary behavior:
 * - Requires `-1 <= v <= 1` with finite numeric `v` and `d`.
 * - For `|v| > 1`, throws a `RangeError`.
 * - At the endpoints `|v| === 1`, the derivative `-1 / sqrt(1 - v²)` is
 *   singular: if `d === 0`, returns `{ v: Math.acos(v), d: 0 }`; otherwise
 *   throws a `RangeError`.
 *
 * @param {{ v: number, d: number }} x - Input dual number with finite real `v`
 *   in `[-1, 1]` and finite real derivative `d`.
 * @returns {{ v: number, d: number }} Dual result `{ v, d }` representing
 *   `arccos(x)` and its propagated derivative.
 * @throws {TypeError} If `x` is not a non-null plain-like object or `x.v` / `x.d`
 *   are not numbers.
 * @throws {RangeError} If `x.v` or `x.d` is non-finite, if `|x.v| > 1`, if
 *   `|x.v| === 1` with `x.d !== 0`, or if the resulting derivative overflows to
 *   a non-finite value.
 */
export function arccosDualSeries(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('arccosDualSeries: input must be a dual number object { v, d }')
	}

	const { v, d } = x

	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('arccosDualSeries: dual components v and d must be numbers')
	}

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('arccosDualSeries: dual components v and d must be finite numbers')
	}

	if (v < -1 || v > 1) {
		throw new RangeError(`arccosDualSeries: primal value v=${v} is out of domain [-1, 1]`)
	}

	if (v === 1 || v === -1) {
		if (d === 0) {
			return { v: Math.acos(v), d: 0 }
		}
		throw new RangeError(
			`arccosDualSeries: derivative is singular at |v| === 1 with non-zero d=${d}`,
		)
	}

	const primal = Math.acos(v)
	if (d === 0) {
		return { v: primal, d: 0 }
	}

	const denom = Math.sqrt((1 - v) * (1 + v))
	const deriv = -d / denom

	if (!Number.isFinite(deriv)) {
		throw new RangeError('arccosDualSeries: derivative overflowed to a non-finite value')
	}

	return { v: primal, d: deriv }
}
