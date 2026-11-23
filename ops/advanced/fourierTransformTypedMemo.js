/**
 * Table-driven, memoized Discrete Fourier Transform (DFT / FFT) over Float64Array inputs.
 *
 * Precomputes and caches trigonometric twiddle-factor tables (and bit-reversal
 * permutation tables for power-of-two lengths) per transform size N, and memoizes
 * transform results for repeated identical Float64Array inputs with bounded LRU caches.
 *
 * Uses an iterative Cooley-Tukey radix-2 FFT in O(N log N) when N is a power of two,
 * and a table-driven cyclic-index DFT in O(N^2) with O(N) precomputed twiddle storage
 * for arbitrary non-power-of-two lengths.
 *
 * @module ops/advanced/fourierTransformTypedMemo
 */

const MAX_TABLE_CACHE_ENTRIES = 128;
const MAX_RESULT_CACHE_ENTRIES = 64;
const MAX_MEMOIZED_LENGTH = 4096;

/**
 * Cache of precomputed twiddle/bit-reversal tables keyed by transform length N.
 * @type {Map<number, { isPow2: boolean, cosTable: Float64Array, sinTable: Float64Array, bitRev: Uint32Array | null }>}
 */
const tableCache = new Map();

/**
 * Bounded LRU cache of computed transform results keyed by canonical input signature.
 * @type {Map<string, { real: Float64Array, imag: Float64Array, magnitude: Float64Array, phase: Float64Array }>}
 */
const resultCache = new Map();

/**
 * Checks whether a positive integer n is a power of two.
 * @param {number} n
 * @returns {boolean}
 */
function isPowerOfTwo(n) {
	return n > 0 && (n & (n - 1)) === 0;
}

/**
 * Inserts a key/value pair into a Map with bounded LRU eviction.
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
 * Retrieves a value from an LRU Map, refreshing its recency.
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
 * Returns (or precomputes and caches) trigonometric twiddle tables and optional
 * bit-reversal table for transform size n.
 * @param {number} n
 * @returns {{ isPow2: boolean, cosTable: Float64Array, sinTable: Float64Array, bitRev: Uint32Array | null }}
 */
function getTables(n) {
	const cached = lruGet(tableCache, n);
	if (cached) {
		return cached;
	}

	const pow2 = isPowerOfTwo(n);
	const twoPiOverN = (2 * Math.PI) / n;

	if (pow2) {
		const half = n >>> 1;
		const cosTable = new Float64Array(half);
		const sinTable = new Float64Array(half);
		for (let k = 0; k < half; k++) {
			const angle = twoPiOverN * k;
			cosTable[k] = Math.cos(angle);
			sinTable[k] = Math.sin(angle);
		}

		const bits = Math.round(Math.log2(n));
		const bitRev = new Uint32Array(n);
		for (let i = 0; i < n; i++) {
			let rev = 0;
			let x = i;
			for (let b = 0; b < bits; b++) {
				rev = (rev << 1) | (x & 1);
				x >>>= 1;
			}
			bitRev[i] = rev;
		}

		const entry = { isPow2: true, cosTable, sinTable, bitRev };
		lruSet(tableCache, n, entry, MAX_TABLE_CACHE_ENTRIES);
		return entry;
	}

	// Non-power-of-two: precompute cyclic twiddle table of length n
	const cosTable = new Float64Array(n);
	const sinTable = new Float64Array(n);
	for (let t = 0; t < n; t++) {
		const angle = twoPiOverN * t;
		cosTable[t] = Math.cos(angle);
		sinTable[t] = Math.sin(angle);
	}

	const entry = { isPow2: false, cosTable, sinTable, bitRev: null };
	lruSet(tableCache, n, entry, MAX_TABLE_CACHE_ENTRIES);
	return entry;
}

/**
 * Validates that every element in a Float64Array is finite.
 * @param {Float64Array} arr
 * @param {string} name
 */
function assertAllFinite(arr, name) {
	for (let i = 0; i < arr.length; i++) {
		if (!Number.isFinite(arr[i])) {
			throw new RangeError(
				`${name}[${i}] must be a finite number; received ${arr[i]}`
			);
		}
	}
}

/**
 * Builds an exact canonical cache key for memoization from IEEE-754 bit patterns.
 * Normalizes -0 to +0 so mathematically identical inputs share a cache entry.
 * @param {Float64Array} real
 * @param {Float64Array | null} imag
 * @param {boolean} inverse
 * @returns {string}
 */
function buildCacheKey(real, imag, inverse) {
	const n = real.length;
	const buf = new ArrayBuffer(8);
	const f64 = new Float64Array(buf);
	const u32 = new Uint32Array(buf);
	const parts = new Array(imag ? 2 * n + 2 : n + 2);
	parts[0] = inverse ? 'I' : 'F';
	parts[1] = String(n);

	let idx = 2;
	for (let i = 0; i < n; i++) {
		const v = real[i];
		f64[0] = v === 0 ? 0 : v;
		parts[idx++] = `${u32[1].toString(36)}:${u32[0].toString(36)}`;
	}
	if (imag) {
		for (let i = 0; i < n; i++) {
			const v = imag[i];
			f64[0] = v === 0 ? 0 : v;
			parts[idx++] = `${u32[1].toString(36)}:${u32[0].toString(36)}`;
		}
	}
	return parts.join(',');
}

/**
 * Returns defensive Float64Array clones of a cached transform result.
 * @param {{ real: Float64Array, imag: Float64Array, magnitude: Float64Array, phase: Float64Array }} entry
 * @returns {{ real: Float64Array, imag: Float64Array, magnitude: Float64Array, phase: Float64Array }}
 */
function cloneResult(entry) {
	return {
		real: entry.real.slice(),
		imag: entry.imag.slice(),
		magnitude: entry.magnitude.slice(),
		phase: entry.phase.slice(),
	};
}

/**
 * Computes the Discrete Fourier Transform (or its inverse) element-wise over
 * Float64Array inputs using precomputed/memoized twiddle tables and result memoization.
 *
 * Forward transform (`inverse = false`):
 *   X[k] = sum_{n=0}^{N-1} (real[n] + i * imag[n]) * exp(-i * 2 * pi * k * n / N)
 *
 * Inverse transform (`inverse = true`):
 *   x[n] = (1 / N) * sum_{k=0}^{N-1} (real[k] + i * imag[k]) * exp(+i * 2 * pi * k * n / N)
 *
 * @param {Float64Array} realInput - Real component samples (Float64Array of finite numbers).
 * @param {Float64Array | null} [imagInput=null] - Optional imaginary component samples (Float64Array of same length as realInput).
 * @param {{ inverse?: boolean }} [options={}] - Optional transform configuration.
 * @param {boolean} [options.inverse=false] - When true, computes the normalized inverse DFT (1/N scaling).
 * @returns {{ real: Float64Array, imag: Float64Array, magnitude: Float64Array, phase: Float64Array }}
 *   Transformed complex spectrum (or reconstructed signal) with element-wise Float64Array buffers.
 * @throws {TypeError} If inputs or options have invalid types.
 * @throws {RangeError} If realInput and imagInput lengths differ or any element is NaN/Infinity.
 */
export function fourierTransformTypedMemo(realInput, imagInput = null, options = {}) {
	if (!(realInput instanceof Float64Array)) {
		throw new TypeError('realInput must be a Float64Array');
	}

	let imag = null;
	if (imagInput !== null && imagInput !== undefined) {
		if (!(imagInput instanceof Float64Array)) {
			throw new TypeError('imagInput must be a Float64Array, null, or undefined');
		}
		if (imagInput.length !== realInput.length) {
			throw new RangeError(
				`imagInput length (${imagInput.length}) must match realInput length (${realInput.length})`
			);
		}
		imag = imagInput;
	}

	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object');
	}

	const { inverse = false } = options;
	if (typeof inverse !== 'boolean') {
		throw new TypeError('options.inverse must be a boolean');
	}

	assertAllFinite(realInput, 'realInput');
	if (imag) {
		assertAllFinite(imag, 'imagInput');
	}

	const n = realInput.length;
	if (n === 0) {
		return {
			real: new Float64Array(0),
			imag: new Float64Array(0),
			magnitude: new Float64Array(0),
			phase: new Float64Array(0),
		};
	}

	// Check result memoization cache for inputs up to MAX_MEMOIZED_LENGTH
	const shouldMemoize = n <= MAX_MEMOIZED_LENGTH;
	let cacheKey = '';
	if (shouldMemoize) {
		// Treat an all-zero imag array identically to null so cache hits are shared
		let hasNonZeroImag = false;
		if (imag) {
			for (let i = 0; i < n; i++) {
				if (imag[i] !== 0) {
					hasNonZeroImag = true;
					break;
				}
			}
		}
		cacheKey = buildCacheKey(realInput, hasNonZeroImag ? imag : null, inverse);
		const cached = lruGet(resultCache, cacheKey);
		if (cached) {
			return cloneResult(cached);
		}
	}

	const outReal = new Float64Array(n);
	const outImag = new Float64Array(n);

	if (n === 1) {
		outReal[0] = realInput[0] === 0 ? 0 : realInput[0];
		outImag[0] = imag ? (imag[0] === 0 ? 0 : imag[0]) : 0;
	} else {
		const { isPow2, cosTable, sinTable, bitRev } = getTables(n);
		const sign = inverse ? 1 : -1;

		if (isPow2 && bitRev) {
			// Bit-reversed copy into output buffers
			for (let i = 0; i < n; i++) {
				const j = bitRev[i];
				outReal[j] = realInput[i];
				outImag[j] = imag ? imag[i] : 0;
			}

			// Iterative radix-2 Cooley-Tukey butterflies using precomputed twiddle tables
			for (let size = 2; size <= n; size <<= 1) {
				const halfSize = size >>> 1;
				const tableStep = n / size;

				for (let start = 0; start < n; start += size) {
					for (let j = 0, tw = 0; j < halfSize; j++, tw += tableStep) {
						const wr = cosTable[tw];
						const wi = sign * sinTable[tw];

						const evenIdx = start + j;
						const oddIdx = evenIdx + halfSize;

						const or = outReal[oddIdx];
						const oi = outImag[oddIdx];

						const tr = or * wr - oi * wi;
						const ti = or * wi + oi * wr;

						const er = outReal[evenIdx];
						const ei = outImag[evenIdx];

						outReal[evenIdx] = er + tr;
						outImag[evenIdx] = ei + ti;
						outReal[oddIdx] = er - tr;
						outImag[oddIdx] = ei - ti;
					}
				}
			}
		} else {
			// Table-driven cyclic-index DFT for arbitrary non-power-of-two lengths
			for (let k = 0; k < n; k++) {
				let sumRe = 0;
				let sumIm = 0;
				let idx = 0;

				for (let t = 0; t < n; t++) {
					const c = cosTable[idx];
					const s = sign * sinTable[idx];

					const xr = realInput[t];
					const xi = imag ? imag[t] : 0;

					sumRe += xr * c - xi * s;
					sumIm += xr * s + xi * c;

					idx += k;
					if (idx >= n) {
						idx -= n;
					}
				}

				outReal[k] = sumRe;
				outImag[k] = sumIm;
			}
		}

		if (inverse) {
			const invN = 1 / n;
			for (let k = 0; k < n; k++) {
				outReal[k] *= invN;
				outImag[k] *= invN;
			}
		}
	}

	const magnitude = new Float64Array(n);
	const phase = new Float64Array(n);
	for (let k = 0; k < n; k++) {
		const re = outReal[k];
		const im = outImag[k];
		magnitude[k] = Math.hypot(re, im);
		phase[k] = Math.atan2(im, re);
	}

	const result = { real: outReal, imag: outImag, magnitude, phase };
	if (shouldMemoize) {
		lruSet(resultCache, cacheKey, result, MAX_RESULT_CACHE_ENTRIES);
		return cloneResult(result);
	}
	return result;
}
