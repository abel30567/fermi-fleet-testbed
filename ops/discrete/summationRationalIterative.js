/**
 * Computes the greatest common divisor of two BigInt values iteratively
 * using the Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative greatest common divisor of `a` and `b`.
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const remainder = x % y
		x = y
		y = remainder
	}
	return x
}

/**
 * Validates and normalizes a single rational input `{ num: BigInt, den: BigInt }`.
 *
 * @param {unknown} value
 * @param {number} index
 * @returns {{ num: bigint, den: bigint }}
 */
function validateRational(value, index) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(
			`Expected rational object { num: bigint, den: bigint } at index ${index}`
		)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(
			`Expected bigint num and den properties at index ${index}`
		)
	}
	if (den === 0n) {
		throw new RangeError(`Rational denominator must not be 0n at index ${index}`)
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
 * Computes the exact discrete summation of an array of rational numbers
 * represented as `{ num: BigInt, den: BigInt }` using an iterative algorithm.
 *
 * Returns the exact sum reduced to lowest terms with a strictly positive
 * denominator (`den > 0n`), and `{ num: 0n, den: 1n }` for an empty array
 * or a zero sum.
 *
 * @param {Array<{ num: bigint, den: bigint }>} values - Array of exact rationals.
 * @returns {{ num: bigint, den: bigint }} Exact sum in lowest terms with `den > 0n`.
 * @throws {TypeError} If `values` is not an Array or any element is not a valid `{ num: bigint, den: bigint }` object.
 * @throws {RangeError} If any element has a zero denominator (`den === 0n`).
 */
export function summationRationalIterative(values) {
	if (!Array.isArray(values)) {
		throw new TypeError('Expected values to be an Array of rational objects')
	}

	let sumNum = 0n
	let sumDen = 1n

	for (let i = 0; i < values.length; i++) {
		if (!(i in values)) {
			throw new TypeError(`Sparse array hole encountered at index ${i}`)
		}
		const { num, den } = validateRational(values[i], i)
		if (num === 0n) {
			continue
		}

		const gDen = gcdBigInt(sumDen, den)
		const sumDenDiv = sumDen / gDen
		const denDiv = den / gDen

		const nextNum = sumNum * denDiv + num * sumDenDiv
		if (nextNum === 0n) {
			sumNum = 0n
			sumDen = 1n
		} else {
			const nextDen = sumDenDiv * den
			const g = gcdBigInt(nextNum, nextDen)
			sumNum = nextNum / g
			sumDen = nextDen / g
		}
	}

	return { num: sumNum, den: sumDen }
}
