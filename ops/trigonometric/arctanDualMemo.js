/**
 * Precomputed, table-driven and memoized arctangent over forward-mode dual numbers.
 *
 * A dual number is represented as `{ v, d }` where `v` is the primal value and
 * `d` is the first-order derivative component. For `f(x) = atan(x)`:
 *
 * - `f(v + d*ε) = atan(v) + (d / (1 + v²)) * ε`
 *
 * Implementation details:
 * - Exact constant table for notable exact values (`0`, `±1`, `±√3`, `±1/√3`, `±√(1/2)`).
 * - Uniform precomputed lookup table on `[-4, 4]` with binary grid spacing `1/64`
 *   (513 exact IEEE-754 grid points), paired with the angle-addition reduction
 *   `atan(v) = atan(v0) + atan((v - v0) / (1 + v * v0))` and an 11th-order
 *   Horner Taylor polynomial for `|u| <= 1/128`, plus reciprocal reduction
 *   `atan(v) = sign(v) * π/2 - atan(1 / v)` for `|v| > 4`.
 * - Bounded LRU memoization cache for computed primal entries; every call
 *   returns a fresh `{ v, d }` object to prevent cache aliasing/mutation.
 * - Overflow-safe derivative computation for large `|v| > 1e150`.
 *
 * @module ops/trigonometric/arctanDualMemo
 */

const HALF_PI = Math.PI / 2;
const LARGE_V_THRESHOLD = 1e150;

const GRID_LIMIT = 4;
const GRID_STEPS_PER_UNIT = 64;
const GRID_OFFSET = GRID_LIMIT * GRID_STEPS_PER_UNIT; // 256
const GRID_SIZE = GRID_OFFSET * 2 + 1; // 513

const GRID_ATAN = new Float64Array(GRID_SIZE);
const GRID_DENOM = new Float64Array(GRID_SIZE);

for (let i = 0; i < GRID_SIZE; i += 1) {
	const v = (i - GRID_OFFSET) / GRID_STEPS_PER_UNIT;
	GRID_ATAN[i] = Math.atan(v);
	GRID_DENOM[i] = 1 + v * v;
}

const SQRT3 = Math.sqrt(3);
const INV_SQRT3 = 1 / SQRT3;

/** @type {ReadonlyMap<number, Readonly<{ atanV: number, denom: number }>>} */
const EXACT_TABLE = new Map([
	[0, Object.freeze({ atanV: 0, denom: 1 })],
	[1, Object.freeze({ atanV: Math.PI / 4, denom: 2 })],
	[-1, Object.freeze({ atanV: -Math.PI / 4, denom: 2 })],
	[SQRT3, Object.freeze({ atanV: Math.PI / 3, denom: 4 })],
	[-SQRT3, Object.freeze({ atanV: -Math.PI / 3, denom: 4 })],
	[INV_SQRT3, Object.freeze({ atanV: Math.PI / 6, denom: 4 / 3 })],
	[-INV_SQRT3, Object.freeze({ atanV: -Math.PI / 6, denom: 4 / 3 })],
	[Math.SQRT1_2, Object.freeze({ atanV: Math.atan(Math.SQRT1_2), denom: 1 + Math.SQRT1_2 * Math.SQRT1_2 })],
	[-Math.SQRT1_2, Object.freeze({ atanV: -Math.atan(Math.SQRT1_2), denom: 1 + Math.SQRT1_2 * Math.SQRT1_2 })],
]);

const MAX_CACHE_SIZE = 1024;

/**
 * Bounded LRU cache keyed by primal value `v`.
 * Maps `v` -> `{ atanV, denom }` where `denom` is `1 + v * v` (or `Infinity` when `|v| > LARGE_V_THRESHOLD`).
 * @type {Map<number, Readonly<{ atanV: number, denom: number }>>}
 */
const memoCache = new Map();

/**
 * Evaluates `atan(u)` via Horner's method for `|u| <= 1/128`.
 * Truncation error is `|u|^13 / 13 < 3e-29`, well below float64 precision.
 *
 * @param {number} u
 * @returns {number}
 */
function atanTaylorSmall(u) {
	const u2 = u * u;
	return u * (1 + u2 * (-1 / 3 + u2 * (1 / 5 + u2 * (-1 / 7 + u2 * (1 / 9 - u2 / 11)))));
}

/**
 * Computes `atan(v)` for `|v| <= GRID_LIMIT` using the precomputed grid table
 * and exact angle-addition reduction.
 *
 * @param {number} v
 * @returns {number}
 */
function atanFromGrid(v) {
	const scaled = v * GRID_STEPS_PER_UNIT;
	const nearest = Math.round(scaled);
	const idx = nearest + GRID_OFFSET;
	if (scaled === nearest) {
		return GRID_ATAN[idx];
	}
	const v0 = nearest / GRID_STEPS_PER_UNIT;
	const u = (v - v0) / (1 + v * v0);
	return GRID_ATAN[idx] + atanTaylorSmall(u);
}

/**
 * Computes `{ atanV, denom }` using the precomputed table with range reduction.
 *
 * @param {number} v
 * @returns {Readonly<{ atanV: number, denom: number }>}
 */
function computePrimalEntry(v) {
	const absV = Math.abs(v);
	let atanV;
	if (absV <= GRID_LIMIT) {
		atanV = atanFromGrid(v);
	} else {
		const invV = 1 / v;
		atanV = (v > 0 ? HALF_PI : -HALF_PI) - atanFromGrid(invV);
	}
	const denom = absV > LARGE_V_THRESHOLD ? Infinity : 1 + v * v;
	return Object.freeze({ atanV, denom });
}

/**
 * Looks up or computes the primal table/memo entry for `v`.
 *
 * @param {number} v
 * @returns {Readonly<{ atanV: number, denom: number }>}
 */
function getPrimalEntry(v) {
	const exact = EXACT_TABLE.get(v);
	if (exact !== undefined) {
		return exact;
	}

	if (Math.abs(v) <= GRID_LIMIT) {
		const scaled = v * GRID_STEPS_PER_UNIT;
		if (Number.isInteger(scaled)) {
			const idx = scaled + GRID_OFFSET;
			return { atanV: GRID_ATAN[idx], denom: GRID_DENOM[idx] };
		}
	}

	const cached = memoCache.get(v);
	if (cached !== undefined) {
		// Refresh LRU recency
		memoCache.delete(v);
		memoCache.set(v, cached);
		return cached;
	}

	const entry = computePrimalEntry(v);
	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value;
		memoCache.delete(oldestKey);
	}
	memoCache.set(v, entry);
	return entry;
}

/**
 * Computes the arctangent of a dual number `{ v, d }`, returning a fresh dual
 * number `{ v: atan(x.v), d: x.d / (1 + x.v^2) }`.
 *
 * Uses a precomputed lookup table and a bounded LRU memoization cache.
 *
 * @param {{ v: number, d: number }} x - Input dual number with finite numeric `v` and `d`.
 * @returns {{ v: number, d: number }} Fresh dual number containing value and derivative.
 * @throws {TypeError} If `x` is not a non-null non-array object, or `x.v` / `x.d` are not numbers.
 * @throws {RangeError} If `x.v` or `x.d` is `NaN`, `Infinity`, or `-Infinity`.
 */
export function arctanDualMemo(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('arctanDualMemo expects a dual number object { v, d }');
	}
	if (typeof x.v !== 'number' || typeof x.d !== 'number') {
		throw new TypeError('arctanDualMemo requires numeric v and d properties');
	}
	if (!Number.isFinite(x.v) || !Number.isFinite(x.d)) {
		throw new RangeError('arctanDualMemo requires finite v and d values');
	}

	const v = x.v === 0 ? 0 : x.v;
	const d = x.d === 0 ? 0 : x.d;

	const entry = getPrimalEntry(v);

	let outD;
	if (d === 0) {
		outD = 0;
	} else if (Math.abs(v) > LARGE_V_THRESHOLD) {
		// Avoid intermediate overflow in v * v for very large |v|
		outD = (d / v) / v;
	} else {
		outD = d / entry.denom;
	}

	return {
		v: entry.atanV === 0 ? 0 : entry.atanV,
		d: outD === 0 ? 0 : outD,
	};
}
