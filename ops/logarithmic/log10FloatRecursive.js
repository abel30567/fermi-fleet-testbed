const SQRT10 = Math.sqrt(10)
const INV_SQRT10 = 1 / SQRT10

// Binary powers of 10 covering exponents 1..511 (sufficient for full IEEE-754 float64 range).
const POW10_TABLE = [
	{ exp: 256, val: 1e256 },
	{ exp: 128, val: 1e128 },
	{ exp: 64, val: 1e64 },
	{ exp: 32, val: 1e32 },
	{ exp: 16, val: 1e16 },
	{ exp: 8, val: 1e8 },
	{ exp: 4, val: 1e4 },
	{ exp: 2, val: 1e2 },
	{ exp: 1, val: 1e1 },
]

// 32 terms of the atanh series for |u| <= (sqrt(10) - 1) / (sqrt(10) + 1) < 0.52
// yields truncation error < 1e-20, well below float64 machine epsilon (~2.22e-16).
const SERIES_TERMS = 32

/**
 * Recursively evaluates the partial sum sum_{k=start}^{end-1} z^(k - start) / (2k + 1)
 * and z^(end - start) using divide-and-conquer binary splitting.
 *
 * @param {number} z - Squared argument u^2 in [0, 1).
 * @param {number} start - Inclusive lower summation index.
 * @param {number} end - Exclusive upper summation index.
 * @returns {{ sum: number, power: number }} Partial sum and power span.
 */
function atanhSeriesDivideAndConquer(z, start, end) {
	if (end - start === 1) {
		return { sum: 1 / (2 * start + 1), power: z }
	}
	const mid = (start + end) >>> 1
	const left = atanhSeriesDivideAndConquer(z, start, mid)
	const right = atanhSeriesDivideAndConquer(z, mid, end)
	return {
		sum: left.sum + left.power * right.sum,
		power: left.power * right.power,
	}
}

/**
 * Computes ln(m) for m near 1 using ln(m) = 2 * u * sum_{k=0}^{N-1} u^(2k) / (2k + 1),
 * where u = (m - 1) / (m + 1), evaluated via divide-and-conquer binary splitting.
 *
 * @param {number} m - Positive number near 1.
 * @returns {number} Natural logarithm of m.
 */
function lnNearOneRecursive(m) {
	if (m === 1) {
		return 0
	}
	const u = (m - 1) / (m + 1)
	const z = u * u
	const { sum } = atanhSeriesDivideAndConquer(z, 0, SERIES_TERMS)
	return 2 * u * sum
}

// Compute ln(10) = 3 * ln(2) + ln(1.25) using the same recursive binary-splitting evaluator,
// avoiding any delegation to Math.log / Math.log10 / Math.LN10.
const LN10 = 3 * lnNearOneRecursive(2) + lnNearOneRecursive(1.25)

/**
 * Recursively reduces a positive finite float64 x >= SQRT10 into [1/sqrt(10), sqrt(10))
 * by dividing out binary powers of 10.
 *
 * @param {number} x - Value to reduce down.
 * @param {number} index - Current index into POW10_TABLE.
 * @returns {{ mantissa: number, exponent: number }} Reduced mantissa and base-10 exponent.
 */
function reduceDownRecursive(x, index) {
	if (index >= POW10_TABLE.length) {
		if (x >= SQRT10) {
			return { mantissa: x / 10, exponent: 1 }
		}
		return { mantissa: x, exponent: 0 }
	}
	const { exp, val } = POW10_TABLE[index]
	if (x / val >= INV_SQRT10) {
		const next = reduceDownRecursive(x / val, index + 1)
		return { mantissa: next.mantissa, exponent: exp + next.exponent }
	}
	return reduceDownRecursive(x, index + 1)
}

/**
 * Recursively scales a positive finite float64 x < 1/sqrt(10) into [1/sqrt(10), sqrt(10))
 * by multiplying by binary powers of 10.
 *
 * @param {number} x - Value to scale up.
 * @param {number} index - Current index into POW10_TABLE.
 * @returns {{ mantissa: number, exponent: number }} Scaled mantissa and negative base-10 exponent.
 */
function reduceUpRecursive(x, index) {
	if (index >= POW10_TABLE.length) {
		if (x < INV_SQRT10) {
			return { mantissa: x * 10, exponent: -1 }
		}
		return { mantissa: x, exponent: 0 }
	}
	const { exp, val } = POW10_TABLE[index]
	if (x * val < SQRT10) {
		const next = reduceUpRecursive(x * val, index + 1)
		return { mantissa: next.mantissa, exponent: -exp + next.exponent }
	}
	return reduceUpRecursive(x, index + 1)
}

/**
 * Computes the base-10 logarithm of an IEEE-754 float64 number using a recursive
 * divide-and-conquer algorithm:
 * 1. Recursive binary-power-of-10 range reduction into [1/sqrt(10), sqrt(10)).
 * 2. Divide-and-conquer binary splitting of the atanh power series for ln(m) / ln(10).
 *
 * Special IEEE-754 values follow standard log10 semantics:
 * - `NaN` or negative numbers -> `NaN`
 * - `+0` or `-0` -> `-Infinity`
 * - `+Infinity` -> `+Infinity`
 * - `1` -> `+0`
 *
 * @param {number} x - Input IEEE-754 float64 number.
 * @returns {number} Base-10 logarithm of `x`.
 * @throws {TypeError} If `x` is not of type `'number'`.
 */
export function log10FloatRecursive(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected a number, got ${typeof x}`)
	}
	if (Number.isNaN(x) || x < 0) {
		return Number.NaN
	}
	if (x === 0) {
		return Number.NEGATIVE_INFINITY
	}
	if (x === Number.POSITIVE_INFINITY) {
		return Number.POSITIVE_INFINITY
	}
	if (x === 1) {
		return 0
	}

	let mantissa = x
	let exponent = 0
	if (x >= SQRT10) {
		;({ mantissa, exponent } = reduceDownRecursive(x, 0))
	} else if (x < INV_SQRT10) {
		;({ mantissa, exponent } = reduceUpRecursive(x, 0))
	}

	if (mantissa === 1) {
		return exponent
	}
	return exponent + lnNearOneRecursive(mantissa) / LN10
}
