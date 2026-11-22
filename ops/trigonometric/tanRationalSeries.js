/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Computes the greatest common divisor of two BigInts using the Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative greatest common divisor of `a` and `b`.
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const r = x % y;
		x = y;
		y = r;
	}
	return x;
}

/**
 * Normalizes a rational fraction `num / den` to lowest terms with `den > 0n`.
 * Zero is canonicalized to `{ num: 0n, den: 1n }`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 * @throws {RangeError} If `den === 0n`.
 */
function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator cannot be zero');
	}
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}
	let n = num;
	let d = den;
	if (d < 0n) {
		n = -n;
		d = -d;
	}
	const g = gcd(n, d);
	return { num: n / g, den: d / g };
}

/**
 * Validates and normalizes an input rational object `{ num: BigInt, den: BigInt }`.
 *
 * @param {unknown} x
 * @returns {Rational}
 * @throws {TypeError} If `x` is not an object with BigInt `num` and `den` properties.
 * @throws {RangeError} If `x.den === 0n`.
 */
function validateRational(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('x must be a rational object { num: BigInt, den: BigInt }');
	}
	if (typeof x.num !== 'bigint' || typeof x.den !== 'bigint') {
		throw new TypeError('x.num and x.den must both be BigInts');
	}
	if (x.den === 0n) {
		throw new RangeError('x.den cannot be zero');
	}
	return normalizeRational(x.num, x.den);
}

/**
 * Computes `tan(x)` over exact rationals `{ num: BigInt, den: BigInt }` in lowest terms
 * using the exact ratio of the truncated Maclaurin series for `sin(x)` and `cos(x)`:
 *
 *   sin_N(x) = sum_{k=0}^{N-1} (-1)^k * x^(2k+1) / (2k+1)!
 *   cos_N(x) = sum_{k=0}^{N-1} (-1)^k * x^(2k)   / (2k)!
 *   tan_N(x) = sin_N(x) / cos_N(x)
 *
 * Algorithm:
 * Both series are evaluated exactly in integer BigInt arithmetic via backward Horner's
 * method over their common factorial-power denominators. Since the denominators satisfy
 * `sinDen = (2N - 1)! * q^(2N - 1) = (2N - 1) * q * cosDen`, the ratio simplifies to
 * `sinNum / (cosNum * (2N - 1) * q)` before a single final reduction by `gcd`.
 * Because `sin` and `cos` are entire functions, this ratio converges for all real
 * rationals `x` (including `|x| >= pi/2`, away from poles `(k + 1/2) * pi`), given
 * sufficiently many terms.
 *
 * @param {Rational} x - Input angle in radians as an exact rational `{ num: BigInt, den: BigInt }`.
 * @param {number} [terms=10] - Number of Maclaurin series terms (`N >= 1`) used for both `sin` and `cos`.
 * @returns {Rational} Exact rational approximation of `tan(x)` in lowest terms (`den > 0n`,
 *   `gcd(|num|, den) === 1n`, zero represented as `{ num: 0n, den: 1n }`).
 * @throws {TypeError} If `x` is not a valid `{ num: BigInt, den: BigInt }` object or `terms` is not a number.
 * @throws {RangeError} If `x.den === 0n`, `terms` is not a positive safe integer, or the
 *   truncated cosine series evaluates to zero (pole).
 */
export function tanRationalSeries(x, terms = 10) {
	const { num: p, den: q } = validateRational(x);

	if (typeof terms !== 'number') {
		throw new TypeError('terms must be a positive safe integer');
	}
	if (!Number.isSafeInteger(terms) || terms < 1) {
		throw new RangeError('terms must be a safe integer >= 1');
	}

	if (p === 0n) {
		return { num: 0n, den: 1n };
	}

	const p2 = p * p;
	const q2 = q * q;

	let sinNum = 1n;
	let sinDen = 1n;
	let cosNum = 1n;
	let cosDen = 1n;

	for (let k = terms - 1; k >= 1; k--) {
		const twoK = BigInt(2 * k);

		const sinFactor = twoK * (twoK + 1n) * q2;
		sinNum = sinFactor * sinDen - p2 * sinNum;
		sinDen = sinFactor * sinDen;

		const cosFactor = (twoK - 1n) * twoK * q2;
		cosNum = cosFactor * cosDen - p2 * cosNum;
		cosDen = cosFactor * cosDen;
	}

	sinNum *= p;

	if (cosNum === 0n) {
		throw new RangeError('Tangent pole: cosine series denominator is zero');
	}

	const finalNum = sinNum;
	const finalDen = cosNum * BigInt(2 * terms - 1) * q;
	return normalizeRational(finalNum, finalDen);
}
