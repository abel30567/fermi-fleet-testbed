/**
 * @fileoverview Memoized, table-driven discrete 1D linear convolution over Float64Array inputs.
 *
 * Uses a bounded LRU memoization cache keyed by exact IEEE-754 bit patterns of the inputs
 * and mode, combined with a table-driven precomputed radix-2 FFT twiddle/bit-reversal table
 * for large inputs and a direct precomputed-bounds loop for small inputs.
 */

const VALID_MODES = new Set(['full', 'same', 'valid']);
const FFT_WORK_THRESHOLD = 2048;
const MAX_CACHE_ENTRIES = 256;

/** @type {Map<string, Float64Array>} */
const resultCache = new Map();

/**
 * Precomputed radix-2 FFT lookup tables keyed by power-of-two transform size.
 * @type {Map<number, { bitRev: Uint32Array, cosTable: Float64Array, sinTable: Float64Array }>}
 */
const fftTableCache = new Map();

/**
 * Validates that a value is a Float64Array containing only finite numbers.
 *
 * @param {unknown} input - Value to validate.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If input is not a Float64Array.
 * @throws {RangeError} If input contains NaN or Infinity.
 */
function validateFloat64Array(input, name) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError(`${name} must be a Float64Array`);
	}
	for (let i = 0; i < input.length; i++) {
		if (!Number.isFinite(input[i])) {
			throw new RangeError(`${name}[${i}] must be a finite number`);
		}
	}
}

/**
 * Encodes a Float64Array slice into an exact canonical hex key based on IEEE-754 bits.
 * Normalizes -0 to +0 so numerically identical zero inputs share cache entries.
 *
 * @param {Float64Array} arr
 * @returns {string}
 */
function encodeFloat64ArrayKey(arr) {
	const view = new BigUint64Array(arr.buffer, arr.byteOffset, arr.length);
	const parts = new Array(arr.length);
	for (let i = 0; i < arr.length; i++) {
		const bits = view[i];
		// Map -0.0 (0x8000000000000000n) to +0.0 (0n)
		parts[i] = (bits === 0x8000000000000000n ? 0n : bits).toString(36);
	}
	return `${arr.length}:${parts.join(',')}`;
}

/**
 * Retrieves or precomputes the bit-reversal and twiddle factor lookup tables for a radix-2 FFT.
 *
 * @param {number} size - Power-of-two FFT length.
 * @returns {{ bitRev: Uint32Array, cosTable: Float64Array, sinTable: Float64Array }}
 */
function getFftTables(size) {
	let tables = fftTableCache.get(size);
	if (tables !== undefined) {
		return tables;
	}

	const bits = Math.round(Math.log2(size));
	const bitRev = new Uint32Array(size);
	for (let i = 0; i < size; i++) {
		let x = i;
		let rev = 0;
		for (let b = 0; b < bits; b++) {
			rev = (rev << 1) | (x & 1);
			x >>= 1;
		}
		bitRev[i] = rev;
	}

	const half = size >>> 1;
	const cosTable = new Float64Array(half);
	const sinTable = new Float64Array(half);
	const baseAngle = (-2 * Math.PI) / size;
	for (let k = 0; k < half; k++) {
		const angle = baseAngle * k;
		cosTable[k] = Math.cos(angle);
		sinTable[k] = Math.sin(angle);
	}

	tables = { bitRev, cosTable, sinTable };
	fftTableCache.set(size, tables);
	return tables;
}

/**
 * In-place iterative radix-2 Cooley-Tukey FFT using precomputed lookup tables.
 *
 * @param {Float64Array} re - Real part array of length `size`.
 * @param {Float64Array} im - Imaginary part array of length `size`.
 * @param {{ bitRev: Uint32Array, cosTable: Float64Array, sinTable: Float64Array }} tables
 * @param {boolean} inverse - Whether to compute the inverse FFT.
 */
function fftInPlace(re, im, tables, inverse) {
	const size = re.length;
	const { bitRev, cosTable, sinTable } = tables;

	for (let i = 0; i < size; i++) {
		const j = bitRev[i];
		if (i < j) {
			const tmpRe = re[i];
			re[i] = re[j];
			re[j] = tmpRe;

			const tmpIm = im[i];
			im[i] = im[j];
			im[j] = tmpIm;
		}
	}

	const sign = inverse ? -1 : 1;

	for (let len = 2; len <= size; len <<= 1) {
		const halfLen = len >>> 1;
		const step = size / len;
		for (let i = 0; i < size; i += len) {
			let twiddleIdx = 0;
			for (let j = 0; j < halfLen; j++) {
				const wRe = cosTable[twiddleIdx];
				const wIm = sign * sinTable[twiddleIdx];
				twiddleIdx += step;

				const uIdx = i + j;
				const vIdx = uIdx + halfLen;

				const vRe = re[vIdx];
				const vIm = im[vIdx];

				const tRe = vRe * wRe - vIm * wIm;
				const tIm = vRe * wIm + vIm * wRe;

				re[vIdx] = re[uIdx] - tRe;
				im[vIdx] = im[uIdx] - tIm;
				re[uIdx] += tRe;
				im[uIdx] += tIm;
			}
		}
	}

	if (inverse) {
		const invSize = 1 / size;
		for (let i = 0; i < size; i++) {
			re[i] *= invSize;
			im[i] *= invSize;
		}
	}
}

/**
 * Direct full discrete linear convolution for small/medium inputs.
 *
 * @param {Float64Array} signal
 * @param {Float64Array} kernel
 * @returns {Float64Array}
 */
function convolveDirectFull(signal, kernel) {
	const n = signal.length;
	const m = kernel.length;
	const out = new Float64Array(n + m - 1);

	for (let i = 0; i < n; i++) {
		const s = signal[i];
		if (s === 0) continue;
		for (let j = 0; j < m; j++) {
			out[i + j] += s * kernel[j];
		}
	}

	return out;
}

/**
 * FFT-accelerated full discrete linear convolution using precomputed lookup tables.
 *
 * @param {Float64Array} signal
 * @param {Float64Array} kernel
 * @returns {Float64Array}
 */
function convolveFftFull(signal, kernel) {
	const fullLen = signal.length + kernel.length - 1;
	let fftSize = 1;
	while (fftSize < fullLen) {
		fftSize <<= 1;
	}

	const tables = getFftTables(fftSize);
	const aRe = new Float64Array(fftSize);
	const aIm = new Float64Array(fftSize);
	const bRe = new Float64Array(fftSize);
	const bIm = new Float64Array(fftSize);

	aRe.set(signal);
	bRe.set(kernel);

	fftInPlace(aRe, aIm, tables, false);
	fftInPlace(bRe, bIm, tables, false);

	for (let i = 0; i < fftSize; i++) {
		const re = aRe[i] * bRe[i] - aIm[i] * bIm[i];
		const im = aRe[i] * bIm[i] + aIm[i] * bRe[i];
		aRe[i] = re;
		aIm[i] = im;
	}

	fftInPlace(aRe, aIm, tables, true);

	return aRe.slice(0, fullLen);
}

/**
 * Slices a full convolution result according to the requested output mode.
 *
 * @param {Float64Array} full
 * @param {number} signalLen
 * @param {number} kernelLen
 * @param {'full'|'same'|'valid'} mode
 * @returns {Float64Array}
 */
function applyMode(full, signalLen, kernelLen, mode) {
	if (mode === 'full') {
		return full;
	}
	if (mode === 'same') {
		const start = Math.floor((kernelLen - 1) / 2);
		return full.slice(start, start + signalLen);
	}
	// mode === 'valid'
	if (signalLen < kernelLen) {
		return new Float64Array(0);
	}
	return full.slice(kernelLen - 1, signalLen);
}

/**
 * Computes the discrete 1D linear convolution of two Float64Array inputs using a
 * memoized, table-driven implementation.
 *
 * For small workloads (`signal.length * kernel.length < 2048`), computes exact direct
 * convolution. For larger workloads, computes convolution via radix-2 Cooley-Tukey FFT
 * backed by precomputed bit-reversal and trigonometric twiddle-factor tables.
 * Results are memoized in a bounded LRU cache keyed by exact IEEE-754 input bit patterns,
 * returning a fresh Float64Array copy on every call to preserve cache immutability.
 *
 * @param {Float64Array} signal - Primary input signal array (finite Float64 values).
 * @param {Float64Array} kernel - Convolution kernel / impulse response array (finite Float64 values).
 * @param {object} [options] - Optional configuration.
 * @param {'full'|'same'|'valid'} [options.mode='full'] - Output sizing mode:
 *   - `'full'`: complete linear convolution of length `signal.length + kernel.length - 1`.
 *   - `'same'`: central portion of length `signal.length`, offset by `Math.floor((kernel.length - 1) / 2)`.
 *   - `'valid'`: fully overlapping portion of length `Math.max(0, signal.length - kernel.length + 1)`.
 * @param {boolean} [options.useCache=true] - Whether to read from and write to the memoization cache.
 * @returns {Float64Array} The convolved Float64Array result.
 * @throws {TypeError} If `signal` or `kernel` is not a Float64Array, or `options` / `options.useCache` has an invalid type.
 * @throws {RangeError} If any element is non-finite (NaN/Infinity) or `options.mode` is invalid.
 */
export function convolutionTypedMemo(signal, kernel, options = {}) {
	validateFloat64Array(signal, 'signal');
	validateFloat64Array(kernel, 'kernel');

	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object');
	}

	const { mode = 'full', useCache = true } = options;

	if (!VALID_MODES.has(mode)) {
		throw new RangeError(`mode must be one of "full", "same", or "valid"; received ${String(mode)}`);
	}
	if (typeof useCache !== 'boolean') {
		throw new TypeError('options.useCache must be a boolean');
	}

	if (signal.length === 0 || kernel.length === 0) {
		return new Float64Array(0);
	}

	if (mode === 'valid' && signal.length < kernel.length) {
		return new Float64Array(0);
	}

	let cacheKey = null;
	if (useCache) {
		cacheKey = `${mode}|${encodeFloat64ArrayKey(signal)}|${encodeFloat64ArrayKey(kernel)}`;
		const cached = resultCache.get(cacheKey);
		if (cached !== undefined) {
			// Refresh LRU position and return defensive copy
			resultCache.delete(cacheKey);
			resultCache.set(cacheKey, cached);
			return cached.slice();
		}
	}

	const work = signal.length * kernel.length;
	const full =
		work >= FFT_WORK_THRESHOLD
			? convolveFftFull(signal, kernel)
			: convolveDirectFull(signal, kernel);

	const result = applyMode(full, signal.length, kernel.length, mode);

	if (useCache && cacheKey !== null) {
		if (resultCache.size >= MAX_CACHE_ENTRIES) {
			const oldestKey = resultCache.keys().next().value;
			resultCache.delete(oldestKey);
		}
		resultCache.set(cacheKey, result.slice());
	}

	return result;
}
