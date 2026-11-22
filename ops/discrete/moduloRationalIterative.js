/**
 * Compute the greatest common divisor of two BigInts using the iterative
 * Euclidean algorithm.
 *
 * @param {bigint} x
 * @param {bigint} y
 * @returns {bigint} Non-negative GCD of `x` and `y`.
 */
function gcdBigInt(x, y) {
	let a = x < 0n ? -x : x
	let b = y < 0n ? -y : y
	while (b !== 0n) {
		const next = a % b
		a = b
		b = next
	}
	return a
}

/**
 * Validate and normalize a rational object `{ num: BigInt, den: BigInt }`
 * into canonical lowest terms with `den > 0n` (and `0n / 1n` for zero).
 *
 * @param {{ num: bigint, den: bigint }} value
 * @param {string} name
 * @returns {{ num: bigint, den: bigint }}
 */
function validateAndNormalizeRational(value, name) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${name} must be an object with BigInt { num, den } fields`)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${name}.num and ${name}.den must be BigInts`)
	}
	if (den === 0n) {
		throw new RangeError(`${name}.den must be non-zero`)
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const sign = den < 0n ? -1n : 1n
	const signedNum = num * sign
	const posDen = den * sign
	const g = gcdBigInt(signedNum, posDen)
	return { num: signedNum / g, den: posDen / g }
}

/**
 * Compute the non-negative remainder of `dividend / divisor` for `dividend >= 0n`
 * and `divisor > 0n` using iterative binary long-division (exponential doubling
 * of the divisor followed by iterative halving and subtraction).
 *
 * Runs in O(log(dividend / divisor)) iterations so arbitrarily large BigInt
 * quotients terminate rapidly.
 *
 * @param {bigint} dividend Non-negative integer.
 * @param {bigint} divisor Positive integer.
 * @returns {bigint} Remainder `r` satisfying `0n <= r < divisor`.
 */
function iterativeUnsignedRemainder(dividend, divisor) {
	let remainder = dividend
	if (remainder < divisor) {
		return remainder
	}

	let shiftedDivisor = divisor
	let steps = 0
	while ((shiftedDivisor << 1n) <= remainder) {
		shiftedDivisor <<= 1n
		steps += 1
	}

	for (let i = steps; i >= 0; i -= 1) {
		if (remainder >= shiftedDivisor) {
			remainder -= shiftedDivisor
		}
		shiftedDivisor >>= 1n
	}

	return remainder
}

/**
 * Compute the exact floored rational modulo `a mod b = a - b * floor(a / b)`
 * over exact rationals `{ num: BigInt, den: BigInt }` in lowest terms, using an
 * iterative binary long-division reduction.
 *
 * Semantics (floored / Python-style modulo):
 * - When `b > 0`, the result `r` satisfies `0 <= r < b`.
 * - When `b < 0`, the result `r` satisfies `b < r <= 0`.
 * - In all cases, `a = b * q + r` where `q = floor(a / b)` is an exact integer.
 * - The returned rational is always in canonical lowest terms with `den > 0n`
 *   (and `{ num: 0n, den: 1n }` when the remainder is zero).
 *
 * @param {{ num: bigint, den: bigint }} a Dividend rational.
 * @param {{ num: bigint, den: bigint }} b Non-zero divisor rational.
 * @returns {{ num: bigint, den: bigint }} Exact remainder `a mod b` in lowest terms.
 * @throws {TypeError} If `a` or `b` is not an object with BigInt `num` and `den` fields.
 * @throws {RangeError} If `a.den === 0n`, `b.den === 0n`, or `b.num === 0n` (modulo by zero).
 */
export function moduloRationalIterative(a, b) {
	const normA = validateAndNormalizeRational(a, 'a')
	const normB = validateAndNormalizeRational(b, 'b')

	if (normB.num === 0n) {
		throw new RangeError('Modulo by zero is undefined')
	}

	if (normA.num === 0n) {
		return { num: 0n, den: 1n }
	}

	// Bring `a` and `b` over their positive least common denominator `commonDen`:
	// a = scaledA / commonDen, b = scaledB / commonDen.
	const denGcd = gcdBigInt(normA.den, normB.den)
	const scaleA = normB.den / denGcd
	const scaleB = normA.den / denGcd
	const commonDen = normA.den * scaleA

	const scaledA = normA.num * scaleA
	const scaledB = normB.num * scaleB

	const absA = scaledA < 0n ? -scaledA : scaledA
	const absB = scaledB < 0n ? -scaledB : scaledB

	const unsignedRem = iterativeUnsignedRemainder(absA, absB)
	if (unsignedRem === 0n) {
		return { num: 0n, den: 1n }
	}

	// Convert unsigned remainder to floored signed remainder matching sign of `b`.
	const sameSign = (scaledA > 0n) === (scaledB > 0n)
	let remNum
	if (sameSign) {
		remNum = scaledB > 0n ? unsignedRem : -unsignedRem
	} else {
		const complement = absB - unsignedRem
		remNum = scaledB > 0n ? complement : -complement
	}

	const g = gcdBigInt(remNum, commonDen)
	return {
		num: remNum / g,
		den: commonDen / g,
	}
}
