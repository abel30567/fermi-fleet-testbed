/**
 * Computes the greatest common divisor of two BigInt values using the
 * iterative Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative greatest common divisor of a and b.
 */
function gcd(a, b) {
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
 * Computes the exact integer floor square root floor(sqrt(n)) for n >= 0n
 * using Newton's method over BigInt.
 *
 * @param {bigint} n - Non-negative BigInt.
 * @returns {bigint} Floor of sqrt(n).
 */
function isqrt(n) {
	if (n < 2n) return n
	const bitLen = BigInt(n.toString(2).length)
	let x = 1n << ((bitLen + 1n) >> 1n)
	while (true) {
		const next = (x + n / x) >> 1n
		if (next >= x) return x
		x = next
	}
}

/**
 * Validates and normalizes a rational number { num: BigInt, den: BigInt }
 * into lowest terms with den > 0n (and { num: 0n, den: 1n } for zero).
 *
 * @param {unknown} q - Value to validate as a rational object.
 * @param {number} index - Element index for error reporting.
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(q, index) {
	if (q === null || typeof q !== 'object' || Array.isArray(q)) {
		throw new TypeError(`v[${index}] must be a rational object { num: BigInt, den: BigInt }`)
	}
	const { num, den } = q
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`v[${index}].num and v[${index}].den must be BigInt values`)
	}
	if (den === 0n) {
		throw new RangeError(`v[${index}].den must not be 0n`)
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const sign = den < 0n ? -1n : 1n
	const n = num * sign
	const d = den * sign
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Computes a compact, strictly positive rational initial approximation x0
 * for sqrt(N / D) in lowest terms using bit lengths of N and D, without any
 * floating-point arithmetic.
 *
 * Guarantees x0 / sqrt(N / D) is in (1/sqrt(2), sqrt(2)) when bitLen(N) - bitLen(D)
 * is even, and in (3/4, 3/2) when odd, so Heron iteration converges quadratically
 * with relative error < 1/12 after the first step.
 *
 * @param {bigint} num - Positive numerator N.
 * @param {bigint} den - Positive denominator D.
 * @returns {{ num: bigint, den: bigint }}
 */
function initialSqrtGuess(num, den) {
	const diff = BigInt(num.toString(2).length) - BigInt(den.toString(2).length)
	const k = diff >> 1n
	if ((diff & 1n) === 0n) {
		return k >= 0n
			? { num: 1n << k, den: 1n }
			: { num: 1n, den: 1n << -k }
	}
	const shift = k - 1n
	return shift >= 0n
		? { num: 3n << shift, den: 1n }
		: { num: 3n, den: 1n << -shift }
}

/**
 * Computes the Euclidean norm (magnitude) ||v|| = sqrt(sum_i v[i]^2) of a vector
 * of exact rational numbers, returning an exact rational { num: BigInt, den: BigInt }
 * in lowest terms with den > 0n (and { num: 0n, den: 1n } for zero).
 *
 * Algorithm:
 * 1. Validate inputs and accumulate the exact reduced sum of squares S = N / D.
 * 2. If S = 0 (including the zero vector or empty vector []), return { num: 0n, den: 1n }.
 * 3. Test whether N and D are both perfect integer squares via exact BigInt isqrt;
 *    if so, return the exact rational square root { num: isqrt(N), den: isqrt(D) }.
 * 4. Otherwise, construct a bit-length-scaled initial rational guess x0 in lowest
 *    terms and perform `iterations` exact rational Heron/Newton steps:
 *      x_{k+1} = (x_k + S / x_k) / 2 = (D * p_k^2 + N * q_k^2) / (2 * D * p_k * q_k),
 *    reducing to lowest terms at each step. Because Heron's method converges
 *    quadratically, the default `iterations = 8` achieves relative error < 10^-178.
 *
 * @param {Array<{ num: bigint, den: bigint }>} v - Vector of rational components.
 * @param {number} [iterations=8] - Number of Heron/Newton iterations (>= 1) for non-perfect squares.
 * @returns {{ num: bigint, den: bigint }} Magnitude ||v|| in lowest terms (num >= 0n, den > 0n).
 * @throws {TypeError} If `v` is not an array, any element is not a valid rational object with BigInt `num`/`den`, or `iterations` is not a number.
 * @throws {RangeError} If any element has `den === 0n`, or `iterations` is not a safe positive integer (>= 1).
 */
export function magnitudeRationalSeries(v, iterations = 8) {
	if (!Array.isArray(v)) {
		throw new TypeError('v must be an array of rational objects { num: BigInt, den: BigInt }')
	}
	if (typeof iterations !== 'number') {
		throw new TypeError('iterations must be a number')
	}
	if (!Number.isSafeInteger(iterations) || iterations < 1) {
		throw new RangeError('iterations must be a safe positive integer (>= 1)')
	}

	let sumNum = 0n
	let sumDen = 1n

	for (let i = 0; i < v.length; i++) {
		const { num, den } = normalizeRational(v[i], i)
		if (num === 0n) continue

		const sqNum = num * num
		const sqDen = den * den
		const g = gcd(sumDen, sqDen)
		const sumDenDivG = sumDen / g
		const sqDenDivG = sqDen / g
		const nextNum = sumNum * sqDenDivG + sqNum * sumDenDivG
		const lcmDen = sumDenDivG * sqDen
		const g2 = gcd(nextNum, lcmDen)
		sumNum = nextNum / g2
		sumDen = lcmDen / g2
	}

	if (sumNum === 0n) {
		return { num: 0n, den: 1n }
	}

	const sqrtNum = isqrt(sumNum)
	const sqrtDen = isqrt(sumDen)
	if (sqrtNum * sqrtNum === sumNum && sqrtDen * sqrtDen === sumDen) {
		return { num: sqrtNum, den: sqrtDen }
	}

	let { num: p, den: q } = initialSqrtGuess(sumNum, sumDen)
	for (let i = 0; i < iterations; i++) {
		const nextNum = sumDen * p * p + sumNum * q * q
		const nextDen = 2n * sumDen * p * q
		const g = gcd(nextNum, nextDen)
		p = nextNum / g
		q = nextDen / g
	}

	return { num: p, den: q }
}
