/**
 * Fixed-point scale factor (10^18) for exact BigInt vector projection results.
 */
const SCALE = 10n ** 18n

/**
 * Validates that a value is a non-empty array of BigInt elements.
 *
 * @param {unknown} vec - Candidate vector.
 * @param {string} name - Parameter name for error messages.
 */
function assertBigIntVector(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an array of BigInt values`)
	}
	if (vec.length === 0) {
		throw new RangeError(`${name} must be a non-empty array`)
	}
	for (let i = 0; i < vec.length; i++) {
		if (typeof vec[i] !== 'bigint') {
			throw new TypeError(`${name}[${i}] must be a BigInt`)
		}
	}
}

/**
 * Divides a signed BigInt numerator by a strictly positive BigInt denominator,
 * rounding to the nearest integer (half away from zero).
 *
 * @param {bigint} numerator - Dividend (signed).
 * @param {bigint} denominator - Strictly positive divisor.
 * @returns {bigint} Rounded quotient.
 */
function roundDivNearest(numerator, denominator) {
	if (numerator === 0n) {
		return 0n
	}
	const negative = numerator < 0n
	const absNum = negative ? -numerator : numerator
	const quotient = absNum / denominator
	const remainder = absNum % denominator
	const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient
	return negative ? -rounded : rounded
}

/**
 * Computes the vector projection of BigInt vector `a` onto non-zero BigInt vector `b`:
 *
 *     proj_b(a) = ((a · b) / (b · b)) * b
 *
 * Uses the exact closed-form inner-product identity over arbitrary-precision BigInt
 * arithmetic and returns each component as a fixed-point BigInt scaled by 10^18,
 * rounded to the nearest integer (half away from zero).
 *
 * @param {bigint[]} a - Non-empty BigInt vector to project.
 * @param {bigint[]} b - Non-empty, non-zero BigInt target vector of the same length as `a`.
 * @returns {bigint[]} Projected vector scaled by 10^18.
 * @throws {TypeError} If `a` or `b` is not an array of BigInt values.
 * @throws {RangeError} If `a` or `b` is empty, lengths differ, or `b` is the zero vector.
 */
export function projectionBigIntSeries(a, b) {
	assertBigIntVector(a, 'a')
	assertBigIntVector(b, 'b')

	if (a.length !== b.length) {
		throw new RangeError(
			`Vector lengths must match: received ${a.length} and ${b.length}`,
		)
	}

	let dotAB = 0n
	let dotBB = 0n
	for (let i = 0; i < a.length; i++) {
		dotAB += a[i] * b[i]
		dotBB += b[i] * b[i]
	}

	if (dotBB === 0n) {
		throw new RangeError('Target vector b must be non-zero')
	}

	const result = new Array(a.length)
	if (dotAB === 0n) {
		result.fill(0n)
		return result
	}

	const scaledDotAB = dotAB * SCALE
	for (let i = 0; i < b.length; i++) {
		result[i] = roundDivNearest(scaledDotAB * b[i], dotBB)
	}

	return result
}
