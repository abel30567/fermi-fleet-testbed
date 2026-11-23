const POLE_TOLERANCE = 1e-15

/**
 * Computes the trigonometric tangent of a dual number `{ v, d }`, carrying the
 * forward-mode first derivative alongside the primal value.
 *
 * In dual-number arithmetic (`x = v + d * eps` with `eps^2 = 0`), the Taylor
 * series of `tan(v + d * eps)` truncates exactly at first order:
 *
 *   tan(v + d * eps) = tan(v) + sec^2(v) * d * eps
 *                    = tan(v) + (1 + tan^2(v)) * d * eps
 *
 * @param {{ v: number, d: number }} x - Input dual number with finite primal value `v` (radians) and derivative `d`.
 * @returns {{ v: number, d: number }} Resulting dual number `{ v: tan(v), d: d * (1 + tan(v)^2) }`.
 * @throws {TypeError} If `x` is not an object or if `x.v` / `x.d` are not numbers.
 * @throws {RangeError} If `x.v` / `x.d` are not finite, or if `x.v` lies at a pole (`pi/2 + k*pi`).
 */
export function tanDualSeries(x) {
	if (x === null || typeof x !== 'object') {
		throw new TypeError('Expected a dual number object { v, d }')
	}

	const { v, d } = x

	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('Dual number components v and d must be numbers')
	}

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('Dual number components v and d must be finite')
	}

	if (Math.abs(Math.cos(v)) < POLE_TOLERANCE) {
		throw new RangeError('tanDualSeries is undefined at poles v = pi/2 + k*pi')
	}

	const t = Math.tan(v)
	const secSq = 1 + t * t

	return {
		v: t,
		d: d * secSq,
	}
}
