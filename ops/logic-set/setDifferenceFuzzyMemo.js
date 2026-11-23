/**
 * Computes the Zadeh fuzzy set difference `A \ B` using a table-driven
 * precomputed lookup table for centesimal grades (`0.00`..`1.00` in steps of
 * `0.01`) combined with a bounded memoization cache for arbitrary off-grid
 * membership values in `[0, 1]`.
 *
 * Under Zadeh's fuzzy set operators:
 *   μ_{A \ B}(x) = μ_{A ∩ ¬B}(x) = min(μ_A(x), 1 - μ_B(x))
 *
 * Elements absent from a fuzzy set have implicit membership `0`.
 *
 * @param {Record<string, number> | Map<any, number>} setA - Minuend fuzzy set with membership degrees in `[0, 1]`.
 * @param {Record<string, number> | Map<any, number>} setB - Subtrahend fuzzy set with membership degrees in `[0, 1]`.
 * @param {object} [options] - Optional configuration.
 * @param {boolean} [options.includeZeros=false] - If `true`, retains zero-membership entries across the union of keys of `setA` and `setB`.
 * @param {Map<string, number>} [options.cache] - Optional `Map` used to memoize off-grid `(μ_A, μ_B)` evaluations.
 * @returns {Record<string, number> | Map<any, number>} A new fuzzy set (matching `setA`'s container type: `Map` or plain object) representing `A \ B`.
 * @throws {TypeError} If `setA`, `setB`, `options`, or any membership value has an invalid type.
 * @throws {RangeError} If any membership value is not a finite number in `[0, 1]`.
 */

const GRID_STEPS = 100;
const GRID_SIZE = GRID_STEPS + 1;
const MAX_PAIR_CACHE_SIZE = 4096;

/**
 * Precomputed lookup table for exact Zadeh fuzzy difference on the 0.01 grid:
 *   ZADEH_DIFF_TABLE[i * 101 + j] = min(i, 100 - j) / 100
 */
const ZADEH_DIFF_TABLE = new Float64Array(GRID_SIZE * GRID_SIZE);
for (let i = 0; i <= GRID_STEPS; i++) {
	const rowOffset = i * GRID_SIZE;
	for (let j = 0; j <= GRID_STEPS; j++) {
		ZADEH_DIFF_TABLE[rowOffset + j] = Math.min(i, GRID_STEPS - j) / GRID_STEPS;
	}
}

/** @type {Map<string, number>} */
const defaultPairMemo = new Map();

/**
 * Checks whether a value is a plain object (normal or null-prototype).
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

/**
 * Validates that a value is a valid fuzzy set container (`Map` or plain object).
 * @param {unknown} set
 * @param {string} name
 */
function assertFuzzySetContainer(set, name) {
	if (!(set instanceof Map) && !isPlainObject(set)) {
		throw new TypeError(`${name} must be a plain object or Map`);
	}
}

/**
 * Validates a fuzzy membership degree is a finite number in `[0, 1]` and
 * normalizes `-0` to `+0`.
 * @param {unknown} value
 * @param {string} setName
 * @param {unknown} key
 * @returns {number}
 */
function validateMembership(value, setName, key) {
	if (typeof value !== 'number') {
		throw new TypeError(
			`Membership value for key "${String(key)}" in ${setName} must be a number`
		);
	}
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError(
			`Membership value for key "${String(key)}" in ${setName} must be in [0, 1], got ${value}`
		);
	}
	return value === 0 ? 0 : value;
}

/**
 * Extracts validated `[key, membership]` entries into a normalized `Map`.
 * @param {Record<string, number> | Map<any, number>} set
 * @param {string} name
 * @returns {Map<any, number>}
 */
function normalizeFuzzySet(set, name) {
	assertFuzzySetContainer(set, name);
	const normalized = new Map();
	if (set instanceof Map) {
		for (const [key, value] of set.entries()) {
			normalized.set(key, validateMembership(value, name, key));
		}
	} else {
		for (const key of Object.keys(set)) {
			normalized.set(key, validateMembership(set[key], name, key));
		}
	}
	return normalized;
}

/**
 * Evaluates Zadeh fuzzy set difference `min(muA, 1 - muB)` via the precomputed
 * centesimal table with bounded memoization fallback for off-grid inputs.
 * @param {number} muA
 * @param {number} muB
 * @param {Map<string, number>} cache
 * @param {boolean} bounded
 * @returns {number}
 */
function zadehDiffLookup(muA, muB, cache, bounded) {
	const ai = Math.round(muA * GRID_STEPS);
	const bi = Math.round(muB * GRID_STEPS);
	if (ai / GRID_STEPS === muA && bi / GRID_STEPS === muB) {
		return ZADEH_DIFF_TABLE[ai * GRID_SIZE + bi];
	}

	const cacheKey = `${muA}|${muB}`;
	const cached = cache.get(cacheKey);
	if (cached !== undefined) {
		return cached;
	}

	const raw = Math.min(muA, 1 - muB);
	const result = raw <= 0 ? 0 : raw >= 1 ? 1 : raw;

	if (bounded && cache.size >= MAX_PAIR_CACHE_SIZE) {
		const oldestKey = cache.keys().next().value;
		cache.delete(oldestKey);
	}
	cache.set(cacheKey, result);
	return result;
}

/**
 * Safely assigns an own enumerable property on a plain object (including `__proto__`).
 * @param {Record<string, number>} target
 * @param {string} key
 * @param {number} value
 */
function setOwnProperty(target, key, value) {
	if (key === '__proto__') {
		Object.defineProperty(target, key, {
			value,
			enumerable: true,
			writable: true,
			configurable: true,
		});
	} else {
		target[key] = value;
	}
}

export function setDifferenceFuzzyMemo(setA, setB, options = {}) {
	if (!isPlainObject(options)) {
		throw new TypeError('options must be a plain object');
	}

	const { includeZeros = false, cache } = options;

	if (typeof includeZeros !== 'boolean') {
		throw new TypeError('options.includeZeros must be a boolean');
	}
	if (cache !== undefined && !(cache instanceof Map)) {
		throw new TypeError('options.cache must be a Map');
	}

	const mapA = normalizeFuzzySet(setA, 'setA');
	const mapB = normalizeFuzzySet(setB, 'setB');

	const activeCache = cache ?? defaultPairMemo;
	const bounded = cache === undefined;
	const returnMap = setA instanceof Map;
	const result = returnMap ? new Map() : {};

	for (const [key, muA] of mapA.entries()) {
		const muB = mapB.get(key) ?? 0;
		const diff = zadehDiffLookup(muA, muB, activeCache, bounded);
		if (includeZeros || diff > 0) {
			if (returnMap) {
				result.set(key, diff);
			} else {
				setOwnProperty(result, key, diff);
			}
		}
	}

	if (includeZeros) {
		for (const [key, muB] of mapB.entries()) {
			if (!mapA.has(key)) {
				const diff = zadehDiffLookup(0, muB, activeCache, bounded);
				if (returnMap) {
					result.set(key, diff);
				} else {
					setOwnProperty(result, String(key), diff);
				}
			}
		}
	}

	return result;
}
