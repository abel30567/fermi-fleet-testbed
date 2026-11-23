/**
 * Exact rational number represented as a BigInt numerator/denominator pair.
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Computes the non-negative absolute value of a BigInt.
 * @param {bigint} value
 * @returns {bigint}
 */
function absBigInt(value) {
	return value < 0n ? -value : value
}

/**
 * Iterative Euclidean greatest common divisor over non-negative BigInts.
 * Iterative form avoids call-stack overflow on large worst-case inputs
 * (such as consecutive Fibonacci numbers with thousands of bits).
 *
 * @param {bigint} a - Non-negative integer.
 * @param {bigint} b - Non-negative integer.
 * @returns {bigint} Non-negative gcd(a, b).
 */
function gcdBigInt(a, b) {
	let x = a
	let y = b
	while (y !== 0n) {
		const rem = x % y
		x = y
		y = rem
	}
	return x
}

/**
 * Validates and normalizes a rational operand into canonical lowest terms
 * with strictly positive denominator and canonical zero `{ num: 0n, den: 1n }`.
 *
 * @param {Rational} value - Candidate rational object.
 * @param {string} name - Parameter name for error diagnostics.
 * @returns {Rational} Normalized rational in lowest terms with `den > 0n`.
 * @throws {TypeError} If `value` is not an object with BigInt `num` and `den`.
 * @throws {RangeError} If `value.den === 0n`.
 */
function normalizeRational(value, name) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${name} must be an object with BigInt num and den properties`)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${name}.num and ${name}.den must both be BigInt values`)
	}
	if (den === 0n) {
		throw new RangeError(`${name}.den must not be zero`)
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}

	const normNum = den < 0n ? -num : num
	const normDen = den < 0n ? -den : den
	const divisor = gcdBigInt(absBigInt(normNum), normDen)
	return {
		num: normNum / divisor,
		den: normDen / divisor,
	}
}

/**
 * Multiplies two exact rational numbers `{ num: BigInt, den: BigInt }` and
 * returns their exact product in canonical lowest terms (`den > 0n`,
 * `gcd(|num|, den) === 1n`, and `{ num: 0n, den: 1n }` for zero).
 *
 * Numerical robustness & scaling strategy:
 * - Both operands are validated and pre-reduced to lowest terms with positive
 *   denominators before multiplication.
 * - Cross-cancellation (`g1 = gcd(|a.num|, b.den)`, `g2 = gcd(|b.num|, a.den)`)
 *   scales down numerators and denominators *prior* to forming the product,
 *   preventing unnecessary intermediate BigInt bit-growth and guaranteeing the
 *   resulting pair is already coprime without a post-multiplication GCD over
 *   double-width products.
 * - Iterative Euclidean GCD prevents stack exhaustion on large BigInt inputs.
 *
 * @param {Rational} a - First rational operand `{ num: bigint, den: bigint }`.
 * @param {Rational} b - Second rational operand `{ num: bigint, den: bigint }`.
 * @returns {Rational} Exact product in canonical lowest terms.
 * @throws {TypeError} If either operand is not a valid `{ num: bigint, den: bigint }`.
 * @throws {RangeError} If either operand has a zero denominator.
 */
export function multiplyRationalStable(a, b) {
	const left = normalizeRational(a, 'a')
	const right = normalizeRational(b, 'b')

	if (left.num === 0n || right.num === 0n) {
		return { num: 0n, den: 1n }
	}

	// Cross-cancel common factors before multiplying to minimize intermediate bit width.
	const g1 = gcdBigInt(absBigInt(left.num), right.den)
	const g2 = gcdBigInt(absBigInt(right.num), left.den)

	const num = (left.num / g1) * (right.num / g2)
	const den = (left.den / g2) * (right.den / g1)

	return { num, den }
}
