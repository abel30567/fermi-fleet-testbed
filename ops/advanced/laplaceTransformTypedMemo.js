/**
 * Bounded LRU cache of precomputed trapezoidal Laplace quadrature weight tables.
 * Each key `"<n>:<dt>:<s>"` maps to a Float64Array of length `n` storing:
 *   w[0]     = 0.5 * dt
 *   w[k]     = dt * exp(-s * k * dt)          for 1 <= k <= n - 2
 *   w[n - 1] = 0.5 * dt * exp(-s * (n - 1) * dt)
 *
 * @type {Map<string, Float64Array>}
 */
const kernelCache = new Map();

/** Maximum number of distinct precomputed kernel tables retained in memory. */
const MAX_CACHE_ENTRIES = 256;

/** Maximum total Float64 elements retained across all cached kernel tables. */
const MAX_CACHE_ELEMENTS = 1_000_000;

/** Current total number of Float64 elements stored in `kernelCache`. */
let cachedElementCount = 0;

/**
 * Retrieves or builds and caches the precomputed trapezoidal quadrature kernel
 * for `(n, dt, s)`. Returns `null` if a single table exceeds `MAX_CACHE_ELEMENTS`,
 * signalling the caller to evaluate on the fly without caching.
 *
 * @param {number} n - Number of time samples (n >= 2).
 * @param {number} dt - Positive finite sampling interval.
 * @param {number} s - Normalized finite Laplace frequency parameter (-0 mapped to 0).
 * @returns {Float64Array | null} Precomputed weight table or `null` when too large to cache.
 */
function getOrBuildKernel(n, dt, s) {
	if (n > MAX_CACHE_ELEMENTS) {
		return null;
	}

	const key = `${n}:${dt}:${s}`;
	const existing = kernelCache.get(key);
	if (existing !== undefined) {
		// Refresh LRU position.
		kernelCache.delete(key);
		kernelCache.set(key, existing);
		return existing;
	}

	const weights = new Float64Array(n);
	const halfDt = 0.5 * dt;
	const last = n - 1;

	weights[0] = halfDt;
	if (s === 0) {
		for (let k = 1; k < last; k++) {
			weights[k] = dt;
		}
		weights[last] = halfDt;
	} else {
		const negSDt = -s * dt;
		for (let k = 1; k < last; k++) {
			weights[k] = dt * Math.exp(negSDt * k);
		}
		weights[last] = halfDt * Math.exp(negSDt * last);
	}

	// Evict least-recently-used entries until within configured bounds.
	while (
		kernelCache.size > 0 &&
		(kernelCache.size >= MAX_CACHE_ENTRIES ||
			cachedElementCount + n > MAX_CACHE_ELEMENTS)
	) {
		const oldestKey = kernelCache.keys().next().value;
		const oldest = kernelCache.get(oldestKey);
		kernelCache.delete(oldestKey);
		cachedElementCount -= oldest.length;
	}

	kernelCache.set(key, weights);
	cachedElementCount += n;
	return weights;
}

/**
 * Computes a Neumaier-compensated dot product between `samples` and `kernel`.
 *
 * @param {Float64Array} samples - Signal samples f(t_k).
 * @param {Float64Array} kernel - Precomputed quadrature weights w_k(s).
 * @returns {number} Approximated integral value.
 */
function dotProductCompensated(samples, kernel) {
	const n = samples.length;
	let sum = 0;
	let comp = 0;

	for (let k = 0; k < n; k++) {
		const x = samples[k];
		if (x === 0) continue;
		const term = x * kernel[k];
		const next = sum + term;
		if (Number.isFinite(next)) {
			if (Math.abs(sum) >= Math.abs(term)) {
				comp += sum - next + term;
			} else {
				comp += term - next + sum;
			}
		}
		sum = next;
	}

	return Number.isFinite(sum) ? sum + comp : sum;
}

/**
 * Fallback direct trapezoidal evaluation when `samples.length > MAX_CACHE_ELEMENTS`.
 *
 * @param {Float64Array} samples - Signal samples f(t_k).
 * @param {number} dt - Positive finite sampling interval.
 * @param {number} s - Normalized finite Laplace frequency parameter.
 * @returns {number} Approximated integral value.
 */
function evaluateDirect(samples, dt, s) {
	const n = samples.length;
	const last = n - 1;
	const halfDt = 0.5 * dt;
	const negSDt = -s * dt;

	let sum = 0;
	let comp = 0;

	for (let k = 0; k < n; k++) {
		const x = samples[k];
		if (x === 0) continue;
		const baseWeight = k === 0 || k === last ? halfDt : dt;
		const weight = s === 0 || k === 0 ? baseWeight : baseWeight * Math.exp(negSDt * k);
		const term = x * weight;
		const next = sum + term;
		if (Number.isFinite(next)) {
			if (Math.abs(sum) >= Math.abs(term)) {
				comp += sum - next + term;
			} else {
				comp += term - next + sum;
			}
		}
		sum = next;
	}

	return Number.isFinite(sum) ? sum + comp : sum;
}

/**
 * Evaluates the numerical unilateral Laplace transform of a uniformly sampled
 * signal element-wise over a `Float64Array` of Laplace frequency values `s`,
 * using precomputed, LRU-memoized composite trapezoidal quadrature tables and
 * per-call result memoization for repeated frequency values.
 *
 * For samples `f[k] = f(k * dt)` (`k = 0, ..., n - 1`, `T = (n - 1) * dt`),
 * each output element approximates:
 *
 *   F(s_j) = integral from 0 to T of f(t) * exp(-s_j * t) dt
 *
 * using the composite trapezoidal rule with Neumaier compensated summation.
 * For `n < 2`, the integration interval has zero width and every entry is `0`.
 *
 * @param {Float64Array} samples - Uniformly sampled real signal values `f(k * dt)`.
 * @param {Float64Array} sValues - Real Laplace frequency values `s_j` to evaluate element-wise.
 * @param {number} [dt=1] - Positive finite uniform time step between consecutive samples.
 * @returns {Float64Array} Element-wise Laplace transform values `F(sValues[j])`.
 * @throws {TypeError} If `samples` or `sValues` is not a `Float64Array`, or `dt` is not a number.
 * @throws {RangeError} If `dt` is not finite and positive, or any element of `samples` or `sValues` is non-finite.
 */
export function laplaceTransformTypedMemo(samples, sValues, dt = 1) {
	if (!(samples instanceof Float64Array)) {
		throw new TypeError('samples must be a Float64Array');
	}
	if (!(sValues instanceof Float64Array)) {
		throw new TypeError('sValues must be a Float64Array');
	}
	if (typeof dt !== 'number') {
		throw new TypeError('dt must be a number');
	}
	if (!Number.isFinite(dt) || dt <= 0) {
		throw new RangeError('dt must be a finite positive number');
	}

	const n = samples.length;
	for (let k = 0; k < n; k++) {
		if (!Number.isFinite(samples[k])) {
			throw new RangeError(`samples[${k}] must be a finite number`);
		}
	}

	const m = sValues.length;
	for (let j = 0; j < m; j++) {
		if (!Number.isFinite(sValues[j])) {
			throw new RangeError(`sValues[${j}] must be a finite number`);
		}
	}

	const result = new Float64Array(m);
	if (m === 0 || n < 2) {
		return result;
	}

	// Per-call memo avoids repeating dot products for duplicate s values.
	const localMemo = new Map();

	for (let j = 0; j < m; j++) {
		const rawS = sValues[j];
		const s = rawS === 0 ? 0 : rawS;

		if (localMemo.has(s)) {
			result[j] = localMemo.get(s);
			continue;
		}

		const kernel = getOrBuildKernel(n, dt, s);
		const value =
			kernel !== null
				? dotProductCompensated(samples, kernel)
				: evaluateDirect(samples, dt, s);

		localMemo.set(s, value);
		result[j] = value;
	}

	return result;
}
