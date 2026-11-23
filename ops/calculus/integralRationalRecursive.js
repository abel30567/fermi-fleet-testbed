/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Returns the absolute value of a BigInt.
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function absBigInt(n) {
	return n < 0n ? -n : n;
}

/**
 * Computes the non-negative greatest common divisor of two BigInts.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = absBigInt(a);
	let y = absBigInt(b);
	while (y !== 0n) {
		const r = x % y;
		x = y;
		y = r;
	}
	return x;
}

/**
 * Normalizes a rational pair `(num, den)` into lowest terms with `den > 0n`.
 * Zero is always represented as `{ num: 0n, den: 1n }`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must not be zero');
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
	const g = gcdBigInt(n, d);
	return { num: n / g, den: d / g };
}

/**
 * Validates and normalizes an input rational `{ num: bigint, den: bigint }`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function parseRational(value, label) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`${label} must be an object with BigInt num and den`);
	}
	const { num, den } = /** @type {{ num?: unknown, den?: unknown }} */ (value);
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label}.num and ${label}.den must both be BigInt`);
	}
	if (den === 0n) {
		throw new RangeError(`${label}.den must not be zero`);
	}
	return normalizeRational(num, den);
}

/**
 * Adds two normalized rationals and returns a normalized rational.
 *
 * @param {Rational} p
 * @param {Rational} q
 * @returns {Rational}
 */
function addRational(p, q) {
	if (p.num === 0n) return q;
	if (q.num === 0n) return p;
	const g = gcdBigInt(p.den, q.den);
	const num = p.num * (q.den / g) + q.num * (p.den / g);
	const den = (p.den / g) * q.den;
	return normalizeRational(num, den);
}

/**
 * Subtracts normalized rational `q` from `p` and returns a normalized rational.
 *
 * @param {Rational} p
 * @param {Rational} q
 * @returns {Rational}
 */
function subRational(p, q) {
	return addRational(p, { num: -q.num, den: q.den });
}

/**
 * Multiplies two normalized rationals and returns a normalized rational.
 *
 * @param {Rational} p
 * @param {Rational} q
 * @returns {Rational}
 */
function mulRational(p, q) {
	if (p.num === 0n || q.num === 0n) {
		return { num: 0n, den: 1n };
	}
	const g1 = gcdBigInt(p.num, q.den);
	const g2 = gcdBigInt(q.num, p.den);
	const num = (p.num / g1) * (q.num / g2);
	const den = (p.den / g2) * (q.den / g1);
	return normalizeRational(num, den);
}

/**
 * Divide-and-conquer evaluation of the shifted antiderivative sum over index range `[lo, hi]`:
 *   value = sum_{k=lo}^{hi} (coeffs[k] / (k + 1)) * x^(k - lo)
 *   xPow  = x^(hi - lo + 1)
 *
 * @param {Rational[]} coeffs
 * @param {number} lo
 * @param {number} hi
 * @param {Rational} x
 * @returns {{ value: Rational, xPow: Rational }}
 */
function evalAntiderivativeSplit(coeffs, lo, hi, x) {
	if (lo === hi) {
		const coeff = coeffs[lo];
		const scaled = coeff.num === 0n
			? { num: 0n, den: 1n }
			: normalizeRational(coeff.num, coeff.den * BigInt(lo + 1));
		return { value: scaled, xPow: x };
	}

	const mid = (lo + hi) >>> 1;
	const left = evalAntiderivativeSplit(coeffs, lo, mid, x);
	const right = evalAntiderivativeSplit(coeffs, mid + 1, hi, x);

	return {
		value: addRational(left.value, mulRational(left.xPow, right.value)),
		xPow: mulRational(left.xPow, right.xPow),
	};
}

/**
 * Evaluates the zero-constant antiderivative F(x) = sum_{k=0}^{n-1} (c_k / (k + 1)) * x^(k + 1)
 * at rational `x` via divide-and-conquer binary splitting.
 *
 * @param {Rational[]} coeffs
 * @param {Rational} x
 * @returns {Rational}
 */
function evalAntiderivative(coeffs, x) {
	if (coeffs.length === 0 || x.num === 0n) {
		return { num: 0n, den: 1n };
	}
	const { value } = evalAntiderivativeSplit(coeffs, 0, coeffs.length - 1, x);
	return mulRational(x, value);
}

/**
 * Computes the exact definite integral of a polynomial with rational coefficients
 * over the interval `[a, b]` using a recursive divide-and-conquer (binary splitting)
 * algorithm over exact BigInt rationals.
 *
 * The polynomial is represented in ascending-degree order:
 *   P(x) = coeffs[0] + coeffs[1] * x + ... + coeffs[n] * x^n
 *
 * Returns the exact value of:
 *   integral_a^b P(x) dx = sum_{k=0}^{n} (coeffs[k] / (k + 1)) * (b^(k + 1) - a^(k + 1))
 *
 * as a normalized rational `{ num: bigint, den: bigint }` in lowest terms with `den > 0n`.
 *
 * @param {ReadonlyArray<Rational>} coeffs - Polynomial coefficients `[c_0, c_1, ..., c_n]` as exact rationals.
 * @param {Rational} a - Lower limit of integration as an exact rational.
 * @param {Rational} b - Upper limit of integration as an exact rational.
 * @returns {Rational} Exact definite integral in lowest terms with `den > 0n`.
 * @throws {TypeError} If `coeffs` is not an array or any rational argument is malformed.
 * @throws {RangeError} If any rational argument has a zero denominator.
 */
export function integralRationalRecursive(coeffs, a, b) {
	if (!Array.isArray(coeffs)) {
		throw new TypeError('coeffs must be an array of rationals');
	}

	const lower = parseRational(a, 'a');
	const upper = parseRational(b, 'b');

	/** @type {Rational[]} */
	const normalizedCoeffs = new Array(coeffs.length);
	for (let i = 0; i < coeffs.length; i++) {
		if (!(i in coeffs)) {
			throw new TypeError(`coeffs[${i}] must be an object with BigInt num and den`);
		}
		normalizedCoeffs[i] = parseRational(coeffs[i], `coeffs[${i}]`);
	}

	if (normalizedCoeffs.length === 0 || (lower.num === upper.num && lower.den === upper.den)) {
		return { num: 0n, den: 1n };
	}

	const fUpper = evalAntiderivative(normalizedCoeffs, upper);
	const fLower = evalAntiderivative(normalizedCoeffs, lower);
	return subRational(fUpper, fLower);
}
