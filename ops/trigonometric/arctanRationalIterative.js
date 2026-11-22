/**
 * Default binary precision (in significant bits) for {@link arctanRationalIterative}.
 * 160 bits corresponds to roughly 48 decimal digits of precision.
 */
const DEFAULT_PRECISION_BITS = 160;

/**
 * Maximum supported binary precision to prevent accidental unbounded allocation.
 */
const MAX_PRECISION_BITS = 100_000;

/**
 * Compute the greatest common divisor of two BigInts using the iterative
 * Euclidean algorithm. Always returns a non-negative BigInt.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
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
 * Return the binary bit-length of a non-negative BigInt.
 *
 * @param {bigint} n
 * @returns {number}
 */
function bitLength(n) {
	return n === 0n ? 0 : n.toString(2).length;
}

/**
 * Reduce a rational `num / 2^shiftBits` to lowest terms with `den > 0n`.
 * Because the denominator is a power of two, dividing out common factors
 * reduces to stripping shared trailing zero bits.
 *
 * @param {bigint} num
 * @param {number} shiftBits
 * @returns {{ num: bigint, den: bigint }}
 */
function reducePowerOfTwo(num, shiftBits) {
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}
	const negative = num < 0n;
	let absNum = negative ? -num : num;
	let remaining = shiftBits;

	while (remaining >= 32 && (absNum & 0xffffffffn) === 0n) {
		absNum >>= 32n;
		remaining -= 32;
	}
	while (remaining > 0 && (absNum & 1n) === 0n) {
		absNum >>= 1n;
		remaining -= 1;
	}

	return {
		num: negative ? -absNum : absNum,
		den: 1n << BigInt(remaining),
	};
}

/**
 * Iteratively reduce a unit-interval rational `0 < p / q <= 1` into:
 *
 *   arctan(p / q) = a * (pi / 4) + b * arctan(1 / 5) + arctan(rNum / rDen)
 *
 * where `|rNum / rDen| <= 1 / 8`, `a` is 0n or 1n, and `b` is in `[-1n, 2n]`.
 *
 * @param {bigint} p Positive numerator (`0n < p <= q`).
 * @param {bigint} q Positive denominator.
 * @returns {{ a: bigint, b: bigint, rNum: bigint, rDen: bigint }}
 */
function reduceUnitInterval(p, q) {
	let a = 0n;
	let b = 0n;
	let rNum = p;
	let rDen = q;

	// If x > 1/2, apply arctan(x) = pi/4 + arctan((x - 1) / (1 + x)), giving |r| <= 1/3.
	if (2n * rNum > rDen) {
		a = 1n;
		const nextNum = rNum - rDen;
		const nextDen = rNum + rDen;
		if (nextNum === 0n) {
			return { a, b, rNum: 0n, rDen: 1n };
		}
		const g = gcdBigInt(nextNum, nextDen);
		rNum = nextNum / g;
		rDen = nextDen / g;
	}

	// Iteratively subtract sign(r) * arctan(1/5) until |r| <= 1/8 (at most 2 iterations).
	while (8n * (rNum < 0n ? -rNum : rNum) > rDen) {
		let nextNum;
		let nextDen;
		if (rNum > 0n) {
			b += 1n;
			nextNum = 5n * rNum - rDen;
			nextDen = 5n * rDen + rNum;
		} else {
			b -= 1n;
			nextNum = 5n * rNum + rDen;
			nextDen = 5n * rDen - rNum;
		}
		if (nextNum === 0n) {
			return { a, b, rNum: 0n, rDen: 1n };
		}
		const g = gcdBigInt(nextNum, nextDen);
		rNum = nextNum / g;
		rDen = nextDen / g;
	}

	return { a, b, rNum, rDen };
}

/**
 * Evaluate `floor(arctan(p / q) * 2^scaleBits)` using Euler's accelerated
 * iterative series for arctan:
 *
 *   arctan(x) = (x / (1 + x^2)) * sum_{k=0}^{inf} prod_{j=1}^{k} ((2j)/(2j+1) * x^2/(1+x^2))
 *
 * For `0 < p / q <= 1 / 5`, every term is strictly positive and shrinks by at
 * least a factor of `1 / 26` per iteration, avoiding alternating-sign cancellation.
 *
 * @param {bigint} p Positive numerator.
 * @param {bigint} q Positive denominator (`p / q <= 1 / 5`).
 * @param {number} scaleBits Fixed-point binary scale exponent.
 * @returns {bigint}
 */
function atanEulerScaled(p, q, scaleBits) {
	const p2 = p * p;
	const q2 = q * q;
	const denomSum = p2 + q2;

	// t_0 = (p / q) / (1 + p^2 / q^2) * 2^scaleBits = (p * q * 2^scaleBits) / (p^2 + q^2)
	let term = ((p * q) << BigInt(scaleBits)) / denomSum;
	let sum = term;

	let k = 1n;
	while (term > 0n) {
		// t_k = t_{k-1} * (2k * p^2) / ((2k + 1) * (p^2 + q^2))
		const twoK = 2n * k;
		term = (term * twoK * p2) / ((twoK + 1n) * denomSum);
		sum += term;
		k += 1n;
	}

	return sum;
}

/**
 * Validate input rational `x` and normalize it to lowest terms with `den > 0n`.
 *
 * @param {unknown} x
 * @returns {{ num: bigint, den: bigint }}
 */
function validateAndNormalizeRational(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Expected rational x to be an object { num: bigint, den: bigint }');
	}
	const { num, den } = x;
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError('Rational x must have BigInt properties num and den');
	}
	if (den === 0n) {
		throw new RangeError('Rational denominator den must not be zero');
	}
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}

	const normNum = den < 0n ? -num : num;
	const normDen = den < 0n ? -den : den;
	const g = gcdBigInt(normNum, normDen);
	return { num: normNum / g, den: normDen / g };
}

/**
 * Validate optional configuration object and return the requested binary precision.
 *
 * @param {unknown} options
 * @returns {number}
 */
function validateOptions(options) {
	if (options === undefined) {
		return DEFAULT_PRECISION_BITS;
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('Expected options to be a plain object');
	}
	const { precisionBits = DEFAULT_PRECISION_BITS } = options;
	if (typeof precisionBits !== 'number' || Number.isNaN(precisionBits)) {
		throw new TypeError('options.precisionBits must be a number');
	}
	if (
		!Number.isInteger(precisionBits) ||
		precisionBits < 1 ||
		precisionBits > MAX_PRECISION_BITS
	) {
		throw new RangeError(
			`options.precisionBits must be an integer between 1 and ${MAX_PRECISION_BITS}`,
		);
	}
	return precisionBits;
}

/**
 * Compute `arctan(x)` (in radians, within `(-pi/2, pi/2)`) for an exact rational
 * number `x = { num: BigInt, den: BigInt }` using a straightforward iterative
 * range reduction and Euler's accelerated arctangent series.
 *
 * Algorithm overview:
 * 1. Returns exact `{ num: 0n, den: 1n }` when `x.num === 0n`.
 * 2. Uses odd symmetry `arctan(-x) = -arctan(x)` to work with `x > 0`.
 * 3. For `x > 1`, applies `arctan(x) = pi/2 - arctan(1/x)`.
 * 4. For `0 < x <= 1`, iteratively applies rational addition identities
 *    (`arctan(x) = pi/4 + arctan((x - 1)/(1 + x))` and subtracting `arctan(1/5)`)
 *    until the residual argument satisfies `|r| <= 1/8`.
 * 5. Expresses `pi/4` via Machin's identity `4 * arctan(1/5) - arctan(1/239)` and
 *    evaluates every small-argument arctan iteratively with Euler's series at
 *    adaptive binary fixed-point precision (preserving relative accuracy even for
 *    arbitrarily small `|x|`).
 * 6. Reduces the resulting rational to lowest terms with `den > 0n`.
 *
 * @param {{ num: bigint, den: bigint }} x Exact rational input (`den !== 0n`).
 * @param {{ precisionBits?: number }} [options] Optional precision settings.
 *   `precisionBits` defaults to 160 (~48 decimal digits of relative precision).
 * @returns {{ num: bigint, den: bigint }} Reduced rational approximation of `arctan(x)`
 *   in lowest terms with `den > 0n`.
 * @throws {TypeError} If `x` is not an object with BigInt `num` and `den`, or `options` is invalid.
 * @throws {RangeError} If `x.den === 0n` or `options.precisionBits` is out of range.
 */
export function arctanRationalIterative(x, options) {
	const { num, den } = validateAndNormalizeRational(x);
	const precisionBits = validateOptions(options);

	if (num === 0n) {
		return { num: 0n, den: 1n };
	}

	const negative = num < 0n;
	const absNum = negative ? -num : num;

	// Perform exact rational range reduction to |r| <= 1/8.
	let a;
	let b;
	let rNum;
	let rDen;

	if (absNum > den) {
		// arctan(x) = pi/2 - arctan(1/x)
		const reduced = reduceUnitInterval(den, absNum);
		a = 2n - reduced.a;
		b = -reduced.b;
		rNum = -reduced.rNum;
		rDen = reduced.rDen;
	} else {
		const reduced = reduceUnitInterval(absNum, den);
		a = reduced.a;
		b = reduced.b;
		rNum = reduced.rNum;
		rDen = reduced.rDen;
	}

	// Substitute Machin's formula: pi/4 = 4 * arctan(1/5) - arctan(1/239)
	const coefFifth = 4n * a + b;
	const coef239 = -a;

	// Choose adaptive output binary scale so very small |x| retains full relative precision.
	let outBits;
	if (coefFifth === 0n && coef239 === 0n) {
		const magShift = bitLength(rDen) - bitLength(rNum < 0n ? -rNum : rNum);
		outBits = precisionBits + magShift + 2;
	} else {
		outBits = precisionBits + 4;
	}

	const guardBits = 32 + Math.ceil(Math.log2(precisionBits + 16));
	const workBits = outBits + guardBits;

	let totalScaled = 0n;
	if (coefFifth !== 0n) {
		totalScaled += coefFifth * atanEulerScaled(1n, 5n, workBits);
	}
	if (coef239 !== 0n) {
		totalScaled += coef239 * atanEulerScaled(1n, 239n, workBits);
	}
	if (rNum !== 0n) {
		const rAbs = rNum < 0n ? -rNum : rNum;
		const rTerm = atanEulerScaled(rAbs, rDen, workBits);
		totalScaled += rNum < 0n ? -rTerm : rTerm;
	}

	const outScaled = totalScaled >> BigInt(guardBits);
	const signedOut = negative ? -outScaled : outScaled;
	return reducePowerOfTwo(signedOut, outBits);
}
