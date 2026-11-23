/**
 * Exact rational representation in lowest terms with positive denominator.
 *
 * @typedef {object} Rational
 * @property {bigint} num - Numerator.
 * @property {bigint} den - Denominator (non-zero; positive in canonical output).
 */

/**
 * Computes the greatest common divisor of two BigInts using the Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative greatest common divisor.
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
 * Validates that an input is an exact rational `{ num: bigint, den: bigint }`
 * representing a non-negative integer, and returns that integer as a BigInt.
 *
 * Accepts unreduced rationals (including negative denominators where the
 * reduced value is a non-negative integer) and rejects zero denominators,
 * non-integers, negative values, and malformed objects.
 *
 * @param {Rational} value - Rational input to validate.
 * @param {string} name - Parameter name for error messages.
 * @returns {bigint} Non-negative integer value.
 * @throws {TypeError} If `value` is not an object with BigInt `num` and `den`.
 * @throws {RangeError} If `den === 0n`, the rational is not an integer, or the value is negative.
 */
function extractNonNegativeInteger(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be a rational object { num: bigint, den: bigint }`)
	}

	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${name}.num and ${name}.den must both be BigInt values`)
	}

	if (den === 0n) {
		throw new RangeError(`${name}.den must not be zero`)
	}

	const normNum = den < 0n ? -num : num
	const normDen = den < 0n ? -den : den

	if (normNum % normDen !== 0n) {
		throw new RangeError(`${name} must represent an exact integer`)
	}

	const intVal = normNum / normDen
	if (intVal < 0n) {
		throw new RangeError(`${name} must be non-negative`)
	}

	return intVal
}

/**
 * Computes the exact discrete binomial coefficient C(n, k) over exact rationals
 * `{ num: BigInt, den: BigInt }`, returning the result in lowest terms (`den > 0n`).
 *
 * Numerical robustness & minimal intermediate growth:
 * - Exploits symmetry `m = min(k, n - k)` to minimize iterations.
 * - Evaluates `C(n, m) = prod_{i=1}^{m} (n - m + i) / i` in ascending order of
 *   the numerator factor so that after step `i`, the accumulator equals
 *   `C(n - m + i, i)`, which is strictly non-decreasing and never exceeds the
 *   final result `C(n, m)`.
 * - Cancels `g = gcd(n - m + i, i)` before dividing the accumulator by `i / g`
 *   and multiplying by `(n - m + i) / g`. Because `gcd((n - m + i) / g, i / g) = 1`
 *   and the product is an exact integer, `i / g` divides the accumulator exactly
 *   at every step, preventing unnecessary intermediate growth while preserving
 *   full BigInt exactness.
 *
 * Boundary conventions for validated non-negative integer rationals:
 * - `C(n, 0) = 1` (including `C(0, 0) = 1`)
 * - `C(n, k) = 0` when `k > n`
 *
 * @param {Rational} n - Total number of items (non-negative integer rational).
 * @param {Rational} k - Number of chosen items (non-negative integer rational).
 * @returns {Rational} Exact binomial coefficient `{ num, den: 1n }` in lowest terms (`den > 0n`).
 * @throws {TypeError} If `n` or `k` is not a valid `{ num: bigint, den: bigint }` object.
 * @throws {RangeError} If `n` or `k` has a zero denominator, is not an integer, or is negative.
 */
export function combinationsRationalStable(n, k) {
	const nInt = extractNonNegativeInteger(n, 'n')
	const kInt = extractNonNegativeInteger(k, 'k')

	if (kInt > nInt) {
		return { num: 0n, den: 1n }
	}

	if (kInt === 0n || kInt === nInt) {
		return { num: 1n, den: 1n }
	}

	const diff = nInt - kInt
	const m = kInt < diff ? kInt : diff

	if (m === 1n) {
		return { num: nInt, den: 1n }
	}

	const base = nInt - m
	let acc = 1n

	for (let i = 1n; i <= m; i += 1n) {
		let factor = base + i
		let div = i
		const g = gcdBigInt(factor, div)
		factor /= g
		div /= g
		acc = (acc / div) * factor
	}

	return { num: acc, den: 1n }
}
