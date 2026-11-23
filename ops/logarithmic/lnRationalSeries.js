/**
 * Exact natural logarithm over positive BigInt rationals via dyadic range
 * reduction and the hyperbolic arctangent (atanh) series.
 *
 * Uses the exact identities:
 *   x = 2^m * r,  with unique m ∈ ℤ such that 1/√2 < r < √2 (2^(2m-1) < x² < 2^(2m+1)),
 *   ln(x) = m * ln(2) + ln(r),
 *   ln(2) = 2 * atanh(1/5) + 2 * atanh(1/7),
 *   ln(r) = 2 * atanh((r - 1) / (r + 1)) = 2 * Σ_{k=0}^{terms-1} u^(2k+1) / (2k + 1),
 * where u = (r - 1) / (r + 1) satisfies |u| < 3 - 2√2 ≈ 0.17157.
 *
 * All intermediate and final arithmetic is performed over exact BigInt rationals
 * reduced to lowest terms, with zero floating-point operations.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Compute the greatest common divisor of two BigInt values.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative greatest common divisor.
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const t = x % y;
		x = y;
		y = t;
	}
	return x;
}

/**
 * Reduce a rational number to lowest terms with a strictly positive denominator.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalize(num, den) {
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
 * Add two normalized rationals and return the sum in lowest terms.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function addRational(a, b) {
	if (a.num === 0n) return b;
	if (b.num === 0n) return a;
	const g = gcd(a.den, b.den);
	const aDenReduced = a.den / g;
	const bDenReduced = b.den / g;
	return normalize(a.num * bDenReduced + b.num * aDenReduced, aDenReduced * b.den);
}

/**
 * Return the bit length of a strictly positive BigInt.
 *
 * @param {bigint} n Strictly positive BigInt.
 * @returns {number}
 */
function bitLength(n) {
	const hex = n.toString(16);
	const lead = Number.parseInt(hex[0], 16);
	const leadBits = lead >= 8 ? 4 : lead >= 4 ? 3 : lead >= 2 ? 2 : 1;
	return (hex.length - 1) * 4 + leadBits;
}

/**
 * Evaluate the truncated series 2 * Σ_{k=0}^{terms-1} (u^(2k+1) / (2k + 1))
 * for an exact rational u = uNum / uDen using Horner's method.
 *
 * @param {bigint} uNum
 * @param {bigint} uDen
 * @param {number} terms Positive integer number of series terms.
 * @returns {Rational}
 */
function twoAtanhSeries(uNum, uDen, terms) {
	if (uNum === 0n) {
		return { num: 0n, den: 1n };
	}

	const u = normalize(uNum, uDen);
	const a = u.num * u.num;
	const b = u.den * u.den;

	// Horner evaluation of Σ_{k=0}^{terms-1} (a/b)^k / (2k + 1)
	let accNum = 1n;
	let accDen = BigInt(2 * terms - 1);

	for (let k = terms - 2; k >= 0; k--) {
		const d = BigInt(2 * k + 1);
		const prodNum = accNum * a;
		const prodDen = accDen * b;
		const sumNum = prodDen + d * prodNum;
		const sumDen = d * prodDen;
		const g = gcd(sumNum, sumDen);
		accNum = sumNum / g;
		accDen = sumDen / g;
	}

	return normalize(2n * u.num * accNum, u.den * accDen);
}

/**
 * Compute the natural logarithm of a strictly positive exact rational number
 * `x = { num: bigint, den: bigint }` using dyadic range reduction and the
 * `atanh` power series, returning an exact rational in lowest terms.
 *
 * Properties preserved exactly for any `terms >= 1`:
 * - `lnRationalSeries({ num: 1n, den: 1n }, terms)` equals `{ num: 0n, den: 1n }`.
 * - `lnRationalSeries({ num: q, den: p }, terms)` equals the exact negation of
 *   `lnRationalSeries({ num: p, den: q }, terms)`.
 * - `lnRationalSeries({ num: (2n ** k) * p, den: q }, terms)` equals
 *   `k * lnRationalSeries({ num: 2n, den: 1n }, terms) + lnRationalSeries({ num: p, den: q }, terms)`.
 *
 * @param {Rational} x Strictly positive rational `{ num: bigint, den: bigint }`.
 * @param {number} [terms=12] Number of odd terms in each `atanh` series (positive safe integer).
 * @returns {Rational} Natural logarithm approximation as `{ num: bigint, den: bigint }` in lowest terms (`den > 0n`).
 * @throws {TypeError} If `x` is not a `{ num: bigint, den: bigint }` object or `terms` is not a number.
 * @throws {RangeError} If `x.den === 0n`, `x <= 0`, or `terms` is not a positive safe integer.
 */
export function lnRationalSeries(x, terms = 12) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('lnRationalSeries: x must be an object of shape { num: bigint, den: bigint }');
	}
	if (typeof x.num !== 'bigint' || typeof x.den !== 'bigint') {
		throw new TypeError('lnRationalSeries: x.num and x.den must both be BigInt values');
	}
	if (x.den === 0n) {
		throw new RangeError('lnRationalSeries: denominator must be non-zero');
	}
	if (typeof terms !== 'number') {
		throw new TypeError('lnRationalSeries: terms must be a number');
	}
	if (!Number.isSafeInteger(terms) || terms < 1) {
		throw new RangeError('lnRationalSeries: terms must be a positive safe integer');
	}

	const normX = normalize(x.num, x.den);
	if (normX.num <= 0n) {
		throw new RangeError('lnRationalSeries: input must be strictly positive (x > 0)');
	}

	// Exact closed form for ln(1) = 0
	if (normX.num === 1n && normX.den === 1n) {
		return { num: 0n, den: 1n };
	}

	// Dyadic range reduction: find unique integer m such that 2^(2m-1) < x^2 < 2^(2m+1),
	// so r = x * 2^(-m) strictly lies in (1/√2, √2).
	let m = BigInt(bitLength(normX.num) - bitLength(normX.den));
	let rNum = normX.num;
	let rDen = normX.den;

	if (m > 0n) {
		rDen <<= m;
	} else if (m < 0n) {
		rNum <<= -m;
	}

	const rNumSq = rNum * rNum;
	const rDenSq = rDen * rDen;
	if (rNumSq > 2n * rDenSq) {
		m += 1n;
		rDen <<= 1n;
	} else if (2n * rNumSq < rDenSq) {
		m -= 1n;
		rNum <<= 1n;
	}

	const r = normalize(rNum, rDen);

	// ln(r) = 2 * atanh((r - 1) / (r + 1))
	const lnR = twoAtanhSeries(r.num - r.den, r.num + r.den, terms);

	if (m === 0n) {
		return lnR;
	}

	// ln(2) = ln(3/2) + ln(4/3) = 2 * atanh(1/5) + 2 * atanh(1/7)
	const ln2 = addRational(
		twoAtanhSeries(1n, 5n, terms),
		twoAtanhSeries(1n, 7n, terms),
	);
	const mLn2 = normalize(m * ln2.num, ln2.den);

	return addRational(mLn2, lnR);
}
