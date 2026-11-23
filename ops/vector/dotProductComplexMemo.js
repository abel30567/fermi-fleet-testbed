/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * @typedef {Object} DotProductComplexMemoOptions
 * @property {boolean} [conjugate=true] - When `true` (default), computes the Hermitian inner product
 *   `sum_k a[k] * conj(b[k])`. When `false`, computes the bilinear dot product `sum_k a[k] * b[k]`.
 * @property {boolean} [useCache=true] - When `true` (default), uses bounded memoization caches for
 *   vector results and element-wise complex products.
 */

const TABLE_MIN = -2;
const TABLE_MAX = 2;
const TABLE_SPAN = TABLE_MAX - TABLE_MIN + 1; // 5
const TABLE_ENTRIES = TABLE_SPAN ** 4; // 625

const MAX_PAIR_CACHE_SIZE = 4096;
const MAX_VECTOR_CACHE_SIZE = 512;

/**
 * Table-driven operation descriptors for Hermitian and bilinear complex multiplication.
 * For `a = aRe + i*aIm` and `b = bRe + i*bIm`:
 * - Hermitian (`a * conj(b)`): `re = aRe*bRe + aIm*bIm`, `im = -aRe*bIm + aIm*bRe`
 * - Bilinear  (`a * b`):       `re = aRe*bRe - aIm*bIm`, `im =  aRe*bIm + aIm*bRe`
 */
const MODE_TABLE = Object.freeze({
	hermitian: Object.freeze({
		key: 'H',
		imImSign: 1,
		reImSign: -1,
		imReSign: 1,
		precomputed: buildPrecomputedTable(1, -1, 1),
	}),
	bilinear: Object.freeze({
		key: 'B',
		imImSign: -1,
		reImSign: 1,
		imReSign: 1,
		precomputed: buildPrecomputedTable(-1, 1, 1),
	}),
});

/**
 * Precomputes all pairwise complex products for integer components in `[TABLE_MIN, TABLE_MAX]`.
 *
 * @param {number} imImSign
 * @param {number} reImSign
 * @param {number} imReSign
 * @returns {Int8Array}
 */
function buildPrecomputedTable(imImSign, reImSign, imReSign) {
	const table = new Int8Array(TABLE_ENTRIES * 2);
	let offset = 0;
	for (let aRe = TABLE_MIN; aRe <= TABLE_MAX; aRe++) {
		for (let aIm = TABLE_MIN; aIm <= TABLE_MAX; aIm++) {
			for (let bRe = TABLE_MIN; bRe <= TABLE_MAX; bRe++) {
				for (let bIm = TABLE_MIN; bIm <= TABLE_MAX; bIm++) {
					table[offset++] = aRe * bRe + imImSign * aIm * bIm;
					table[offset++] = reImSign * aRe * bIm + imReSign * aIm * bRe;
				}
			}
		}
	}
	return table;
}

/** @type {Map<string, Complex>} */
const pairCache = new Map();

/** @type {Map<string, Complex>} */
const vectorCache = new Map();

/**
 * Normalizes `-0` to `0`.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value;
}

/**
 * Checks whether a value is an integer within the precomputed lookup table bounds.
 *
 * @param {number} value
 * @returns {boolean}
 */
function isInPrecomputedRange(value) {
	return Number.isInteger(value) && value >= TABLE_MIN && value <= TABLE_MAX;
}

/**
 * Inserts an entry into a bounded LRU Map cache.
 *
 * @template V
 * @param {Map<string, V>} cache
 * @param {string} key
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
 * Retrieves an entry from a bounded LRU Map cache, refreshing recency on hit.
 *
 * @template V
 * @param {Map<string, V>} cache
 * @param {string} key
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
 * Validates that an element is a valid complex number `{ re, im }` with finite numeric parts.
 *
 * @param {unknown} value
 * @param {string} vectorName
 * @param {number} index
 * @returns {Complex}
 */
function validateComplexElement(value, vectorName, index) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${vectorName}[${index}] must be a complex object { re, im }`);
	}
	const { re, im } = /** @type {{ re: unknown, im: unknown }} */ (value);
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${vectorName}[${index}] must have numeric re and im properties`);
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${vectorName}[${index}] must have finite re and im values`);
	}
	return { re: normalizeZero(re), im: normalizeZero(im) };
}

/**
 * Validates options passed to `dotProductComplexMemo`.
 *
 * @param {unknown} options
 * @returns {{ conjugate: boolean, useCache: boolean }}
 */
function validateOptions(options) {
	if (options === undefined) {
		return { conjugate: true, useCache: true };
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object');
	}
	const opts = /** @type {Record<string, unknown>} */ (options);
	const conjugate = opts.conjugate === undefined ? true : opts.conjugate;
	if (typeof conjugate !== 'boolean') {
		throw new TypeError('options.conjugate must be a boolean');
	}
	const useCache = opts.useCache === undefined ? true : opts.useCache;
	if (typeof useCache !== 'boolean') {
		throw new TypeError('options.useCache must be a boolean');
	}
	return { conjugate, useCache };
}

/**
 * Computes a single complex element product using the precomputed small-integer table,
 * falling back to the bounded element-product memo cache and table-driven arithmetic.
 *
 * @param {number} aRe
 * @param {number} aIm
 * @param {number} bRe
 * @param {number} bIm
 * @param {typeof MODE_TABLE.hermitian} mode
 * @param {boolean} useCache
 * @returns {Complex}
 */
function multiplyElement(aRe, aIm, bRe, bIm, mode, useCache) {
	if (
		isInPrecomputedRange(aRe) &&
		isInPrecomputedRange(aIm) &&
		isInPrecomputedRange(bRe) &&
		isInPrecomputedRange(bIm)
	) {
		const idx =
			((((aRe - TABLE_MIN) * TABLE_SPAN + (aIm - TABLE_MIN)) * TABLE_SPAN +
				(bRe - TABLE_MIN)) *
				TABLE_SPAN +
				(bIm - TABLE_MIN)) *
			2;
		return {
			re: mode.precomputed[idx],
			im: mode.precomputed[idx + 1],
		};
	}

	if (useCache) {
		const pairKey = `${mode.key}|${aRe},${aIm}|${bRe},${bIm}`;
		const cached = lruGet(pairCache, pairKey);
		if (cached !== undefined) {
			return cached;
		}
		const product = {
			re: normalizeZero(aRe * bRe + mode.imImSign * aIm * bIm),
			im: normalizeZero(mode.reImSign * aRe * bIm + mode.imReSign * aIm * bRe),
		};
		lruSet(pairCache, pairKey, product, MAX_PAIR_CACHE_SIZE);
		return product;
	}

	return {
		re: normalizeZero(aRe * bRe + mode.imImSign * aIm * bIm),
		im: normalizeZero(mode.reImSign * aRe * bIm + mode.imReSign * aIm * bRe),
	};
}

/**
 * Computes the complex vector dot product over arrays of `{ re, im }` complex numbers
 * using a table-driven, precomputed small-integer product table, and bounded LRU memoization.
 *
 * By default (`conjugate: true`), computes the Hermitian inner product:
 * `sum_{k=0}^{n-1} a[k] * conj(b[k])`.
 *
 * When `options.conjugate` is `false`, computes the bilinear dot product:
 * `sum_{k=0}^{n-1} a[k] * b[k]`.
 *
 * Always returns a fresh `{ re, im }` object so caller mutations cannot corrupt internal caches.
 *
 * @param {readonly Complex[]} a - First complex vector.
 * @param {readonly Complex[]} b - Second complex vector (must match length of `a`).
 * @param {DotProductComplexMemoOptions} [options] - Optional configuration.
 * @returns {Complex} The complex dot product `{ re, im }`.
 * @throws {TypeError} If `a`, `b`, any element, or `options` has an invalid type or shape.
 * @throws {RangeError} If `a` and `b` have different lengths or contain non-finite numbers.
 */
export function dotProductComplexMemo(a, b, options) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument a must be an array of complex numbers { re, im }');
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument b must be an array of complex numbers { re, im }');
	}
	if (a.length !== b.length) {
		throw new RangeError(`Vector length mismatch: a.length (${a.length}) !== b.length (${b.length})`);
	}

	const { conjugate, useCache } = validateOptions(options);
	const mode = conjugate ? MODE_TABLE.hermitian : MODE_TABLE.bilinear;
	const n = a.length;

	if (n === 0) {
		return { re: 0, im: 0 };
	}

	const normalizedA = new Array(n);
	const normalizedB = new Array(n);
	const keyParts = useCache ? new Array(n + 1) : null;
	if (keyParts !== null) {
		keyParts[0] = `${mode.key}:${n}`;
	}

	for (let i = 0; i < n; i++) {
		const ai = validateComplexElement(a[i], 'a', i);
		const bi = validateComplexElement(b[i], 'b', i);
		normalizedA[i] = ai;
		normalizedB[i] = bi;
		if (keyParts !== null) {
			keyParts[i + 1] = `${ai.re},${ai.im};${bi.re},${bi.im}`;
		}
	}

	let vectorKey = '';
	if (keyParts !== null) {
		vectorKey = keyParts.join('|');
		const cached = lruGet(vectorCache, vectorKey);
		if (cached !== undefined) {
			return { re: cached.re, im: cached.im };
		}
	}

	let sumRe = 0;
	let sumIm = 0;
	for (let i = 0; i < n; i++) {
		const ai = normalizedA[i];
		const bi = normalizedB[i];
		const prod = multiplyElement(ai.re, ai.im, bi.re, bi.im, mode, useCache);
		sumRe += prod.re;
		sumIm += prod.im;
	}

	const result = {
		re: normalizeZero(sumRe),
		im: normalizeZero(sumIm),
	};

	if (useCache) {
		lruSet(vectorCache, vectorKey, { re: result.re, im: result.im }, MAX_VECTOR_CACHE_SIZE);
	}

	return result;
}
