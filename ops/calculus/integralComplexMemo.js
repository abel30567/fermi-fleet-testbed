/**
 * Precomputed Gauss-Legendre quadrature node and weight tables on [-1, 1],
 * keyed by quadrature order. Each order p integrates polynomials up to
 * degree 2p - 1 exactly on every subinterval.
 *
 * @type {Readonly<Record<number, Readonly<{ nodes: Float64Array, weights: Float64Array }>>>}
 */
const GAUSS_LEGENDRE_TABLES = Object.freeze({
	2: Object.freeze({
		nodes: new Float64Array([
			-0.5773502691896257,
			0.5773502691896257,
		]),
		weights: new Float64Array([
			1.0,
			1.0,
		]),
	}),
	4: Object.freeze({
		nodes: new Float64Array([
			-0.8611363115940526,
			-0.33998104358485626,
			0.33998104358485626,
			0.8611363115940526,
		]),
		weights: new Float64Array([
			0.34785484513745385,
			0.6521451548625461,
			0.6521451548625461,
			0.34785484513745385,
		]),
	}),
	8: Object.freeze({
		nodes: new Float64Array([
			-0.9602898564975363,
			-0.7966664774136267,
			-0.525532409916329,
			-0.1834346424956498,
			0.1834346424956498,
			0.525532409916329,
			0.7966664774136267,
			0.9602898564975363,
		]),
		weights: new Float64Array([
			0.10122853629037626,
			0.22238103445337448,
			0.3137066458778873,
			0.362683783378362,
			0.362683783378362,
			0.3137066458778873,
			0.22238103445337448,
			0.10122853629037626,
		]),
	}),
	16: Object.freeze({
		nodes: new Float64Array([
			-0.9894009349916499,
			-0.9445750230732326,
			-0.8656312023878318,
			-0.755404408355003,
			-0.6178762444026438,
			-0.4580167776572274,
			-0.2816035507792589,
			-0.09501250983763744,
			0.09501250983763744,
			0.2816035507792589,
			0.4580167776572274,
			0.6178762444026438,
			0.755404408355003,
			0.8656312023878318,
			0.9445750230732326,
			0.9894009349916499,
		]),
		weights: new Float64Array([
			0.027152459411754096,
			0.062253523938647894,
			0.09515851168249279,
			0.12462897125553388,
			0.14959598881657674,
			0.16915651939500254,
			0.18260341504492358,
			0.1894506104550685,
			0.1894506104550685,
			0.18260341504492358,
			0.16915651939500254,
			0.14959598881657674,
			0.12462897125553388,
			0.09515851168249279,
			0.062253523938647894,
			0.027152459411754096,
		]),
	}),
});

const SUPPORTED_ORDERS = Object.freeze([2, 4, 8, 16]);
const DEFAULT_SUBINTERVALS = 16;
const DEFAULT_ORDER = 16;
const DEFAULT_MAX_CACHE_SIZE = 256;

/**
 * Per-integrand memoization store. WeakMap ensures integrand closures can be
 * garbage collected once no longer referenced by callers; each entry holds a
 * bounded LRU Map keyed by serialized endpoints and quadrature parameters.
 *
 * @type {WeakMap<Function, Map<string, { re: number, im: number }>>}
 */
const memoCache = new WeakMap();

/**
 * Normalizes -0 to +0 for consistent keys and outputs.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value;
}

/**
 * Validates that a value is a finite complex object `{ re, im }`.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {{ re: number, im: number }}
 */
function validateComplex(value, name) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`${name} must be a complex number object { re, im }`);
	}
	const { re, im } = /** @type {{ re: unknown, im: unknown }} */ (value);
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${name}.re and ${name}.im must be numbers`);
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${name}.re and ${name}.im must be finite numbers`);
	}
	return { re: normalizeZero(re), im: normalizeZero(im) };
}

/**
 * Validates and normalizes the optional configuration object.
 *
 * @param {unknown} options
 * @returns {{ subintervals: number, order: number, useCache: boolean, maxCacheSize: number }}
 */
function validateOptions(options) {
	if (options === undefined) {
		return {
			subintervals: DEFAULT_SUBINTERVALS,
			order: DEFAULT_ORDER,
			useCache: true,
			maxCacheSize: DEFAULT_MAX_CACHE_SIZE,
		};
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object');
	}

	const opts = /** @type {Record<string, unknown>} */ (options);

	let subintervals = DEFAULT_SUBINTERVALS;
	if (opts.subintervals !== undefined) {
		if (typeof opts.subintervals !== 'number') {
			throw new TypeError('options.subintervals must be a number');
		}
		if (!Number.isInteger(opts.subintervals) || opts.subintervals < 1) {
			throw new RangeError('options.subintervals must be a positive integer');
		}
		subintervals = opts.subintervals;
	}

	let order = DEFAULT_ORDER;
	if (opts.order !== undefined) {
		if (typeof opts.order !== 'number') {
			throw new TypeError('options.order must be a number');
		}
		if (!Object.prototype.hasOwnProperty.call(GAUSS_LEGENDRE_TABLES, opts.order)) {
			throw new RangeError(
				`options.order must be one of ${SUPPORTED_ORDERS.join(', ')}`,
			);
		}
		order = opts.order;
	}

	let useCache = true;
	if (opts.useCache !== undefined) {
		if (typeof opts.useCache !== 'boolean') {
			throw new TypeError('options.useCache must be a boolean');
		}
		useCache = opts.useCache;
	}

	let maxCacheSize = DEFAULT_MAX_CACHE_SIZE;
	if (opts.maxCacheSize !== undefined) {
		if (typeof opts.maxCacheSize !== 'number') {
			throw new TypeError('options.maxCacheSize must be a number');
		}
		if (!Number.isInteger(opts.maxCacheSize) || opts.maxCacheSize < 1) {
			throw new RangeError('options.maxCacheSize must be a positive integer');
		}
		maxCacheSize = opts.maxCacheSize;
	}

	return { subintervals, order, useCache, maxCacheSize };
}

/**
 * Computes the complex line integral ∫_a^b f(z) dz along the straight-line
 * segment from complex endpoint `a` to complex endpoint `b` using precomputed
 * composite Gauss-Legendre quadrature tables and per-function LRU memoization.
 *
 * Results are cached in a `WeakMap` keyed by `fn` with a bounded `Map` per
 * integrand. Every call returns a fresh `{ re, im }` object so caller mutations
 * cannot corrupt cached entries.
 *
 * @param {(z: { re: number, im: number }) => { re: number, im: number }} fn
 *   Complex-valued integrand function receiving `{ re, im }` and returning `{ re, im }`.
 * @param {{ re: number, im: number }} a
 *   Lower complex bound (start of straight-line contour).
 * @param {{ re: number, im: number }} b
 *   Upper complex bound (end of straight-line contour).
 * @param {{
 *   subintervals?: number,
 *   order?: 2 | 4 | 8 | 16,
 *   useCache?: boolean,
 *   maxCacheSize?: number,
 * }} [options]
 *   Optional quadrature and memoization settings.
 * @returns {{ re: number, im: number }}
 *   Fresh `{ re, im }` object holding the approximated integral.
 */
export function integralComplexMemo(fn, a, b, options) {
	if (typeof fn !== 'function') {
		throw new TypeError('fn must be a function');
	}

	const start = validateComplex(a, 'a');
	const end = validateComplex(b, 'b');
	const { subintervals, order, useCache, maxCacheSize } = validateOptions(options);

	const cacheKey = `${start.re},${start.im}|${end.re},${end.im}|${subintervals}|${order}`;

	if (useCache) {
		const fnCache = memoCache.get(fn);
		if (fnCache !== undefined) {
			const cached = fnCache.get(cacheKey);
			if (cached !== undefined) {
				// Refresh recency for LRU eviction
				fnCache.delete(cacheKey);
				fnCache.set(cacheKey, cached);
				return { re: cached.re, im: cached.im };
			}
		}
	}

	let resultRe = 0;
	let resultIm = 0;

	if (start.re !== end.re || start.im !== end.im) {
		const { nodes, weights } = GAUSS_LEGENDRE_TABLES[order];
		const nodeCount = nodes.length;

		const totalDzRe = end.re - start.re;
		const totalDzIm = end.im - start.im;
		const stepRe = totalDzRe / subintervals;
		const stepIm = totalDzIm / subintervals;
		const halfStepRe = 0.5 * stepRe;
		const halfStepIm = 0.5 * stepIm;

		let sumRe = 0;
		let sumIm = 0;

		for (let k = 0; k < subintervals; k++) {
			const midRe = start.re + (k + 0.5) * stepRe;
			const midIm = start.im + (k + 0.5) * stepIm;

			let subRe = 0;
			let subIm = 0;

			for (let i = 0; i < nodeCount; i++) {
				const node = nodes[i];
				const weight = weights[i];
				const z = {
					re: midRe + halfStepRe * node,
					im: midIm + halfStepIm * node,
				};
				const fz = validateComplex(fn(z), 'fn(z)');
				subRe += weight * fz.re;
				subIm += weight * fz.im;
			}

			sumRe += subRe;
			sumIm += subIm;
		}

		// Multiply accumulated weighted sum by complex half-step (dz / 2)
		resultRe = normalizeZero(halfStepRe * sumRe - halfStepIm * sumIm);
		resultIm = normalizeZero(halfStepRe * sumIm + halfStepIm * sumRe);
	}

	if (useCache) {
		let fnCache = memoCache.get(fn);
		if (fnCache === undefined) {
			fnCache = new Map();
			memoCache.set(fn, fnCache);
		}
		while (fnCache.size >= maxCacheSize) {
			const oldestKey = fnCache.keys().next().value;
			fnCache.delete(oldestKey);
		}
		fnCache.set(cacheKey, { re: resultRe, im: resultIm });
	}

	return { re: resultRe, im: resultIm };
}
