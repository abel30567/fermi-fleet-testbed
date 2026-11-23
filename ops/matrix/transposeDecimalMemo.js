/**
 * Arbitrary-precision decimal matrix transpose with table-driven index mapping,
 * precomputed powers of 10, and bounded LRU memoization.
 *
 * All entries are parsed and normalized using exact `BigInt` arithmetic
 * (round-half-away-from-zero to `precision` fractional digits, stripping
 * redundant leading/trailing zeros and normalizing `-0` to `"0"`).
 *
 * @module ops/matrix/transposeDecimalMemo
 */

const DEFAULT_PRECISION = 20
const PRECOMPUTED_POW10_LIMIT = 64
const MAX_INDEX_MAP_ENTRIES = 256
const MAX_NORMALIZE_ENTRIES = 4096
const MAX_RESULT_ENTRIES = 256

const DECIMAL_RE = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))$/

/**
 * Precomputed powers of 10 (`POW10_TABLE[k] === 10n ** BigInt(k)`),
 * seeded at module load for `0..PRECOMPUTED_POW10_LIMIT` and extended on demand.
 * @type {bigint[]}
 */
const POW10_TABLE = new Array(PRECOMPUTED_POW10_LIMIT + 1)
POW10_TABLE[0] = 1n
for (let i = 1; i <= PRECOMPUTED_POW10_LIMIT; i++) {
	POW10_TABLE[i] = POW10_TABLE[i - 1] * 10n
}

/**
 * Bounded cache of precomputed transpose gather tables keyed by `"rowsxcols"`.
 * Each `Uint32Array` maps destination flat index `c * rows + r` to source flat
 * index `r * cols + c`.
 * @type {Map<string, Uint32Array>}
 */
const INDEX_MAP_CACHE = new Map()

/**
 * Bounded cache of normalized decimal strings keyed by `"precision:raw"`.
 * @type {Map<string, string>}
 */
const NORMALIZE_CACHE = new Map()

/**
 * Bounded cache of transposed matrix snapshots keyed by precision, shape,
 * and length-prefixed raw cell values.
 * @type {Map<string, string[][]>}
 */
const RESULT_CACHE = new Map()

/**
 * Returns `10n ** BigInt(exp)` using the precomputed table, extending and
 * memoizing larger exponents on demand.
 *
 * @param {number} exp - Non-negative integer exponent.
 * @returns {bigint}
 */
function getPow10(exp) {
	if (exp < POW10_TABLE.length) {
		return POW10_TABLE[exp]
	}
	let val = POW10_TABLE[POW10_TABLE.length - 1]
	for (let i = POW10_TABLE.length; i <= exp; i++) {
		val *= 10n
		POW10_TABLE.push(val)
	}
	return val
}

/**
 * Reads a value from a `Map` while refreshing its LRU position.
 *
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
 * Inserts or updates a value in a bounded LRU `Map`.
 *
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
 * Returns a precomputed flat gather index map for transposing a `rows x cols`
 * matrix into a `cols x rows` matrix.
 *
 * @param {number} rows
 * @param {number} cols
 * @returns {Uint32Array}
 */
function getTransposeIndexMap(rows, cols) {
	const shapeKey = `${rows}x${cols}`
	const cached = lruGet(INDEX_MAP_CACHE, shapeKey)
	if (cached !== undefined) {
		return cached
	}
	const map = new Uint32Array(rows * cols)
	let dstIdx = 0
	for (let c = 0; c < cols; c++) {
		for (let r = 0; r < rows; r++) {
			map[dstIdx++] = r * cols + c
		}
	}
	lruSet(INDEX_MAP_CACHE, shapeKey, map, MAX_INDEX_MAP_ENTRIES)
	return map
}

/**
 * Validates, rounds (half-away-from-zero), and canonicalizes a single
 * arbitrary-precision decimal string using `BigInt` arithmetic and memoization.
 *
 * @param {string} raw - Input decimal string.
 * @param {number} precision - Non-negative integer maximum fractional digits.
 * @param {number} rowIndex - Row index for diagnostics.
 * @param {number} colIndex - Column index for diagnostics.
 * @returns {string} Canonical decimal string.
 */
function normalizeDecimal(raw, precision, rowIndex, colIndex) {
	const cacheKey = `${precision}:${raw}`
	const cached = lruGet(NORMALIZE_CACHE, cacheKey)
	if (cached !== undefined) {
		return cached
	}

	const match = DECIMAL_RE.exec(raw)
	if (match === null) {
		throw new RangeError(
			`Invalid decimal string at matrix[${rowIndex}][${colIndex}]: ${JSON.stringify(raw)}`
		)
	}

	const negative = match[1] === '-'
	const rawInt = match[2] ?? '0'
	const rawFrac = match[3] ?? match[4] ?? ''

	const intPart = rawInt.replace(/^0+/, '') || '0'
	const fracPart = rawFrac.replace(/0+$/, '')

	let normalized
	if (fracPart.length <= precision) {
		if (intPart === '0' && fracPart === '') {
			normalized = '0'
		} else {
			normalized =
				(negative ? '-' : '') +
				intPart +
				(fracPart.length > 0 ? `.${fracPart}` : '')
		}
	} else {
		const dropCount = fracPart.length - precision
		const unrounded = BigInt(intPart + fracPart)
		const divisor = getPow10(dropCount)
		const half = divisor / 2n
		const quotient = unrounded / divisor
		const remainder = unrounded % divisor
		const rounded = remainder >= half ? quotient + 1n : quotient

		if (rounded === 0n) {
			normalized = '0'
		} else if (precision === 0) {
			normalized = (negative ? '-' : '') + rounded.toString()
		} else {
			const digits = rounded.toString().padStart(precision + 1, '0')
			const splitAt = digits.length - precision
			const outInt = digits.slice(0, splitAt)
			const outFrac = digits.slice(splitAt).replace(/0+$/, '')
			normalized =
				(negative ? '-' : '') +
				outInt +
				(outFrac.length > 0 ? `.${outFrac}` : '')
		}
	}

	lruSet(NORMALIZE_CACHE, cacheKey, normalized, MAX_NORMALIZE_ENTRIES)
	return normalized
}

/**
 * Returns a fresh defensive copy of a 2D string matrix.
 *
 * @param {string[][]} matrix
 * @returns {string[][]}
 */
function cloneMatrix(matrix) {
	const copy = new Array(matrix.length)
	for (let r = 0; r < matrix.length; r++) {
		copy[r] = matrix[r].slice()
	}
	return copy
}

/**
 * Computes the transpose of a 2D matrix of arbitrary-precision decimal strings,
 * normalizing and rounding each entry to at most `precision` fractional digits
 * using `BigInt` arithmetic (round-half-away-from-zero).
 *
 * Uses precomputed powers of 10, cached transpose index maps per matrix shape,
 * memoized decimal normalization, and a bounded result cache returning safe
 * defensive copies so callers cannot corrupt cached entries.
 *
 * @param {string[][]} matrix - Non-empty rectangular 2D array of decimal strings.
 * @param {number} [precision=20] - Non-negative safe integer number of fractional digits to round to.
 * @returns {string[][]} Transposed `n x m` matrix of normalized decimal strings.
 * @throws {TypeError} If `matrix` is not a 2D array of strings or `precision` is not a number.
 * @throws {RangeError} If `matrix` is empty, ragged, contains non-decimal strings, or `precision` is not a non-negative safe integer.
 */
export function transposeDecimalMemo(matrix, precision = DEFAULT_PRECISION) {
	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a number')
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError('precision must be a non-negative safe integer')
	}

	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of decimal strings')
	}
	const rows = matrix.length
	if (rows === 0) {
		throw new RangeError('matrix must not be empty')
	}

	const firstRow = matrix[0]
	if (!Array.isArray(firstRow)) {
		throw new TypeError('matrix[0] must be an array')
	}
	const cols = firstRow.length
	if (cols === 0) {
		throw new RangeError('matrix rows must not be empty')
	}

	const totalCells = rows * cols
	const flatRaw = new Array(totalCells)
	const keyParts = new Array(totalCells + 1)
	keyParts[0] = `${precision}|${rows}x${cols}`

	let idx = 0
	for (let r = 0; r < rows; r++) {
		const row = matrix[r]
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix[${r}] must be an array`)
		}
		if (row.length !== cols) {
			throw new RangeError(
				`Ragged matrix: expected ${cols} columns at row ${r}, got ${row.length}`
			)
		}
		for (let c = 0; c < cols; c++) {
			const cell = row[c]
			if (typeof cell !== 'string') {
				throw new TypeError(
					`matrix[${r}][${c}] must be a decimal string, got ${typeof cell}`
				)
			}
			flatRaw[idx] = cell
			keyParts[idx + 1] = `${cell.length}:${cell}`
			idx++
		}
	}

	const resultKey = keyParts.join('|')
	const cachedResult = lruGet(RESULT_CACHE, resultKey)
	if (cachedResult !== undefined) {
		return cloneMatrix(cachedResult)
	}

	const flatNorm = new Array(totalCells)
	for (let i = 0; i < totalCells; i++) {
		const r = Math.floor(i / cols)
		const c = i % cols
		flatNorm[i] = normalizeDecimal(flatRaw[i], precision, r, c)
	}

	const indexMap = getTransposeIndexMap(rows, cols)
	const result = new Array(cols)
	let offset = 0
	for (let c = 0; c < cols; c++) {
		const outRow = new Array(rows)
		for (let r = 0; r < rows; r++) {
			outRow[r] = flatNorm[indexMap[offset++]]
		}
		result[c] = outRow
	}

	lruSet(RESULT_CACHE, resultKey, cloneMatrix(result), MAX_RESULT_ENTRIES)
	return result
}
