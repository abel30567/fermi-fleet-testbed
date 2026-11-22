/**
 * Arbitrary-precision matrix determinant over decimal strings using an
 * iterative Bareiss (fraction-free Gaussian elimination) algorithm with
 * pivoting over BigInt integers.
 */

const DECIMAL_PATTERN = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/
const MAX_EXPONENT = 1_000_000

/**
 * Parse and validate a decimal string into an exact scaled BigInt representation:
 * value = num * 10^(-scale), where scale >= 0 is minimized.
 *
 * @param {string} value - Decimal string to parse.
 * @param {number} rowIndex - Row index for error reporting.
 * @param {number} colIndex - Column index for error reporting.
 * @returns {{ num: bigint, scale: number }}
 */
function parseDecimalString(value, rowIndex, colIndex) {
	if (typeof value !== 'string') {
		throw new TypeError(
			`matrix[${rowIndex}][${colIndex}] must be a decimal string, received ${typeof value}`,
		)
	}

	const match = DECIMAL_PATTERN.exec(value)
	if (!match) {
		throw new RangeError(
			`matrix[${rowIndex}][${colIndex}] is not a valid decimal string: "${value}"`,
		)
	}

	const sign = match[1] === '-' ? -1n : 1n
	const intPart = match[2] ?? ''
	const fracPart = match[3] ?? match[4] ?? ''
	const expStr = match[5]

	const rawDigits = intPart + fracPart
	// Strip leading zeros to check zero quickly and avoid huge zero shifts.
	const trimmedDigits = rawDigits.replace(/^0+/, '')
	if (trimmedDigits.length === 0) {
		return { num: 0n, scale: 0 }
	}

	let exp = 0
	if (expStr !== undefined) {
		exp = Number(expStr)
		if (!Number.isSafeInteger(exp) || Math.abs(exp) > MAX_EXPONENT) {
			throw new RangeError(
				`matrix[${rowIndex}][${colIndex}] has an out-of-range exponent: "${value}"`,
			)
		}
	}

	let scale = fracPart.length - exp
	let digits = trimmedDigits

	// Remove trailing zeros while reducing scale when scale > 0.
	if (scale > 0) {
		let trailingZeros = 0
		for (let i = digits.length - 1; i >= 0 && digits[i] === '0' && trailingZeros < scale; i--) {
			trailingZeros++
		}
		if (trailingZeros > 0) {
			digits = digits.slice(0, digits.length - trailingZeros)
			scale -= trailingZeros
		}
	}

	let num = BigInt(digits)
	if (scale < 0) {
		const shift = -scale
		if (shift > MAX_EXPONENT) {
			throw new RangeError(
				`matrix[${rowIndex}][${colIndex}] exceeds maximum supported exponent magnitude`,
			)
		}
		num *= 10n ** BigInt(shift)
		scale = 0
	}

	return { num: sign * num, scale }
}

/**
 * Format an exact scaled BigInt value (numerator * 10^(-scale)) as a normalized
 * decimal string rounded half away from zero to `precision` decimal places.
 *
 * @param {bigint} numerator - Signed exact integer numerator.
 * @param {number} scale - Non-negative decimal scale of numerator.
 * @param {number} precision - Maximum number of fractional digits in output.
 * @returns {string}
 */
function formatScaledBigInt(numerator, scale, precision) {
	if (numerator === 0n) {
		return '0'
	}

	const negative = numerator < 0n
	let absVal = negative ? -numerator : numerator
	let outScale = scale

	if (scale > precision) {
		const drop = scale - precision
		const divisor = 10n ** BigInt(drop)
		let quotient = absVal / divisor
		const remainder = absVal % divisor
		if (remainder * 2n >= divisor) {
			quotient += 1n
		}
		absVal = quotient
		outScale = precision
	}

	if (absVal === 0n) {
		return '0'
	}

	if (outScale === 0) {
		return (negative ? '-' : '') + absVal.toString()
	}

	const digits = absVal.toString().padStart(outScale + 1, '0')
	const splitIndex = digits.length - outScale
	const intPart = digits.slice(0, splitIndex)
	const fracPart = digits.slice(splitIndex).replace(/0+$/, '')

	if (fracPart.length === 0) {
		return (negative ? '-' : '') + intPart
	}

	return `${negative ? '-' : ''}${intPart}.${fracPart}`
}

/**
 * Compute the exact determinant of a square n x n BigInt matrix using the
 * iterative Bareiss fraction-free Gaussian elimination algorithm with pivoting.
 * Mutates `M` in place.
 *
 * @param {bigint[][]} M - Square n x n matrix of BigInts.
 * @returns {bigint}
 */
function bareissDeterminantBigInt(M) {
	const n = M.length
	if (n === 1) {
		return M[0][0]
	}
	if (n === 2) {
		return M[0][0] * M[1][1] - M[0][1] * M[1][0]
	}

	let sign = 1n
	let prevPivot = 1n

	for (let k = 0; k < n - 1; k++) {
		// Find a non-zero pivot in column k at or below row k.
		let pivotRow = -1
		for (let i = k; i < n; i++) {
			if (M[i][k] !== 0n) {
				pivotRow = i
				break
			}
		}

		if (pivotRow === -1) {
			return 0n
		}

		if (pivotRow !== k) {
			const tmp = M[k]
			M[k] = M[pivotRow]
			M[pivotRow] = tmp
			sign = -sign
		}

		const pivot = M[k][k]

		for (let i = k + 1; i < n; i++) {
			const factor = M[i][k]
			for (let j = k + 1; j < n; j++) {
				// By Sylvester's determinant identity, this division is always exact.
				M[i][j] = (pivot * M[i][j] - factor * M[k][j]) / prevPivot
			}
			M[i][k] = 0n
		}

		prevPivot = pivot
	}

	return sign * M[n - 1][n - 1]
}

/**
 * Compute the determinant of a square matrix of arbitrary-precision decimal
 * strings using an iterative exact BigInt Bareiss (fraction-free Gaussian
 * elimination) algorithm.
 *
 * Each row is scaled to exact integers by its row-wise maximum decimal scale,
 * the integer determinant is computed with zero intermediate rounding error
 * via iterative Bareiss elimination with row pivoting, and the exact result
 * is scaled back and rounded (half away from zero) to `precision` decimal places.
 *
 * @param {string[][]} matrix - Non-empty square (n x n) 2D array of decimal strings
 *   (supports optional leading '+'/'-', fractional form, and scientific notation).
 * @param {number} [precision=20] - Non-negative integer number of decimal places
 *   for rounding the final result. Trailing fractional zeros are stripped.
 * @returns {string} Normalized decimal string representation of the determinant
 *   (never returns "-0").
 * @throws {TypeError} If `matrix` is not a 2D array of strings or `precision` is not a number.
 * @throws {RangeError} If `matrix` is empty or non-square, any entry is not a valid
 *   decimal string, or `precision` is not a non-negative safe integer.
 */
export function determinantDecimalIterative(matrix, precision = 20) {
	if (typeof precision !== 'number') {
		throw new TypeError(`precision must be a non-negative integer, received ${typeof precision}`)
	}
	if (!Number.isInteger(precision) || !Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError(`precision must be a non-negative safe integer, received ${precision}`)
	}

	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a non-empty square 2D array of decimal strings')
	}

	const n = matrix.length
	if (n === 0) {
		throw new RangeError('matrix must be non-empty')
	}

	// Parse and validate every row and entry, tracking row-wise max scales.
	const parsed = new Array(n)
	const rowScales = new Array(n)
	let totalScale = 0
	let hasZeroRow = false

	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix[${i}] must be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(
				`matrix must be square (${n}x${n}), but row ${i} has length ${row.length}`,
			)
		}

		const parsedRow = new Array(n)
		let maxRowScale = 0
		let rowAllZero = true

		for (let j = 0; j < n; j++) {
			const entry = parseDecimalString(row[j], i, j)
			parsedRow[j] = entry
			if (entry.num !== 0n) {
				rowAllZero = false
			}
			if (entry.scale > maxRowScale) {
				maxRowScale = entry.scale
			}
		}

		parsed[i] = parsedRow
		rowScales[i] = maxRowScale
		totalScale += maxRowScale
		if (rowAllZero) {
			hasZeroRow = true
		}
	}

	if (hasZeroRow) {
		return '0'
	}

	// Build exact BigInt integer matrix M by scaling each row i by 10^(rowScales[i]).
	// Cache powers of 10 used for scaling.
	const pow10Cache = new Map([[0, 1n]])
	const getPow10 = (exp) => {
		let val = pow10Cache.get(exp)
		if (val === undefined) {
			val = 10n ** BigInt(exp)
			pow10Cache.set(exp, val)
		}
		return val
	}

	const intMatrix = new Array(n)
	for (let i = 0; i < n; i++) {
		const intRow = new Array(n)
		const rScale = rowScales[i]
		const parsedRow = parsed[i]
		for (let j = 0; j < n; j++) {
			const { num, scale } = parsedRow[j]
			if (num === 0n) {
				intRow[j] = 0n
			} else if (rScale === scale) {
				intRow[j] = num
			} else {
				intRow[j] = num * getPow10(rScale - scale)
			}
		}
		intMatrix[i] = intRow
	}

	const detBigInt = bareissDeterminantBigInt(intMatrix)
	return formatScaledBigInt(detBigInt, totalScale, precision)
}
