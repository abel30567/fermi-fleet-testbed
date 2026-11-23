/**
 * @fileoverview Arbitrary-precision decimal matrix multiplication with
 * table-driven parsing, precomputed powers of 10, and multi-level memoization.
 *
 * Uses pure ESM and Node.js built-in BigInt with zero external dependencies.
 */

const DEFAULT_PRECISION = 20
const MAX_PRECISION = 100_000
const MAX_EXPONENT = 100_000

const INITIAL_POW10_LIMIT = 128
const MAX_PARSE_CACHE_SIZE = 4096
const MAX_PRODUCT_CACHE_SIZE = 8192
const MAX_CELL_CACHE_SIZE = 4096
const MAX_MATRIX_CACHE_SIZE = 256

/**
 * Valid decimal string syntax:
 * optional sign, integer/fractional digits (at least one digit), optional exponent.
 */
const DECIMAL_RE = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/

/**
 * Table-driven ASCII character code to digit value lookup table.
 * Indices 48 ('0') through 57 ('9') map to 0..9; all other indices are -1.
 * @type {Int8Array}
 */
const DIGIT_TABLE = new Int8Array(128).fill(-1)
for (let d = 0; d <= 9; d++) {
	DIGIT_TABLE[48 + d] = d
}

/**
 * Precomputed table of BigInt powers of 10: POW10_TABLE[k] === 10n ** BigInt(k).
 * Prepopulated for 0..128 and lazily extended/memoized for larger exponents.
 * @type {bigint[]}
 */
const POW10_TABLE = new Array(INITIAL_POW10_LIMIT + 1)
POW10_TABLE[0] = 1n
for (let i = 1; i <= INITIAL_POW10_LIMIT; i++) {
	POW10_TABLE[i] = POW10_TABLE[i - 1] * 10n
}

/**
 * Memoization cache for large powers of 10 beyond INITIAL_POW10_LIMIT.
 * @type {Map<number, bigint>}
 */
const POW10_EXTRA_CACHE = new Map()

/**
 * Memoization caches (bounded LRU).
 * @type {Map<string, { coeff: bigint, scale: number, canonical: string }>}
 */
const PARSE_CACHE = new Map()

/** @type {Map<string, { coeff: bigint, scale: number }>} */
const PRODUCT_CACHE = new Map()

/** @type {Map<string, string>} */
const CELL_CACHE = new Map()

/** @type {Map<string, string[][]>} */
const MATRIX_CACHE = new Map()

const cacheStats = {
	parseHits: 0,
	parseMisses: 0,
	productHits: 0,
	productMisses: 0,
	cellHits: 0,
	cellMisses: 0,
	matrixHits: 0,
	matrixMisses: 0,
}

/**
 * Retrieves an entry from an LRU Map cache, refreshing its recency on hit.
 * @template K, V
 * @param {Map<K, V>} cache
 * @param {K} key
 * @returns {V | undefined}
 */
function lruGet(cache, key) {
	if (!cache.has(key)) {
		return undefined
	}
	const value = cache.get(key)
	cache.delete(key)
	cache.set(key, value)
	return value
}

/**
 * Stores an entry in a bounded LRU Map cache, evicting the oldest entry if full.
 * @template K, V
 * @param {Map<K, V>} cache
 * @param {K} key
 * @param {V} value
 * @param {number} maxSize
 */
function lruSet(cache, key, value, maxSize) {
	if (cache.has(key)) {
		cache.delete(key)
	} else if (cache.size >= maxSize) {
		const oldestKey = cache.keys().next().value
		cache.delete(oldestKey)
	}
	cache.set(key, value)
}

/**
 * Returns 10n ** BigInt(exp) using the precomputed table and exponentiation-by-squaring
 * memoization for large exponents.
 * @param {number} exp Non-negative integer exponent.
 * @returns {bigint}
 */
function pow10(exp) {
	if (exp <= INITIAL_POW10_LIMIT) {
		return POW10_TABLE[exp]
	}
	const cached = lruGet(POW10_EXTRA_CACHE, exp)
	if (cached !== undefined) {
		return cached
	}
	// Binary exponentiation backed by precomputed table
	let result = 1n
	let base = 10n
	let e = exp
	while (e > 0) {
		if (e <= INITIAL_POW10_LIMIT) {
			// Combine remaining small exponent directly from table when base === 10n
			if (base === 10n) {
				result *= POW10_TABLE[e]
				break
			}
		}
		if ((e & 1) === 1) {
			result *= base
		}
		e >>= 1
		if (e > 0) {
			base *= base
		}
	}
	lruSet(POW10_EXTRA_CACHE, exp, result, 512)
	return result
}

/**
 * Converts a non-empty string of ASCII digits to a BigInt using DIGIT_TABLE
 * in 15-digit safe-integer chunks and POW10_TABLE scaling.
 * @param {string} digits
 * @returns {bigint}
 */
function digitsToBigInt(digits) {
	const CHUNK_SIZE = 15
	let acc = 0n
	const len = digits.length
	let pos = 0

	while (pos < len) {
		const end = pos + CHUNK_SIZE < len ? pos + CHUNK_SIZE : len
		const chunkLen = end - pos
		let chunkVal = 0
		for (let i = pos; i < end; i++) {
			chunkVal = chunkVal * 10 + DIGIT_TABLE[digits.charCodeAt(i)]
		}
		acc = acc === 0n ? BigInt(chunkVal) : acc * pow10(chunkLen) + BigInt(chunkVal)
		pos = end
	}

	return acc
}

/**
 * Parses and normalizes a decimal string into `{ coeff, scale, canonical }`
 * where value === coeff * 10^(-scale), scale >= 0, and trailing zeros are stripped
 * when scale > 0. Zero always normalizes to `{ coeff: 0n, scale: 0, canonical: '0' }`.
 *
 * @param {unknown} value
 * @param {string} matrixName
 * @param {number} rowIndex
 * @param {number} colIndex
 * @returns {{ coeff: bigint, scale: number, canonical: string }}
 */
function parseDecimal(value, matrixName, rowIndex, colIndex) {
	if (typeof value !== 'string') {
		throw new TypeError(
			`${matrixName}[${rowIndex}][${colIndex}] must be a decimal string, received ${
				value === null ? 'null' : typeof value
			}`
		)
	}

	const cached = lruGet(PARSE_CACHE, value)
	if (cached !== undefined) {
		cacheStats.parseHits++
		return cached
	}
	cacheStats.parseMisses++

	const match = DECIMAL_RE.exec(value)
	if (match === null) {
		throw new RangeError(
			`${matrixName}[${rowIndex}][${colIndex}] is not a valid decimal string: ${JSON.stringify(value)}`
		)
	}

	const sign = match[1]
	const intPart = match[2] ?? ''
	const fracPart = match[3] ?? match[4] ?? ''
	const expPart = match[5]

	let exp = 0
	if (expPart !== undefined) {
		exp = Number(expPart)
		if (!Number.isSafeInteger(exp) || Math.abs(exp) > MAX_EXPONENT) {
			throw new RangeError(
				`${matrixName}[${rowIndex}][${colIndex}] exponent out of supported range (±${MAX_EXPONENT}): ${JSON.stringify(
					value
				)}`
			)
		}
	}

	const combined = intPart + fracPart
	let start = 0
	while (start < combined.length && combined.charCodeAt(start) === 48) {
		start++
	}

	let parsed
	if (start === combined.length) {
		parsed = { coeff: 0n, scale: 0, canonical: '0' }
	} else {
		let end = combined.length
		let rawScale = fracPart.length - exp

		// Strip trailing zeros that cancel positive decimal scale
		if (rawScale > 0) {
			while (end > start && rawScale > 0 && combined.charCodeAt(end - 1) === 48) {
				end--
				rawScale--
			}
		}

		let coeff = digitsToBigInt(combined.slice(start, end))
		let scale = rawScale

		if (scale < 0) {
			const shift = -scale
			if (shift > MAX_EXPONENT) {
				throw new RangeError(
					`${matrixName}[${rowIndex}][${colIndex}] scaled magnitude exceeds supported exponent limit`
				)
			}
			coeff *= pow10(shift)
			scale = 0
		}

		if (sign === '-') {
			coeff = -coeff
		}

		const canonical = scale === 0 ? coeff.toString() : `${coeff}e-${scale}`
		parsed = { coeff, scale, canonical }
	}

	lruSet(PARSE_CACHE, value, parsed, MAX_PARSE_CACHE_SIZE)
	return parsed
}

/**
 * Validates a 2D decimal string matrix and returns its dimensions and parsed cells.
 *
 * @param {unknown} matrix
 * @param {string} name
 * @returns {{ rows: number, cols: number, data: Array<Array<{ coeff: bigint, scale: number, canonical: string }>> }}
 */
function validateAndParseMatrix(matrix, name) {
	if (!Array.isArray(matrix)) {
		throw new TypeError(`${name} must be a 2D array of decimal strings`)
	}
	if (matrix.length === 0) {
		throw new RangeError(`${name} must not be empty`)
	}

	const rows = matrix.length
	let cols = -1
	const data = new Array(rows)

	for (let r = 0; r < rows; r++) {
		const row = matrix[r]
		if (!Array.isArray(row)) {
			throw new TypeError(`${name}[${r}] must be an array of decimal strings`)
		}
		if (row.length === 0) {
			throw new RangeError(`${name}[${r}] must not be empty`)
		}
		if (cols === -1) {
			cols = row.length
		} else if (row.length !== cols) {
			throw new RangeError(
				`${name} must be a rectangular matrix (ragged row at index ${r}: expected ${cols} columns, got ${row.length})`
			)
		}

		const parsedRow = new Array(cols)
		for (let c = 0; c < cols; c++) {
			parsedRow[c] = parseDecimal(row[c], name, r, c)
		}
		data[r] = parsedRow
	}

	return { rows, cols, data }
}

/**
 * Memoized exact scalar multiplication of two parsed decimals.
 * Exploits commutativity so (a, b) and (b, a) share a single cache entry.
 *
 * @param {{ coeff: bigint, scale: number, canonical: string }} x
 * @param {{ coeff: bigint, scale: number, canonical: string }} y
 * @returns {{ coeff: bigint, scale: number }}
 */
function multiplyDecimalMemo(x, y) {
	if (x.coeff === 0n || y.coeff === 0n) {
		return { coeff: 0n, scale: 0 }
	}

	const key =
		x.canonical <= y.canonical
			? `${x.canonical}*${y.canonical}`
			: `${y.canonical}*${x.canonical}`

	const cached = lruGet(PRODUCT_CACHE, key)
	if (cached !== undefined) {
		cacheStats.productHits++
		return cached
	}
	cacheStats.productMisses++

	const product = {
		coeff: x.coeff * y.coeff,
		scale: x.scale + y.scale,
	}
	lruSet(PRODUCT_CACHE, key, product, MAX_PRODUCT_CACHE_SIZE)
	return product
}

/**
 * Formats an exact scaled BigInt (`coeff * 10^(-scale)`) into a canonical decimal
 * string rounded to at most `precision` fractional digits (round half-away-from-zero),
 * stripping trailing fractional zeros and normalizing `-0` to `"0"`.
 *
 * @param {bigint} coeff
 * @param {number} scale
 * @param {number} precision
 * @returns {string}
 */
function roundAndFormatDecimal(coeff, scale, precision) {
	if (coeff === 0n) {
		return '0'
	}

	let value = coeff
	let finalScale = scale

	if (finalScale > precision) {
		const divisor = pow10(finalScale - precision)
		const negative = value < 0n
		const absVal = negative ? -value : value
		const quotient = absVal / divisor
		const remainder = absVal % divisor
		// divisor is always 10^d with d >= 1, so divisor / 2n is exact 5 * 10^(d-1)
		const half = divisor / 2n
		const roundedAbs = remainder >= half ? quotient + 1n : quotient
		value = negative ? -roundedAbs : roundedAbs
		finalScale = precision
	}

	if (value === 0n) {
		return '0'
	}

	const negative = value < 0n
	const digits = (negative ? -value : value).toString()

	if (finalScale === 0) {
		return negative ? `-${digits}` : digits
	}

	let intPart
	let fracPart
	if (digits.length <= finalScale) {
		intPart = '0'
		fracPart = '0'.repeat(finalScale - digits.length) + digits
	} else {
		const splitAt = digits.length - finalScale
		intPart = digits.slice(0, splitAt)
		fracPart = digits.slice(splitAt)
	}

	let fracEnd = fracPart.length
	while (fracEnd > 0 && fracPart.charCodeAt(fracEnd - 1) === 48) {
		fracEnd--
	}

	if (fracEnd === 0) {
		return intPart === '0' ? '0' : negative ? `-${intPart}` : intPart
	}

	const trimmedFrac = fracEnd === fracPart.length ? fracPart : fracPart.slice(0, fracEnd)
	return negative ? `-${intPart}.${trimmedFrac}` : `${intPart}.${trimmedFrac}`
}

/**
 * Creates a fresh deep copy of a 2D string matrix so callers cannot mutate cached entries.
 * @param {string[][]} matrix
 * @returns {string[][]}
 */
function cloneMatrix(matrix) {
	return matrix.map((row) => row.slice())
}

/**
 * Multiplies two 2D matrices of arbitrary-precision decimal strings (`A * B`) using
 * exact `BigInt` arithmetic, precomputed powers-of-10 and ASCII digit tables, and
 * multi-level memoization (decimal parse, commutative product, cell dot-product,
 * and full matrix result caches).
 *
 * Each output cell is computed as an exact sum of exact products and then rounded
 * to at most `precision` fractional digits using round half-away-from-zero, with
 * trailing fractional zeros stripped and negative zero normalized to `"0"`.
 *
 * @param {string[][]} a Left matrix of shape `m x k` containing decimal strings.
 * @param {string[][]} b Right matrix of shape `k x n` containing decimal strings.
 * @param {number} [precision=20] Non-negative integer maximum fractional digits in output cells.
 * @returns {string[][]} Product matrix of shape `m x n` containing canonical decimal strings.
 * @throws {TypeError} If `a`, `b`, any row, any cell entry, or `precision` has an invalid type.
 * @throws {RangeError} If matrices are empty, ragged, dimensionally incompatible, contain invalid
 * decimal strings, or if `precision` is not a non-negative integer within range.
 */
export function matMulDecimalMemo(a, b, precision = DEFAULT_PRECISION) {
	if (typeof precision !== 'number') {
		throw new TypeError(`precision must be a number, received ${typeof precision}`)
	}
	if (!Number.isInteger(precision) || precision < 0 || precision > MAX_PRECISION) {
		throw new RangeError(
			`precision must be an integer between 0 and ${MAX_PRECISION}, received ${precision}`
		)
	}

	const parsedA = validateAndParseMatrix(a, 'a')
	const parsedB = validateAndParseMatrix(b, 'b')

	if (parsedA.cols !== parsedB.rows) {
		throw new RangeError(
			`Incompatible matrix dimensions for multiplication: ${parsedA.rows}x${parsedA.cols} and ${parsedB.rows}x${parsedB.cols}`
		)
	}

	const m = parsedA.rows
	const kDim = parsedA.cols
	const n = parsedB.cols

	// Build canonical row keys for A and transposed columns + keys for B
	const aRowKeys = new Array(m)
	for (let i = 0; i < m; i++) {
		const row = parsedA.data[i]
		const parts = new Array(kDim)
		for (let k = 0; k < kDim; k++) {
			parts[k] = row[k].canonical
		}
		aRowKeys[i] = parts.join(',')
	}

	const bCols = new Array(n)
	const bColKeys = new Array(n)
	for (let j = 0; j < n; j++) {
		const col = new Array(kDim)
		const parts = new Array(kDim)
		for (let k = 0; k < kDim; k++) {
			const cell = parsedB.data[k][j]
			col[k] = cell
			parts[k] = cell.canonical
		}
		bCols[j] = col
		bColKeys[j] = parts.join(',')
	}

	const matrixKey = `${precision}|${m}x${kDim}:${aRowKeys.join(';')}|${kDim}x${n}:${bColKeys.join(';')}`
	const cachedMatrix = lruGet(MATRIX_CACHE, matrixKey)
	if (cachedMatrix !== undefined) {
		cacheStats.matrixHits++
		return cloneMatrix(cachedMatrix)
	}
	cacheStats.matrixMisses++

	const result = new Array(m)
	for (let i = 0; i < m; i++) {
		const rowA = parsedA.data[i]
		const rowKey = aRowKeys[i]
		const outRow = new Array(n)

		for (let j = 0; j < n; j++) {
			const cellKey = `${precision}|${rowKey}|${bColKeys[j]}`
			const cachedCell = lruGet(CELL_CACHE, cellKey)
			if (cachedCell !== undefined) {
				cacheStats.cellHits++
				outRow[j] = cachedCell
				continue
			}
			cacheStats.cellMisses++

			const colB = bCols[j]
			const products = new Array(kDim)
			let maxScale = 0

			for (let k = 0; k < kDim; k++) {
				const prod = multiplyDecimalMemo(rowA[k], colB[k])
				products[k] = prod
				if (prod.coeff !== 0n && prod.scale > maxScale) {
					maxScale = prod.scale
				}
			}

			let sum = 0n
			for (let k = 0; k < kDim; k++) {
				const prod = products[k]
				if (prod.coeff !== 0n) {
					sum +=
						prod.scale === maxScale
							? prod.coeff
							: prod.coeff * pow10(maxScale - prod.scale)
				}
			}

			const formatted = roundAndFormatDecimal(sum, maxScale, precision)
			lruSet(CELL_CACHE, cellKey, formatted, MAX_CELL_CACHE_SIZE)
			outRow[j] = formatted
		}

		result[i] = outRow
	}

	lruSet(MATRIX_CACHE, matrixKey, cloneMatrix(result), MAX_MATRIX_CACHE_SIZE)
	return result
}

/**
 * Clears all internal memoization caches and resets cache statistics.
 */
matMulDecimalMemo.clearCache = function clearCache() {
	PARSE_CACHE.clear()
	PRODUCT_CACHE.clear()
	CELL_CACHE.clear()
	MATRIX_CACHE.clear()
	POW10_EXTRA_CACHE.clear()
	cacheStats.parseHits = 0
	cacheStats.parseMisses = 0
	cacheStats.productHits = 0
	cacheStats.productMisses = 0
	cacheStats.cellHits = 0
	cacheStats.cellMisses = 0
	cacheStats.matrixHits = 0
	cacheStats.matrixMisses = 0
}

/**
 * Returns a snapshot of internal memoization cache hit/miss counts and sizes.
 * @returns {{
 *   parseHits: number,
 *   parseMisses: number,
 *   productHits: number,
 *   productMisses: number,
 *   cellHits: number,
 *   cellMisses: number,
 *   matrixHits: number,
 *   matrixMisses: number,
 *   sizes: { parse: number, product: number, cell: number, matrix: number, pow10Extra: number }
 * }}
 */
matMulDecimalMemo.getCacheStats = function getCacheStats() {
	return {
		...cacheStats,
		sizes: {
			parse: PARSE_CACHE.size,
			product: PRODUCT_CACHE.size,
			cell: CELL_CACHE.size,
			matrix: MATRIX_CACHE.size,
			pow10Extra: POW10_EXTRA_CACHE.size,
		},
	}
}
