/**
 * Exact rational number represented in lowest terms with a positive denominator.
 *
 * @typedef {Object} Rational
 * @property {bigint} num - Numerator (carries the sign; `0n` implies `den === 1n`).
 * @property {bigint} den - Strictly positive denominator (`den > 0n`).
 */

/**
 * Computes the non-negative greatest common divisor of two BigInts using the
 * iterative Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Validates and normalizes a single rational input into canonical lowest terms
 * with a strictly positive denominator.
 *
 * @param {unknown} value - Candidate rational object `{ num: bigint, den: bigint }`.
 * @param {string} paramName - Parameter name for error diagnostics.
 * @param {number} index - Element index for error diagnostics.
 * @returns {Rational}
 * @throws {TypeError} If `value` is not an object with `bigint` `num` and `den`.
 * @throws {RangeError} If `value.den === 0n`.
 */
function validateAndNormalizeRational(value, paramName, index) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(
			`${paramName}[${index}] must be a rational object { num: bigint, den: bigint }`
		)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(
			`${paramName}[${index}] must have bigint properties 'num' and 'den'`
		)
	}
	if (den === 0n) {
		throw new RangeError(`${paramName}[${index}].den must not be 0n`)
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcdBigInt(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Validates an input array of rationals and returns a normalized copy.
 *
 * @param {unknown} seq - Candidate array of rationals.
 * @param {string} paramName - Parameter name for error diagnostics.
 * @returns {Rational[]}
 * @throws {TypeError} If `seq` is not an Array or any element is malformed.
 * @throws {RangeError} If any element has denominator `0n`.
 */
function validateAndNormalizeSequence(seq, paramName) {
	if (!Array.isArray(seq)) {
		throw new TypeError(`${paramName} must be an array of rationals`)
	}
	const normalized = new Array(seq.length)
	for (let i = 0; i < seq.length; i++) {
		normalized[i] = validateAndNormalizeRational(seq[i], paramName, i)
	}
	return normalized
}

/**
 * Multiplies two already-normalized rationals and returns the exact product in
 * canonical lowest terms.
 *
 * @param {Rational} x
 * @param {Rational} y
 * @returns {Rational}
 */
function mulNormalized(x, y) {
	if (x.num === 0n || y.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g1 = gcdBigInt(x.num, y.den)
	const g2 = gcdBigInt(y.num, x.den)
	return {
		num: (x.num / g1) * (y.num / g2),
		den: (x.den / g2) * (y.den / g1),
	}
}

/**
 * Adds two already-normalized rationals and returns the exact sum in canonical
 * lowest terms.
 *
 * @param {Rational} x
 * @param {Rational} y
 * @returns {Rational}
 */
function addNormalized(x, y) {
	if (x.num === 0n) {
		return { num: y.num, den: y.den }
	}
	if (y.num === 0n) {
		return { num: x.num, den: x.den }
	}
	const g = gcdBigInt(x.den, y.den)
	const xDenReduced = x.den / g
	const yDenReduced = y.den / g
	const num = x.num * yDenReduced + y.num * xDenReduced
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g2 = gcdBigInt(num, g)
	return {
		num: num / g2,
		den: xDenReduced * (y.den / g2),
	}
}

/**
 * Computes the discrete linear convolution of two finite sequences of exact
 * rational numbers `{ num: bigint, den: bigint }` using a straightforward
 * iterative algorithm.
 *
 * For non-empty input sequences `a` (length `m`) and `b` (length `n`), returns
 * a sequence `c` of length `m + n - 1` where:
 *
 *   `c[k] = sum_{i + j = k} a[i] * b[j]`
 *
 * If either `a` or `b` is empty, returns `[]` (after validating both inputs).
 * Unreduced inputs and inputs with negative denominators are accepted; every
 * element in the returned array is reduced to lowest terms with a strictly
 * positive denominator (`den > 0n`), and zero is represented canonically as
 * `{ num: 0n, den: 1n }`. Input arrays and objects are never mutated.
 *
 * @param {ReadonlyArray<Rational>} a - First sequence of exact rationals.
 * @param {ReadonlyArray<Rational>} b - Second sequence of exact rationals.
 * @returns {Rational[]} The discrete linear convolution in canonical lowest terms.
 * @throws {TypeError} If `a` or `b` is not an Array, or any element is not an
 *   object with `bigint` properties `num` and `den`.
 * @throws {RangeError} If any element has `den === 0n`.
 */
export function convolutionRationalIterative(a, b) {
	const normA = validateAndNormalizeSequence(a, 'a')
	const normB = validateAndNormalizeSequence(b, 'b')

	const m = normA.length
	const n = normB.length
	if (m === 0 || n === 0) {
		return []
	}

	const outLen = m + n - 1
	const result = new Array(outLen)
	for (let k = 0; k < outLen; k++) {
		const iStart = k >= n ? k - n + 1 : 0
		const iEnd = k < m ? k : m - 1
		let acc = { num: 0n, den: 1n }
		for (let i = iStart; i <= iEnd; i++) {
			const term = mulNormalized(normA[i], normB[k - i])
			acc = addNormalized(acc, term)
		}
		result[k] = acc
	}

	return result
}
