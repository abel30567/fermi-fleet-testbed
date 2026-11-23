/**
 * @typedef {{ re: number, im: number }} Complex
 */

/** Maximum root degree whose full roots-of-unity table is precomputed eagerly. */
const PRECOMPUTED_MAX_N = 32;

/** Maximum root degree whose reciprocal (1 / n) is precomputed eagerly. */
const RECIPROCAL_TABLE_SIZE = 64;

/** Maximum root degree allowed in the dynamically cached roots-of-unity map. */
const DYNAMIC_UNITY_MAX_N = 4096;

/** Maximum number of dynamically cached roots-of-unity tables. */
const DYNAMIC_UNITY_CACHE_LIMIT = 128;

/** Maximum number of entries in each LRU memoization cache. */
const PRINCIPAL_CACHE_LIMIT = 4096;
const BRANCH_CACHE_LIMIT = 4096;

const TWO_PI = 2 * Math.PI;

/**
 * Precomputed reciprocal table: RECIPROCAL_TABLE[n] = 1 / n for 1 <= n <= 64.
 * @type {Float64Array}
 */
const RECIPROCAL_TABLE = new Float64Array(RECIPROCAL_TABLE_SIZE + 1);
for (let n = 1; n <= RECIPROCAL_TABLE_SIZE; n += 1) {
	RECIPROCAL_TABLE[n] = 1 / n;
}

/**
 * Compute a single n-th root of unity e^(2*pi*i*k/n) with exact cardinal values.
 *
 * @param {number} n Positive integer root degree.
 * @param {number} k Branch index with 0 <= k < n.
 * @returns {Readonly<Complex>}
 */
function computeUnitRoot(n, k) {
	if (k === 0) {
		return Object.freeze({ re: 1, im: 0 });
	}
	if (2 * k === n) {
		return Object.freeze({ re: -1, im: 0 });
	}
	if (4 * k === n) {
		return Object.freeze({ re: 0, im: 1 });
	}
	if (4 * k === 3 * n) {
		return Object.freeze({ re: 0, im: -1 });
	}
	const angle = (TWO_PI * k) / n;
	return Object.freeze({ re: Math.cos(angle), im: Math.sin(angle) });
}

/**
 * Build an immutable lookup table of all n-th roots of unity for a given n.
 *
 * @param {number} n Positive integer root degree.
 * @returns {ReadonlyArray<Readonly<Complex>>}
 */
function buildUnitRootTable(n) {
	const table = new Array(n);
	for (let k = 0; k < n; k += 1) {
		table[k] = computeUnitRoot(n, k);
	}
	return Object.freeze(table);
}

/**
 * Precomputed roots-of-unity tables for 1 <= n <= PRECOMPUTED_MAX_N.
 * @type {Array<ReadonlyArray<Readonly<Complex>>>}
 */
const PRECOMPUTED_UNIT_ROOTS = new Array(PRECOMPUTED_MAX_N + 1);
for (let n = 1; n <= PRECOMPUTED_MAX_N; n += 1) {
	PRECOMPUTED_UNIT_ROOTS[n] = buildUnitRootTable(n);
}

/** @type {Map<number, ReadonlyArray<Readonly<Complex>>>} */
const dynamicUnitRootCache = new Map();

/** @type {Map<string, Readonly<Complex>>} */
const principalRootCache = new Map();

/** @type {Map<string, Readonly<Complex>>} */
const branchRootCache = new Map();

/**
 * Read from a Map-backed LRU cache, refreshing recency on hit.
 *
 * @template K, V
 * @param {Map<K, V>} cache
 * @param {K} key
 * @returns {V | undefined}
 */
function lruGet(cache, key) {
	const value = cache.get(key);
	if (value !== undefined) {
		cache.delete(key);
		cache.set(key, value);
	}
	return value;
}

/**
 * Write to a bounded Map-backed LRU cache.
 *
 * @template K, V
 * @param {Map<K, V>} cache
 * @param {K} key
 * @param {V} value
 * @param {number} maxSize
 */
function lruSet(cache, key, value, maxSize) {
	if (cache.has(key)) {
		cache.delete(key);
	} else if (cache.size >= maxSize) {
		const oldestKey = cache.keys().next().value;
		cache.delete(oldestKey);
	}
	cache.set(key, value);
}

/**
 * Retrieve the k-th n-th root of unity from precomputed/cached tables or compute on demand.
 *
 * @param {number} n
 * @param {number} k
 * @returns {Readonly<Complex>}
 */
function getUnitRoot(n, k) {
	if (n <= PRECOMPUTED_MAX_N) {
		return PRECOMPUTED_UNIT_ROOTS[n][k];
	}
	if (n <= DYNAMIC_UNITY_MAX_N) {
		let table = lruGet(dynamicUnitRootCache, n);
		if (table === undefined) {
			table = buildUnitRootTable(n);
			lruSet(dynamicUnitRootCache, n, table, DYNAMIC_UNITY_CACHE_LIMIT);
		}
		return table[k];
	}
	return computeUnitRoot(n, k);
}

/**
 * Normalize IEEE-754 negative zero to positive zero.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x;
}

/**
 * Compute x^(1/n) for non-negative finite x using specialized functions and the reciprocal table.
 *
 * @param {number} x
 * @param {number} n
 * @returns {number}
 */
function positiveNthRoot(x, n) {
	if (x === 1) {
		return 1;
	}
	if (n === 2) {
		return Math.sqrt(x);
	}
	if (n === 3) {
		return Math.cbrt(x);
	}
	const invN = n <= RECIPROCAL_TABLE_SIZE ? RECIPROCAL_TABLE[n] : 1 / n;
	return Math.pow(x, invN);
}

/**
 * Compute the principal n-th root of a normalized complex number (re, im) without overflow/underflow.
 *
 * @param {number} re
 * @param {number} im
 * @param {number} n
 * @returns {Readonly<Complex>}
 */
function computePrincipalRoot(re, im, n) {
	if (n === 1) {
		return Object.freeze({ re, im });
	}
	if (re === 0 && im === 0) {
		return Object.freeze({ re: 0, im: 0 });
	}

	const absRe = Math.abs(re);
	const absIm = Math.abs(im);
	const scale = absRe >= absIm ? absRe : absIm;
	const u = re / scale;
	const v = im / scale;
	const scaledRadius = Math.hypot(u, v);
	const mag = positiveNthRoot(scale, n) * positiveNthRoot(scaledRadius, n);

	if (im === 0) {
		if (re > 0) {
			return Object.freeze({ re: normalizeZero(mag), im: 0 });
		}
		if (n === 2) {
			return Object.freeze({ re: 0, im: normalizeZero(mag) });
		}
	}

	const phi = Math.atan2(im, re) / n;
	return Object.freeze({
		re: normalizeZero(mag * Math.cos(phi)),
		im: normalizeZero(mag * Math.sin(phi)),
	});
}

/**
 * Compute the n-th root of a complex number `z = { re, im }` using precomputed
 * reciprocal and roots-of-unity tables together with bounded LRU memoization.
 *
 * For a complex number `z = r * exp(i * theta)` with `theta = atan2(im, re) in (-pi, pi]`,
 * the principal root (`k = 0`) is `r^(1/n) * exp(i * theta / n)`, and the `k`-th branch
 * (`0 <= k < n`) is obtained by multiplying the memoized principal root by the
 * precomputed/cached `n`-th root of unity `exp(2 * pi * i * k / n)`.
 *
 * Signed zeros (`-0`) in `z` are normalized to `+0` so the principal branch along the
 * negative real axis consistently uses `theta = +pi`.
 *
 * @param {Complex} z Complex radicand with finite numeric `re` and `im` properties.
 * @param {number} n Positive safe integer root degree (`n >= 1`).
 * @param {number} [k=0] Optional branch index, a safe integer with `0 <= k < n`.
 * @returns {Complex} A fresh `{ re, im }` object representing the requested complex n-th root.
 * @throws {TypeError} If `z` is not a non-null non-array object with numeric `re`/`im`,
 *   or if `n` or `k` is not a number.
 * @throws {RangeError} If `z.re` or `z.im` is not finite, if `n` is not a positive safe integer,
 *   or if `k` is not a safe integer in `[0, n - 1]`.
 */
export function nthRootComplexMemo(z, n, k = 0) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('z must be a non-null object with numeric re and im properties');
	}
	if (typeof z.re !== 'number' || typeof z.im !== 'number') {
		throw new TypeError('z.re and z.im must be numbers');
	}
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError('z.re and z.im must be finite numbers');
	}
	if (typeof n !== 'number') {
		throw new TypeError('n must be a number');
	}
	if (!Number.isSafeInteger(n) || n < 1) {
		throw new RangeError('n must be a positive safe integer');
	}
	if (typeof k !== 'number') {
		throw new TypeError('k must be a number');
	}
	if (!Number.isSafeInteger(k) || k < 0 || k >= n) {
		throw new RangeError('k must be a safe integer satisfying 0 <= k < n');
	}

	const re = normalizeZero(z.re);
	const im = normalizeZero(z.im);

	if (k > 0) {
		const branchKey = `${re},${im},${n},${k}`;
		const cachedBranch = lruGet(branchRootCache, branchKey);
		if (cachedBranch !== undefined) {
			return { re: cachedBranch.re, im: cachedBranch.im };
		}

		const principalKey = `${re},${im},${n}`;
		let principal = lruGet(principalRootCache, principalKey);
		if (principal === undefined) {
			principal = computePrincipalRoot(re, im, n);
			lruSet(principalRootCache, principalKey, principal, PRINCIPAL_CACHE_LIMIT);
		}

		const omega = getUnitRoot(n, k);
		const branch = Object.freeze({
			re: normalizeZero(principal.re * omega.re - principal.im * omega.im),
			im: normalizeZero(principal.re * omega.im + principal.im * omega.re),
		});
		lruSet(branchRootCache, branchKey, branch, BRANCH_CACHE_LIMIT);
		return { re: branch.re, im: branch.im };
	}

	const principalKey = `${re},${im},${n}`;
	let principal = lruGet(principalRootCache, principalKey);
	if (principal === undefined) {
		principal = computePrincipalRoot(re, im, n);
		lruSet(principalRootCache, principalKey, principal, PRINCIPAL_CACHE_LIMIT);
	}
	return { re: principal.re, im: principal.im };
}
