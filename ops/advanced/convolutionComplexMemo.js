/**
 * Table-driven, memoized discrete convolution over complex number sequences.
 *
 * Complex numbers are represented as plain objects `{ re: number, im: number }`.
 *
 * Performance & caching architecture:
 * - Precomputed bit-reversal permutation tables and trigonometric twiddle-factor
 *   tables (`cos`/`sin`) are pre-seeded for small power-of-2 FFT sizes and lazily
 *   memoized for larger sizes, powering an iterative radix-2 Cooley-Tukey FFT.
 * - Full convolution results are memoized in a bounded LRU cache keyed by the
 *   canonical normalized inputs and options, returning defensive clones so caller
 *   mutations never corrupt cached entries.
 *
 * @module ops/advanced/convolutionComplexMemo
 */

const VALID_MODES = new Set(['full', 'same', 'valid', 'circular'])
const VALID_ALGORITHMS = new Set(['auto', 'direct', 'fft'])
const FFT_THRESHOLD = 64
const DEFAULT_MAX_CACHE_SIZE = 256

/**
 * Memoized table store for FFT bit-reversal and twiddle factors keyed by power-of-2 size.
 * @type {Map<number, { bitRev: Uint32Array, cos: Float64Array, sin: Float64Array }>}
 */
const fftTableCache = new Map()

/**
 * Bounded LRU memoization cache for convolution outputs.
 * @type {Map<string, Array<{ re: number, im: number }>>}
 */
const resultCache = new Map()

let cacheHits = 0
let cacheMisses = 0

/**
 * Normalize `-0` to `+0`.
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Return the smallest power of 2 greater than or equal to `n`.
 * @param {number} n
 * @returns {number}
 */
function nextPowerOfTwo(n) {
	let p = 1
	while (p < n) {
		p *= 2
	}
	return p
}

/**
 * Retrieve or compute and cache the bit-reversal and twiddle-factor tables for a
 * power-of-2 FFT size `size`.
 *
 * @param {number} size Power-of-2 transform length (>= 1).
 * @returns {{ bitRev: Uint32Array, cos: Float64Array, sin: Float64Array }}
 */
function getFftTables(size) {
	const existing = fftTableCache.get(size)
	if (existing !== undefined) {
		return existing
	}

	const bits = Math.round(Math.log2(size))
	const bitRev = new Uint32Array(size)
	for (let i = 0; i < size; i++) {
		let x = i
		let rev = 0
		for (let b = 0; b < bits; b++) {
			rev = (rev << 1) | (x & 1)
			x >>= 1
		}
		bitRev[i] = rev
	}

	const half = size >> 1
	const cos = new Float64Array(half)
	const sin = new Float64Array(half)
	const factor = (-2 * Math.PI) / size
	for (let k = 0; k < half; k++) {
		const angle = factor * k
		cos[k] = Math.cos(angle)
		sin[k] = Math.sin(angle)
	}

	const tables = { bitRev, cos, sin }
	fftTableCache.set(size, tables)
	return tables
}

// Precompute tables for common small power-of-2 sizes at module load.
for (let size = 1; size <= 64; size *= 2) {
	getFftTables(size)
}

/**
 * Validate a complex sequence array.
 * @param {unknown} seq
 * @param {string} name
 */
function validateComplexArray(seq, name) {
	if (!Array.isArray(seq)) {
		throw new TypeError(`${name} must be an Array of complex objects { re, im }`)
	}
	for (let i = 0; i < seq.length; i++) {
		const item = seq[i]
		if (item === null || typeof item !== 'object' || Array.isArray(item)) {
			throw new TypeError(`${name}[${i}] must be a non-null object with numeric { re, im }`)
		}
		if (typeof item.re !== 'number' || typeof item.im !== 'number') {
			throw new TypeError(`${name}[${i}].re and ${name}[${i}].im must be numbers`)
		}
		if (!Number.isFinite(item.re) || !Number.isFinite(item.im)) {
			throw new RangeError(`${name}[${i}].re and ${name}[${i}].im must be finite numbers`)
		}
	}
}

/**
 * Validate and normalize options.
 * @param {unknown} options
 * @returns {{ mode: 'full' | 'same' | 'valid' | 'circular', algorithm: 'auto' | 'direct' | 'fft', useCache: boolean, maxCacheSize: number }}
 */
function parseOptions(options) {
	if (options === undefined) {
		return {
			mode: 'full',
			algorithm: 'auto',
			useCache: true,
			maxCacheSize: DEFAULT_MAX_CACHE_SIZE,
		}
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object when provided')
	}

	const {
		mode = 'full',
		algorithm = 'auto',
		useCache = true,
		maxCacheSize = DEFAULT_MAX_CACHE_SIZE,
	} = options

	if (typeof mode !== 'string') {
		throw new TypeError('options.mode must be a string')
	}
	if (!VALID_MODES.has(mode)) {
		throw new RangeError(`options.mode must be one of: ${[...VALID_MODES].join(', ')}`)
	}

	if (typeof algorithm !== 'string') {
		throw new TypeError('options.algorithm must be a string')
	}
	if (!VALID_ALGORITHMS.has(algorithm)) {
		throw new RangeError(`options.algorithm must be one of: ${[...VALID_ALGORITHMS].join(', ')}`)
	}

	if (typeof useCache !== 'boolean') {
		throw new TypeError('options.useCache must be a boolean')
	}

	if (typeof maxCacheSize !== 'number') {
		throw new TypeError('options.maxCacheSize must be a number')
	}
	if (!Number.isInteger(maxCacheSize) || maxCacheSize < 0) {
		throw new RangeError('options.maxCacheSize must be a non-negative integer')
	}

	return { mode, algorithm, useCache, maxCacheSize }
}

/**
 * Build a collision-free canonical cache key from validated inputs.
 * @param {Array<{ re: number, im: number }>} a
 * @param {Array<{ re: number, im: number }>} b
 * @param {string} mode
 * @param {string} effectiveAlgorithm
 * @returns {string}
 */
function buildCacheKey(a, b, mode, effectiveAlgorithm) {
	const parts = [mode, effectiveAlgorithm, String(a.length), String(b.length)]
	for (let i = 0; i < a.length; i++) {
		parts.push(`${normalizeZero(a[i].re)},${normalizeZero(a[i].im)}`)
	}
	parts.push('|')
	for (let j = 0; j < b.length; j++) {
		parts.push(`${normalizeZero(b[j].re)},${normalizeZero(b[j].im)}`)
	}
	return parts.join(';')
}

/**
 * Return a deep clone of a complex array so callers cannot mutate cached entries.
 * @param {Array<{ re: number, im: number }>} seq
 * @returns {Array<{ re: number, im: number }>}
 */
function cloneComplexArray(seq) {
	const out = new Array(seq.length)
	for (let i = 0; i < seq.length; i++) {
		out[i] = { re: seq[i].re, im: seq[i].im }
	}
	return out
}

/**
 * In-place iterative radix-2 Cooley-Tukey FFT using precomputed tables.
 * @param {Float64Array} re
 * @param {Float64Array} im
 * @param {boolean} inverse
 */
function fftInPlace(re, im, inverse) {
	const n = re.length
	if (n <= 1) {
		return
	}

	const { bitRev, cos, sin } = getFftTables(n)

	for (let i = 0; i < n; i++) {
		const j = bitRev[i]
		if (i < j) {
			const tmpRe = re[i]
			re[i] = re[j]
			re[j] = tmpRe
			const tmpIm = im[i]
			im[i] = im[j]
			im[j] = tmpIm
		}
	}

	for (let len = 2; len <= n; len <<= 1) {
		const half = len >> 1
		const step = n / len
		for (let i = 0; i < n; i += len) {
			for (let j = 0; j < half; j++) {
				const twIdx = j * step
				const wr = cos[twIdx]
				const wi = inverse ? -sin[twIdx] : sin[twIdx]

				const u = i + j
				const v = u + half

				const tr = wr * re[v] - wi * im[v]
				const ti = wr * im[v] + wi * re[v]

				re[v] = re[u] - tr
				im[v] = im[u] - ti
				re[u] += tr
				im[u] += ti
			}
		}
	}

	if (inverse) {
		for (let i = 0; i < n; i++) {
			re[i] /= n
			im[i] /= n
		}
	}
}

/**
 * Direct O(M * N) full linear convolution over complex numbers.
 * @param {Array<{ re: number, im: number }>} a
 * @param {Array<{ re: number, im: number }>} b
 * @returns {Array<{ re: number, im: number }>}
 */
function convolveDirectFull(a, b) {
	const m = a.length
	const n = b.length
	const outLen = m + n - 1
	const outRe = new Float64Array(outLen)
	const outIm = new Float64Array(outLen)

	for (let i = 0; i < m; i++) {
		const ar = a[i].re
		const ai = a[i].im
		for (let j = 0; j < n; j++) {
			const br = b[j].re
			const bi = b[j].im
			const k = i + j
			outRe[k] += ar * br - ai * bi
			outIm[k] += ar * bi + ai * br
		}
	}

	const result = new Array(outLen)
	for (let k = 0; k < outLen; k++) {
		result[k] = {
			re: normalizeZero(outRe[k]),
			im: normalizeZero(outIm[k]),
		}
	}
	return result
}

/**
 * Table-driven O((M + N) log(M + N)) FFT full linear convolution over complex numbers.
 * @param {Array<{ re: number, im: number }>} a
 * @param {Array<{ re: number, im: number }>} b
 * @returns {Array<{ re: number, im: number }>}
 */
function convolveFftFull(a, b) {
	const outLen = a.length + b.length - 1
	const fftSize = nextPowerOfTwo(outLen)

	const aRe = new Float64Array(fftSize)
	const aIm = new Float64Array(fftSize)
	const bRe = new Float64Array(fftSize)
	const bIm = new Float64Array(fftSize)

	for (let i = 0; i < a.length; i++) {
		aRe[i] = a[i].re
		aIm[i] = a[i].im
	}
	for (let j = 0; j < b.length; j++) {
		bRe[j] = b[j].re
		bIm[j] = b[j].im
	}

	fftInPlace(aRe, aIm, false)
	fftInPlace(bRe, bIm, false)

	for (let k = 0; k < fftSize; k++) {
		const ar = aRe[k]
		const ai = aIm[k]
		const br = bRe[k]
		const bi = bIm[k]
		aRe[k] = ar * br - ai * bi
		aIm[k] = ar * bi + ai * br
	}

	fftInPlace(aRe, aIm, true)

	const result = new Array(outLen)
	for (let k = 0; k < outLen; k++) {
		result[k] = {
			re: normalizeZero(aRe[k]),
			im: normalizeZero(aIm[k]),
		}
	}
	return result
}

/**
 * Shape a full linear convolution result according to the requested mode.
 * @param {Array<{ re: number, im: number }>} full
 * @param {number} m Length of `a`
 * @param {number} n Length of `b`
 * @param {'full' | 'same' | 'valid' | 'circular'} mode
 * @returns {Array<{ re: number, im: number }>}
 */
function applyMode(full, m, n, mode) {
	if (mode === 'full') {
		return full
	}
	if (mode === 'same') {
		const start = Math.floor((n - 1) / 2)
		return full.slice(start, start + m)
	}
	if (mode === 'valid') {
		const minLen = Math.min(m, n)
		const maxLen = Math.max(m, n)
		const start = minLen - 1
		const len = maxLen - minLen + 1
		return full.slice(start, start + len)
	}
	// mode === 'circular': wrap full convolution modulo max(m, n)
	const circLen = Math.max(m, n)
	const out = new Array(circLen)
	for (let k = 0; k < circLen; k++) {
		out[k] = { re: 0, im: 0 }
	}
	for (let k = 0; k < full.length; k++) {
		const idx = k % circLen
		out[idx].re = normalizeZero(out[idx].re + full[k].re)
		out[idx].im = normalizeZero(out[idx].im + full[k].im)
	}
	return out
}

/**
 * Compute the discrete convolution of two complex sequences `{ re, im }[]` using
 * precomputed/memoized FFT twiddle tables and an LRU result cache.
 *
 * @param {Array<{ re: number, im: number }>} a First complex sequence.
 * @param {Array<{ re: number, im: number }>} b Second complex sequence (kernel).
 * @param {object} [options] Optional configuration.
 * @param {'full' | 'same' | 'valid' | 'circular'} [options.mode='full']
 *   Output shaping mode:
 *   - `'full'`: Full linear convolution of length `a.length + b.length - 1`.
 *   - `'same'`: Centered slice of length `a.length`.
 *   - `'valid'`: Fully overlapping region of length `max(M, N) - min(M, N) + 1`.
 *   - `'circular'`: Circular convolution of length `max(a.length, b.length)`.
 * @param {'auto' | 'direct' | 'fft'} [options.algorithm='auto']
 *   Computation strategy. `'auto'` selects exact direct convolution when
 *   `a.length * b.length <= 64` and table-driven Cooley-Tukey FFT otherwise.
 * @param {boolean} [options.useCache=true]
 *   Whether to read from and write to the memoization cache.
 * @param {number} [options.maxCacheSize=256]
 *   Maximum number of entries retained in the LRU result cache.
 * @returns {Array<{ re: number, im: number }>} Convolved complex sequence.
 * @throws {TypeError} If inputs or options have invalid types.
 * @throws {RangeError} If numbers are non-finite or option values are out of range.
 */
export function convolutionComplexMemo(a, b, options) {
	validateComplexArray(a, 'a')
	validateComplexArray(b, 'b')
	const { mode, algorithm, useCache, maxCacheSize } = parseOptions(options)

	if (a.length === 0 || b.length === 0) {
		return []
	}

	const effectiveAlgorithm =
		algorithm === 'auto'
			? a.length * b.length > FFT_THRESHOLD
				? 'fft'
				: 'direct'
			: algorithm

	let cacheKey = ''
	if (useCache) {
		cacheKey = buildCacheKey(a, b, mode, effectiveAlgorithm)
		const cached = resultCache.get(cacheKey)
		if (cached !== undefined) {
			// Refresh LRU recency
			resultCache.delete(cacheKey)
			resultCache.set(cacheKey, cached)
			cacheHits += 1
			return cloneComplexArray(cached)
		}
		cacheMisses += 1
	}

	const full =
		effectiveAlgorithm === 'fft' ? convolveFftFull(a, b) : convolveDirectFull(a, b)
	const result = applyMode(full, a.length, b.length, mode)

	if (useCache && maxCacheSize > 0) {
		while (resultCache.size >= maxCacheSize) {
			const oldestKey = resultCache.keys().next().value
			resultCache.delete(oldestKey)
		}
		resultCache.set(cacheKey, cloneComplexArray(result))
	}

	return result
}

/**
 * Clear the memoized convolution result cache and reset hit/miss counters.
 * Precomputed FFT twiddle tables remain intact unless `includeTables` is true.
 *
 * @param {boolean} [includeTables=false] Also clear dynamically cached FFT tables
 *   (and re-seed the default precomputed sizes 1..64).
 */
convolutionComplexMemo.clearCache = function clearCache(includeTables = false) {
	resultCache.clear()
	cacheHits = 0
	cacheMisses = 0
	if (includeTables) {
		fftTableCache.clear()
		for (let size = 1; size <= 64; size *= 2) {
			getFftTables(size)
		}
	}
}

/**
 * Return current memoization and precomputed table statistics.
 *
 * @returns {{ hits: number, misses: number, size: number, tableSizes: number[] }}
 */
convolutionComplexMemo.getCacheStats = function getCacheStats() {
	return {
		hits: cacheHits,
		misses: cacheMisses,
		size: resultCache.size,
		tableSizes: [...fftTableCache.keys()].sort((x, y) => x - y),
	}
}
