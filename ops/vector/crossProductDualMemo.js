/**
 * @fileoverview 3D vector cross product over dual numbers `{ v, d }` using a
 * precomputed Levi-Civita table and bounded LRU memoization.
 *
 * A dual number `{ v, d }` represents `v + d * ε` (with `ε² = 0`), carrying a
 * primal value `v` alongside its forward-mode derivative `d`.
 */

/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal value (finite number).
 * @property {number} d - Forward-mode derivative (finite number).
 */

/**
 * @typedef {[DualNumber, DualNumber, DualNumber]} DualVec3
 */

/**
 * Precomputed sparse Levi-Civita tensor entries (non-zero ε_{out, i, j}).
 * For each component `out ∈ {0, 1, 2}`:
 *   `(a × b)[out] = Σ sign * (a[i] * b[j])`
 * using dual multiplication:
 *   `(a_v + a_d ε)(b_v + b_d ε) = (a_v * b_v) + (a_v * b_d + a_d * b_v) ε`.
 *
 * @type {ReadonlyArray<Readonly<{ out: number, i: number, j: number, sign: 1 | -1 }>>}
 */
const LEVI_CIVITA_TABLE = Object.freeze([
	Object.freeze({ out: 0, i: 1, j: 2, sign: 1 }),
	Object.freeze({ out: 0, i: 2, j: 1, sign: -1 }),
	Object.freeze({ out: 1, i: 2, j: 0, sign: 1 }),
	Object.freeze({ out: 1, i: 0, j: 2, sign: -1 }),
	Object.freeze({ out: 2, i: 0, j: 1, sign: 1 }),
	Object.freeze({ out: 2, i: 1, j: 0, sign: -1 }),
]);

/**
 * Maximum number of entries retained in the bounded memoization cache.
 * @type {number}
 */
const MAX_CACHE_SIZE = 1024;

/**
 * Bounded LRU memoization cache mapping serialized input pairs to frozen
 * internal dual vector results.
 * @type {Map<string, ReadonlyArray<Readonly<DualNumber>>>}
 */
const memoCache = new Map();

/**
 * Normalizes `-0` to `+0` while preserving all other numbers.
 *
 * @param {number} n
 * @returns {number}
 */
function normalizeZero(n) {
	return n === 0 ? 0 : n;
}

/**
 * Validates that `vec` is a 3-element array of finite dual numbers `{ v, d }`.
 *
 * @param {unknown} vec
 * @param {string} name
 * @throws {TypeError} If `vec` is not an array or contains non-dual elements.
 * @throws {RangeError} If `vec.length !== 3` or any component is non-finite.
 */
function validateDualVec3(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an array of 3 dual numbers { v, d }`);
	}
	if (vec.length !== 3) {
		throw new RangeError(`${name} must have length 3, got ${vec.length}`);
	}
	for (let idx = 0; idx < 3; idx++) {
		const el = vec[idx];
		if (el === null || typeof el !== 'object' || Array.isArray(el)) {
			throw new TypeError(`${name}[${idx}] must be a dual number object { v, d }`);
		}
		if (typeof el.v !== 'number' || typeof el.d !== 'number') {
			throw new TypeError(
				`${name}[${idx}] must have numeric properties v and d`,
			);
		}
		if (!Number.isFinite(el.v) || !Number.isFinite(el.d)) {
			throw new RangeError(
				`${name}[${idx}] components v and d must be finite numbers`,
			);
		}
	}
}

/**
 * Builds a canonical cache key for a pair of validated 3D dual vectors.
 *
 * @param {DualVec3} a
 * @param {DualVec3} b
 * @returns {string}
 */
function makeCacheKey(a, b) {
	return (
		`${normalizeZero(a[0].v)},${normalizeZero(a[0].d)},` +
		`${normalizeZero(a[1].v)},${normalizeZero(a[1].d)},` +
		`${normalizeZero(a[2].v)},${normalizeZero(a[2].d)}|` +
		`${normalizeZero(b[0].v)},${normalizeZero(b[0].d)},` +
		`${normalizeZero(b[1].v)},${normalizeZero(b[1].d)},` +
		`${normalizeZero(b[2].v)},${normalizeZero(b[2].d)}`
	);
}

/**
 * Deep-clones a 3-element dual vector into a fresh mutable array of fresh objects.
 *
 * @param {ReadonlyArray<Readonly<DualNumber>>} vec
 * @returns {DualVec3}
 */
function cloneDualVec3(vec) {
	return [
		{ v: vec[0].v, d: vec[0].d },
		{ v: vec[1].v, d: vec[1].d },
		{ v: vec[2].v, d: vec[2].d },
	];
}

/**
 * Computes the 3D vector cross product `a × b` over dual numbers `{ v, d }`,
 * propagating both primal values and forward-mode derivatives via a precomputed
 * Levi-Civita index table with bounded LRU memoization.
 *
 * Always returns a freshly allocated 3-element array of fresh `{ v, d }` objects
 * so caller mutations cannot corrupt cached results.
 *
 * @param {DualVec3} a - Left 3D vector of finite dual numbers `{ v, d }`.
 * @param {DualVec3} b - Right 3D vector of finite dual numbers `{ v, d }`.
 * @returns {DualVec3} The 3D dual vector cross product `a × b`.
 * @throws {TypeError} If `a` or `b` is not an array or contains invalid dual objects.
 * @throws {RangeError} If `a` or `b` does not have length 3 or contains non-finite values.
 */
export function crossProductDualMemo(a, b) {
	validateDualVec3(a, 'a');
	validateDualVec3(b, 'b');

	const key = makeCacheKey(a, b);
	const cached = memoCache.get(key);
	if (cached !== undefined) {
		// Refresh LRU recency
		memoCache.delete(key);
		memoCache.set(key, cached);
		return cloneDualVec3(cached);
	}

	const vals = [0, 0, 0];
	const derivs = [0, 0, 0];

	for (let t = 0; t < LEVI_CIVITA_TABLE.length; t++) {
		const { out, i, j, sign } = LEVI_CIVITA_TABLE[t];
		const ai = a[i];
		const bj = b[j];
		vals[out] += sign * (ai.v * bj.v);
		derivs[out] += sign * (ai.v * bj.d + ai.d * bj.v);
	}

	const entry = Object.freeze([
		Object.freeze({ v: normalizeZero(vals[0]), d: normalizeZero(derivs[0]) }),
		Object.freeze({ v: normalizeZero(vals[1]), d: normalizeZero(derivs[1]) }),
		Object.freeze({ v: normalizeZero(vals[2]), d: normalizeZero(derivs[2]) }),
	]);

	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value;
		memoCache.delete(oldestKey);
	}
	memoCache.set(key, entry);

	return cloneDualVec3(entry);
}
