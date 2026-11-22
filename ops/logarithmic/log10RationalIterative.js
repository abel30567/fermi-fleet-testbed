/**
 * Compute the base-10 logarithm of a strictly positive exact rational number
 * `{ num: BigInt, den: BigInt }`, returning an exact reduced rational
 * `{ num: BigInt, den: BigInt }` with `den > 0n` and `gcd(|num|, den) === 1n`.
 *
 * - Exact integer powers of 10 (e.g., `1`, `10`, `100`, `1/10`, `10^k`) return
 *   exact integer rationals `{ num: k, den: 1n }`.
 * - All other positive rationals (whose base-10 logarithms are irrational) are
 *   computed via a straightforward iterative algorithm:
 *   1. Exact base-10 range reduction `x = 10^e * m` with `1 <= m < 10`.
 *   2. Iterative halving `m = 2^k * r` with `3/4 <= r < 3/2`.
 *   3. Iterative `artanh` Taylor series `ln(r) = 2 * sum_{j>=0} u^(2j+1) / (2j+1)`
 *      with `u = (r - 1) / (r + 1)` (`|u| <= 1/5`), evaluated in fixed-point
 *      BigInt arithmetic with extra guard digits.
 *   4. Division by `ln(10) = 3 * ln(2) + ln(5/4)` and reduction to lowest terms.
 *
 * @param {{ num: bigint, den: bigint }} x - Strictly positive rational number.
 * @param {number} [precision=30] - Decimal digits of precision for irrational results.
 * @returns {{ num: bigint, den: bigint }} Reduced rational representation of `log10(x)`.
 * @throws {TypeError} If `x` is not a rational object with BigInt `num`/`den`, or `precision` is not a number.
 * @throws {RangeError} If `x.den === 0n`, `x <= 0`, or `precision` is not a positive safe integer.
 */
export function log10RationalIterative(x, precision = 30) {
	validatePrecision(precision)
	const { num: p, den: q } = validateAndReducePositiveRational(x)

	if (p === 1n && q === 1n) {
		return { num: 0n, den: 1n }
	}
	if (q === 1n) {
		const exp = exactPowerOf10(p)
		if (exp !== null) {
			return { num: exp, den: 1n }
		}
	}
	if (p === 1n) {
		const exp = exactPowerOf10(q)
		if (exp !== null) {
			return { num: -exp, den: 1n }
		}
	}

	// Base-10 range reduction: p / q = 10^exp10 * (mNum / mDen), with 1 <= mNum / mDen < 10.
	let exp10 = BigInt(p.toString().length - q.toString().length)
	let mNum = p
	let mDen = q

	if (exp10 > 0n) {
		mDen *= 10n ** exp10
	} else if (exp10 < 0n) {
		mNum *= 10n ** -exp10
	}

	while (mNum < mDen) {
		mNum *= 10n
		exp10 -= 1n
	}
	while (mNum >= 10n * mDen) {
		mDen *= 10n
		exp10 += 1n
	}

	// Binary range reduction: mNum / mDen = 2^exp2 * r, with 3/4 <= r < 3/2.
	let exp2 = 0n
	while (2n * mNum >= 3n * mDen) {
		mDen *= 2n
		exp2 += 1n
	}

	const guardDigits = 16
	const finalScale = 10n ** BigInt(precision)
	const workScale = 10n ** BigInt(precision + guardDigits)

	// ln(2) = ln(4/3) + ln(3/2), both within [3/4, 3/2].
	const ln2 = lnScaled(4n, 3n, workScale) + lnScaled(3n, 2n, workScale)
	// ln(10) = 3 * ln(2) + ln(5/4), since 2^3 * (5/4) = 10.
	const ln10 = 3n * ln2 + lnScaled(5n, 4n, workScale)

	const lnR = lnScaled(mNum, mDen, workScale)
	const lnM = exp2 * ln2 + lnR

	const fracScaled = divRound(lnM * finalScale, ln10)
	const totalNum = exp10 * finalScale + fracScaled

	return reduceRational(totalNum, finalScale)
}

/**
 * Validate the precision argument.
 *
 * @param {number} precision
 */
function validatePrecision(precision) {
	if (typeof precision !== 'number') {
		throw new TypeError('Precision must be a number')
	}
	if (!Number.isSafeInteger(precision) || precision < 1) {
		throw new RangeError('Precision must be a positive safe integer')
	}
}

/**
 * Validate that `x` is a strictly positive `{ num: BigInt, den: BigInt }` rational
 * and return it normalized in lowest terms with `den > 0n`.
 *
 * @param {{ num: bigint, den: bigint }} x
 * @returns {{ num: bigint, den: bigint }}
 */
function validateAndReducePositiveRational(x) {
	if (typeof x !== 'object' || x === null || Array.isArray(x)) {
		throw new TypeError('Input must be a rational object { num: BigInt, den: BigInt }')
	}
	if (typeof x.num !== 'bigint' || typeof x.den !== 'bigint') {
		throw new TypeError('Rational num and den must both be BigInt values')
	}
	if (x.den === 0n) {
		throw new RangeError('Rational denominator must not be zero')
	}

	let { num, den } = x
	if (den < 0n) {
		num = -num
		den = -den
	}
	if (num <= 0n) {
		throw new RangeError('Input rational must be strictly positive')
	}

	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

/**
 * Iterative Euclidean GCD for BigInts (always returns a non-negative BigInt).
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
	a = a < 0n ? -a : a
	b = b < 0n ? -b : b
	while (b !== 0n) {
		const remainder = a % b
		a = b
		b = remainder
	}
	return a
}

/**
 * Reduce a rational `num / den` (`den !== 0n`) to lowest terms with `den > 0n`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function reduceRational(num, den) {
	if (den < 0n) {
		num = -num
		den = -den
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

/**
 * If `n >= 1n` is an exact power of 10 (`10^k`), return `k` as a BigInt;
 * otherwise return `null`.
 *
 * @param {bigint} n
 * @returns {bigint | null}
 */
function exactPowerOf10(n) {
	let exp = 0n
	while (n > 1n) {
		if (n % 10n !== 0n) {
			return null
		}
		n /= 10n
		exp += 1n
	}
	return exp
}

/**
 * Compute `ln(num / den) * scale` using the iterative `artanh` Taylor series:
 * `ln(r) = 2 * sum_{j>=0} (u^(2j+1)) / (2j+1)` where `u = (num - den) / (num + den)`.
 *
 * @param {bigint} num - Positive numerator.
 * @param {bigint} den - Positive denominator.
 * @param {bigint} scale - Fixed-point scaling factor (power of 10).
 * @returns {bigint} Scaled natural logarithm.
 */
function lnScaled(num, den, scale) {
	const diff = num - den
	if (diff === 0n) {
		return 0n
	}
	const sum = num + den
	const u = divRound(diff * scale, sum)
	const u2 = divRound(u * u, scale)

	let term = 2n * u
	let total = 0n
	let k = 1n

	while (term !== 0n) {
		const delta = term / k
		if (delta === 0n) {
			break
		}
		total += delta
		term = (term * u2) / scale
		k += 2n
	}

	return total
}

/**
 * Divide BigInt `a` by positive BigInt `b`, rounding half away from zero.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function divRound(a, b) {
	if (a >= 0n) {
		return (2n * a + b) / (2n * b)
	}
	return -((2n * -a + b) / (2n * b))
}
