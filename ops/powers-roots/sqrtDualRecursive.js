/**
 * Exact powers of 4 (`p4 = 4^k = 2^(2k)`) and corresponding powers of 2
 * (`p2 = 2^k`) used for recursive divide-and-conquer binary range reduction.
 *
 * Multiplying or dividing by exact powers of two in IEEE-754 binary64 adjusts
 * only the exponent and introduces zero mantissa rounding error.
 */
const RANGE_STEPS = [256, 128, 64, 32, 16, 8, 4, 2, 1].map((k) => ({
	p4: 2 ** (2 * k),
	p2: 2 ** k,
	invP4: 2 ** (-2 * k),
	invP2: 2 ** -k,
}))

const MAX_NEWTON_DEPTH = 24
const LARGE_D_THRESHOLD = 2 ** 100
const SMALL_D_THRESHOLD = 2 ** -100
const LARGE_D_PRESCALE = 2 ** -16
const LARGE_D_POSTSCALE = 2 ** 16
const SMALL_D_PRESCALE = 2 ** 60
const SMALL_D_POSTSCALE = 2 ** -60

/**
 * Adds two dual numbers: `(a.v + a.d*eps) + (b.v + b.d*eps)`.
 *
 * @param {{ v: number, d: number }} a
 * @param {{ v: number, d: number }} b
 * @returns {{ v: number, d: number }}
 */
function dualAdd(a, b) {
	return {
		v: a.v + b.v,
		d: a.d + b.d,
	}
}

/**
 * Divides two dual numbers: `(a.v + a.d*eps) / (b.v + b.d*eps)`.
 * Uses `(a.d - (a.v / b.v) * b.d) / b.v` to avoid intermediate squaring of `b.v`.
 *
 * @param {{ v: number, d: number }} a
 * @param {{ v: number, d: number }} b
 * @returns {{ v: number, d: number }}
 */
function dualDiv(a, b) {
	const v = a.v / b.v
	const d = (a.d - v * b.d) / b.v
	return { v, d }
}

/**
 * Scales a dual number by a scalar factor.
 *
 * @param {{ v: number, d: number }} a
 * @param {number} s
 * @returns {{ v: number, d: number }}
 */
function dualScale(a, s) {
	return {
		v: a.v * s,
		d: a.d * s,
	}
}

/**
 * Recursively performs Newton-Raphson iteration directly in dual arithmetic:
 * `y_{k+1} = 0.5 * (y_k + x / y_k)` for `x.v` reduced to `[1, 4)`.
 *
 * @param {{ v: number, d: number }} x - Reduced dual input with `x.v` in `[1, 4)`
 * @param {{ v: number, d: number }} y - Current dual iterate
 * @param {number} depth - Current recursion depth
 * @returns {{ v: number, d: number }}
 */
function newtonDualRecursive(x, y, depth) {
	const next = dualScale(dualAdd(y, dualDiv(x, y)), 0.5)

	const vConverged = Math.abs(next.v - y.v) <= Number.EPSILON * next.v
	const dScale = Math.max(Math.abs(next.d), Math.abs(y.d))
	const dConverged =
		next.d === y.d || Math.abs(next.d - y.d) <= 2 * Number.EPSILON * dScale

	if ((depth >= 1 && vConverged && dConverged) || depth >= MAX_NEWTON_DEPTH) {
		return next
	}

	return newtonDualRecursive(x, next, depth + 1)
}

/**
 * Recursively reduces `v` into `[1, 4)` using binary divide-and-conquer steps
 * of powers of 4 (`sqrt(4^k * m) = 2^k * sqrt(m)`), simultaneously scaling `d`
 * by `2^k` so `d / (2 * sqrt(v)) = (d / 2^k) / (2 * sqrt(v / 4^k))` stays
 * invariant and well-conditioned, then solves the base case with recursive
 * dual-arithmetic Newton-Raphson.
 *
 * @param {number} v - Positive finite primal value
 * @param {number} d - Derivative component (may be non-finite if true derivative overflows)
 * @param {number} idx - Index into `RANGE_STEPS`
 * @returns {{ v: number, d: number }}
 */
function reduceAndSolve(v, d, idx) {
	if (idx === RANGE_STEPS.length) {
		const initialV = (v + 2) / 3
		if (!Number.isFinite(d)) {
			// True derivative genuinely overflows; solve primal via dual Newton with d = 0.
			const primalOnly = newtonDualRecursive({ v, d: 0 }, { v: initialV, d: 0 }, 0)
			return { v: primalOnly.v, d: d > 0 ? Infinity : -Infinity }
		}
		return newtonDualRecursive({ v, d }, { v: initialV, d: 0 }, 0)
	}

	const step = RANGE_STEPS[idx]

	if (v >= step.p4) {
		const sub = reduceAndSolve(v * step.invP4, d * step.invP2, idx)
		return { v: sub.v * step.p2, d: sub.d }
	}

	const lowBound = idx === RANGE_STEPS.length - 1 ? 1 : step.invP4
	if (v < lowBound) {
		const sub = reduceAndSolve(v * step.p4, d * step.p2, idx)
		return { v: sub.v * step.invP2, d: sub.d }
	}

	return reduceAndSolve(v, d, idx + 1)
}

/**
 * Computes the square root of a dual number `{ v, d }` carrying a forward-mode
 * derivative alongside the primal value:
 *
 *   `sqrt(v + d*eps) = sqrt(v) + (d / (2 * sqrt(v))) * eps`
 *
 * Uses a two-stage recursive / divide-and-conquer algorithm with zero
 * dependencies and without calling `Math.sqrt`:
 * 1. Recursive binary range reduction by powers of 4 (`4^256, 4^128, ..., 4^1`)
 *    bringing `v` into `[1, 4)` in at most 11 recursive frames across the entire
 *    IEEE-754 double range (including subnormals).
 * 2. Recursive Newton-Raphson iteration directly in dual arithmetic:
 *    `y_{k+1} = 0.5 * (y_k + x / y_k)`.
 *
 * Boundary behavior at `v === 0`:
 * - If `d === 0`, returns `{ v: 0, d: 0 }`.
 * - If `d > 0`, returns `{ v: 0, d: Infinity }`.
 * - If `d < 0`, returns `{ v: 0, d: -Infinity }`.
 *
 * @param {{ v: number, d: number }} x - Dual number with finite `v >= 0` and finite `d`.
 * @returns {{ v: number, d: number }} Dual square root `{ v, d }`.
 * @throws {TypeError} If `x` is not a plain dual-number object with numeric `v` and `d`.
 * @throws {RangeError} If `x.v < 0`, or if `x.v` or `x.d` is `NaN` or non-finite.
 */
export function sqrtDualRecursive(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Expected a dual number object { v, d }')
	}

	const { v, d } = x

	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('Dual number components v and d must be numbers')
	}

	if (Number.isNaN(v) || Number.isNaN(d)) {
		throw new RangeError('Dual number components v and d must not be NaN')
	}

	if (v < 0) {
		throw new RangeError('Cannot compute square root of a negative value (v < 0)')
	}

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('Dual number components v and d must be finite numbers')
	}

	if (v === 0) {
		if (d === 0) {
			return { v: 0, d: 0 }
		}
		return { v: 0, d: d > 0 ? Infinity : -Infinity }
	}

	let dPre = d
	let dPostScale = 1
	const absD = Math.abs(d)

	if (absD > LARGE_D_THRESHOLD) {
		dPre = d * LARGE_D_PRESCALE
		dPostScale = LARGE_D_POSTSCALE
	} else if (d !== 0 && absD < SMALL_D_THRESHOLD) {
		dPre = d * SMALL_D_PRESCALE
		dPostScale = SMALL_D_POSTSCALE
	}

	const raw = reduceAndSolve(v, dPre, 0)
	const outD = raw.d * dPostScale

	return {
		v: raw.v,
		d: outD === 0 ? 0 : outD,
	}
}
