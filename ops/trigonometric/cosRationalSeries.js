/**
 * Computes the absolute value of a BigInt.
 *
 * @param {bigint} n - Input integer.
 * @returns {bigint} Non-negative absolute value |n|.
 */
function absBigInt(n) {
	return n < 0n ? -n : n;
}

/**
 * Computes the greatest common divisor of two non-negative BigInts
 * using the Euclidean algorithm.
 *
 * @param {bigint} a - Non-negative integer.
 * @param {bigint} b - Non-negative integer.
 * @returns {bigint} Greatest common divisor gcd(a, b).
 */
function gcd(a, b) {
	let x = a;
	let y = b;
	while (y !== 0n) {
		const r = x % y;
		x = y;
		y = r;
	}
	return x;
}

/**
 * Computes cos(x) for an exact rational number x = { num, den } using the
 * exact rational Maclaurin series truncated to `terms` terms:
 *
 *   cos(x) ≈ Σ_{k=0}^{terms - 1} (-1)^k * x^(2k) / (2k)!
 *
 * Algorithm:
 * 1. Validate `x` (non-null object with BigInt `num` and non-zero BigInt `den`)
 *    and `terms` (positive safe integer, defaulting to 10).
 * 2. Normalize |x| = p / q in lowest terms (exploiting evenness cos(-x) = cos(x)).
 * 3. Evaluate the Maclaurin polynomial using nested Horner's scheme over exact
 *    rationals:
 *      S_N(x) = 1 - (x^2 / (1*2)) * (1 - (x^2 / (3*4)) * (... * (1 - x^2 / ((2N-3)*(2N-2)))...))
 *    reducing the rational accumulator by gcd at each step to keep numerator
 *    and denominator minimal.
 * 4. Return the exact rational result in canonical lowest terms
 *    (`den > 0n`, `gcd(|num|, den) === 1n`, zero represented as `{ num: 0n, den: 1n }`).
 *
 * @param {{ num: bigint, den: bigint }} x - Exact rational angle in radians.
 * @param {number} [terms=10] - Number of Maclaurin series terms to sum (integer >= 1).
 * @returns {{ num: bigint, den: bigint }} Exact rational approximation of cos(x) in lowest terms.
 * @throws {TypeError} If `x` is not an object with BigInt `num` and `den`, or if `terms` is not a number.
 * @throws {RangeError} If `x.den === 0n`, or if `terms` is not a positive safe integer (>= 1).
 */
export function cosRationalSeries(x, terms = 10) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('x must be a rational object { num: BigInt, den: BigInt }');
	}
	if (typeof x.num !== 'bigint' || typeof x.den !== 'bigint') {
		throw new TypeError('x.num and x.den must be BigInts');
	}
	if (x.den === 0n) {
		throw new RangeError('x.den must be non-zero');
	}
	if (typeof terms !== 'number') {
		throw new TypeError('terms must be a number');
	}
	if (!Number.isSafeInteger(terms) || terms < 1) {
		throw new RangeError('terms must be a positive safe integer (>= 1)');
	}

	if (x.num === 0n || terms === 1) {
		return { num: 1n, den: 1n };
	}

	const absNum = absBigInt(x.num);
	const absDen = absBigInt(x.den);
	const g = gcd(absNum, absDen);
	const p = absNum / g;
	const q = absDen / g;

	const x2Num = p * p;
	const x2Den = q * q;

	let accNum = 1n;
	let accDen = 1n;

	for (let k = terms - 1; k >= 1; k--) {
		const bk = BigInt(k);
		const factor = (2n * bk - 1n) * (2n * bk);
		const subNum = x2Num * accNum;
		const commonDen = x2Den * factor * accDen;
		const nextNum = commonDen - subNum;

		if (nextNum === 0n) {
			accNum = 0n;
			accDen = 1n;
		} else {
			const d = gcd(absBigInt(nextNum), commonDen);
			accNum = nextNum / d;
			accDen = commonDen / d;
		}
	}

	return { num: accNum, den: accDen };
}
