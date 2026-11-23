/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * @typedef {{
 *   length: number,
 *   dirRe: Float64Array,
 *   dirIm: Float64Array,
 *   conjRe: Float64Array,
 *   conjIm: Float64Array
 * }} DirectionEntry
 */

/** Maximum entries retained in the normalized direction lookup table. */
const MAX_DIRECTION_ENTRIES = 256;

/** Maximum entries retained in the inner-product memoization table. */
const MAX_INNER_PRODUCT_ENTRIES = 512;

/** Maximum entries retained in the projection result memoization table. */
const MAX_PROJECTION_ENTRIES = 512;

/**
 * Normalize -0 to +0 to guarantee canonical keys and clean numeric outputs.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value;
}

/**
 * Build a DirectionEntry from pre-normalized coordinate arrays.
 *
 * @param {Float64Array} dirRe
 * @param {Float64Array} dirIm
 * @returns {DirectionEntry}
 */
function createDirectionEntry(dirRe, dirIm) {
	const length = dirRe.length;
	const conjRe = new Float64Array(length);
	const conjIm = new Float64Array(length);
	for (let i = 0; i < length; i++) {
		conjRe[i] = dirRe[i];
		conjIm[i] = normalizeZero(-dirIm[i]);
	}
	return { length, dirRe, dirIm, conjRe, conjIm };
}

/**
 * Build a precomputed table of canonical standard basis directions (e_k and i*e_k)
 * for dimensions 1 through 4 so common axes resolve directly from static memory.
 *
 * @returns {Map<string, DirectionEntry>}
 */
function buildPrecomputedDirections() {
	const table = new Map();
	for (let dim = 1; dim <= 4; dim++) {
		for (let axis = 0; axis < dim; axis++) {
			for (const [reVal, imVal] of [
				[1, 0],
				[-1, 0],
				[0, 1],
				[0, -1],
			]) {
				const dirRe = new Float64Array(dim);
				const dirIm = new Float64Array(dim);
				dirRe[axis] = reVal;
				dirIm[axis] = imVal;

				const keyParts = new Array(dim * 2);
				for (let i = 0; i < dim; i++) {
					keyParts[i * 2] = String(dirRe[i]);
					keyParts[i * 2 + 1] = String(dirIm[i]);
				}
				table.set(keyParts.join(','), createDirectionEntry(dirRe, dirIm));
			}
		}
	}
	return table;
}

/** Static precomputed table for canonical standard basis directions. */
const PRECOMPUTED_DIRECTIONS = buildPrecomputedDirections();

/** Bounded LRU cache of normalized direction tables keyed by serialized target vector `v`. */
const directionCache = new Map();

/** Bounded LRU cache of complex inner products `<u, e>` keyed by `uKey|vKey`. */
const innerProductCache = new Map();

/** Bounded LRU cache of flat projection coordinates `{ reArr, imArr }` keyed by `uKey|vKey`. */
const projectionCache = new Map();

/**
 * Retrieve an entry from a bounded LRU Map and refresh its recency.
 *
 * @template T
 * @param {Map<string, T>} cache
 * @param {string} key
 * @returns {T | undefined}
 */
function lruGet(cache, key) {
	if (!cache.has(key)) {
		return undefined;
	}
	const value = cache.get(key);
	cache.delete(key);
	cache.set(key, value);
	return value;
}

/**
 * Insert an entry into a bounded LRU Map, evicting the oldest entry if full.
 *
 * @template T
 * @param {Map<string, T>} cache
 * @param {string} key
 * @param {T} value
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
 * Validate a complex vector argument and build its canonical cache key.
 *
 * @param {unknown} vec
 * @param {string} name
 * @returns {string}
 */
function validateAndKeyVector(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an array of { re, im } complex objects`);
	}
	if (vec.length === 0) {
		throw new RangeError(`${name} must not be empty`);
	}

	const keyParts = new Array(vec.length * 2);
	for (let i = 0; i < vec.length; i++) {
		const elem = vec[i];
		if (elem === null || typeof elem !== 'object' || Array.isArray(elem)) {
			throw new TypeError(`${name}[${i}] must be a { re, im } object`);
		}
		const { re, im } = elem;
		if (typeof re !== 'number' || typeof im !== 'number') {
			throw new TypeError(`${name}[${i}].re and ${name}[${i}].im must be numbers`);
		}
		if (!Number.isFinite(re) || !Number.isFinite(im)) {
			throw new RangeError(`${name}[${i}].re and ${name}[${i}].im must be finite numbers`);
		}
		keyParts[i * 2] = String(normalizeZero(re));
		keyParts[i * 2 + 1] = String(normalizeZero(im));
	}

	return keyParts.join(',');
}

/**
 * Look up or compute the normalized unit direction table for non-zero complex vector `v`.
 * Uses max-component scaling to prevent overflow/underflow when computing `v / ||v||`.
 *
 * @param {Complex[]} v
 * @param {string} vKey
 * @returns {DirectionEntry}
 */
function getDirectionEntry(v, vKey) {
	const precomputed = PRECOMPUTED_DIRECTIONS.get(vKey);
	if (precomputed !== undefined) {
		return precomputed;
	}

	const cached = lruGet(directionCache, vKey);
	if (cached !== undefined) {
		return cached;
	}

	const n = v.length;
	let maxAbs = 0;
	for (let i = 0; i < n; i++) {
		const absRe = Math.abs(v[i].re);
		const absIm = Math.abs(v[i].im);
		if (absRe > maxAbs) maxAbs = absRe;
		if (absIm > maxAbs) maxAbs = absIm;
	}

	if (maxAbs === 0) {
		throw new RangeError('Target vector v must not be the zero vector');
	}

	let scaledNormSq = 0;
	for (let i = 0; i < n; i++) {
		const sRe = v[i].re / maxAbs;
		const sIm = v[i].im / maxAbs;
		scaledNormSq += sRe * sRe + sIm * sIm;
	}
	const scaledNorm = Math.sqrt(scaledNormSq);

	const dirRe = new Float64Array(n);
	const dirIm = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		dirRe[i] = normalizeZero(v[i].re / maxAbs / scaledNorm);
		dirIm[i] = normalizeZero(v[i].im / maxAbs / scaledNorm);
	}

	const entry = createDirectionEntry(dirRe, dirIm);
	lruSet(directionCache, vKey, entry, MAX_DIRECTION_ENTRIES);
	return entry;
}

/**
 * Look up or compute the Hermitian inner product `<u, e> = sum(u[k] * conj(e[k]))`
 * using the precomputed conjugated direction table.
 *
 * @param {Complex[]} u
 * @param {DirectionEntry} dirEntry
 * @param {string} pairKey
 * @returns {Complex}
 */
function getInnerProductWithDirection(u, dirEntry, pairKey) {
	const cached = lruGet(innerProductCache, pairKey);
	if (cached !== undefined) {
		return cached;
	}

	const { conjRe, conjIm } = dirEntry;
	let accRe = 0;
	let accIm = 0;
	for (let i = 0; i < u.length; i++) {
		const uRe = u[i].re;
		const uIm = u[i].im;
		const cRe = conjRe[i];
		const cIm = conjIm[i];
		// (uRe + i*uIm) * (cRe + i*cIm) where c = conj(e)
		accRe += uRe * cRe - uIm * cIm;
		accIm += uRe * cIm + uIm * cRe;
	}

	const result = {
		re: normalizeZero(accRe),
		im: normalizeZero(accIm),
	};
	lruSet(innerProductCache, pairKey, result, MAX_INNER_PRODUCT_ENTRIES);
	return result;
}

/**
 * Materialize a fresh array of `{ re, im }` complex objects from cached flat arrays.
 *
 * @param {Float64Array} reArr
 * @param {Float64Array} imArr
 * @returns {Complex[]}
 */
function cloneProjection(reArr, imArr) {
	const n = reArr.length;
	const out = new Array(n);
	for (let i = 0; i < n; i++) {
		out[i] = { re: reArr[i], im: imArr[i] };
	}
	return out;
}

/**
 * Compute the orthogonal projection of complex vector `u` onto non-zero complex vector `v`:
 *
 *   proj_v(u) = (<u, v> / <v, v>) * v = <u, e> * e
 *
 * where `<u, v> = sum_k u[k] * conj(v[k])` is the standard Hermitian inner product
 * (linear in the first argument, conjugate-linear in the second) and `e = v / ||v||`.
 *
 * Uses a precomputed basis direction table alongside bounded LRU memoization caches
 * for normalized directions, inner products, and projection coordinates. Always returns
 * a freshly cloned array of `{ re, im }` objects to preserve cache immutability.
 *
 * @param {Complex[]} u - Complex vector to project.
 * @param {Complex[]} v - Non-zero complex target vector to project onto.
 * @returns {Complex[]} Fresh array of `{ re, im }` objects representing `proj_v(u)`.
 * @throws {TypeError} If `u` or `v` is not an array, or any element is not a valid `{ re, im }` object with numeric fields.
 * @throws {RangeError} If `u` or `v` is empty, their lengths differ, any component is non-finite, or `v` is the zero vector.
 */
export function projectionComplexMemo(u, v) {
	const uKey = validateAndKeyVector(u, 'u');
	const vKey = validateAndKeyVector(v, 'v');

	if (u.length !== v.length) {
		throw new RangeError(
			`Vector length mismatch: u has length ${u.length}, v has length ${v.length}`,
		);
	}

	const pairKey = `${uKey}|${vKey}`;
	const cachedProj = lruGet(projectionCache, pairKey);
	if (cachedProj !== undefined) {
		return cloneProjection(cachedProj.reArr, cachedProj.imArr);
	}

	const dirEntry = getDirectionEntry(v, vKey);
	const coeff = getInnerProductWithDirection(u, dirEntry, pairKey);

	const n = dirEntry.length;
	const { dirRe, dirIm } = dirEntry;
	const reArr = new Float64Array(n);
	const imArr = new Float64Array(n);

	for (let i = 0; i < n; i++) {
		const eRe = dirRe[i];
		const eIm = dirIm[i];
		reArr[i] = normalizeZero(coeff.re * eRe - coeff.im * eIm);
		imArr[i] = normalizeZero(coeff.re * eIm + coeff.im * eRe);
	}

	lruSet(projectionCache, pairKey, { reArr, imArr }, MAX_PROJECTION_ENTRIES);
	return cloneProjection(reArr, imArr);
}
