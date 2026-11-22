/**
 * Exact rational representation in lowest terms.
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Computes the absolute value of a BigInt.
 * @param {bigint} value
 * @returns {bigint}
 */
function absBigInt(value) {
	return value < 0n ? -value : value;
}

/**
 * Computes the non-negative greatest common divisor of two BigInts via the Euclidean algorithm.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = absBigInt(a);
	let y = absBigInt(b);
	while (y !== 0n) {
		const remainder = x % y;
		x = y;
		y = remainder;
	}
	return x;
}

/**
 * Normalizes an exact rational (num / den) to lowest terms with den > 0n,
 * gcd(|num|, den) === 1n, and zero represented as { num: 0n, den: 1n }.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 * @throws {RangeError} If den === 0n.
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
 * Validates and normalizes an input rational object without mutating it.
 *
 * @param {unknown} x
 * @returns {Rational}
 * @throws {TypeError} If x is not an object with BigInt num and den properties.
 * @throws {RangeError} If x.den === 0n.
 */
function validateRational(x) {
	if (x === null || typeof x !== 'object') {
		throw new TypeError('x must be a rational object { num: BigInt, den: BigInt }');
	}
	if (typeof x.num !== 'bigint' || typeof x.den !== 'bigint') {
		throw new TypeError('x.num and x.den must be BigInts');
	}
	return normalizeRational(x.num, x.den);
}

/**
 * Validates the order parameter k as a non-negative safe integer (number or BigInt).
 *
 * @param {unknown} k
 * @returns {number}
 * @throws {TypeError} If k is neither a number nor a BigInt.
 * @throws {RangeError} If k is negative, non-integer, or exceeds Number.MAX_SAFE_INTEGER.
 */
function validateOrder(k) {
	if (typeof k === 'number') {
		if (!Number.isInteger(k) || !Number.isSafeInteger(k) || k < 0) {
			throw new RangeError('k must be a non-negative safe integer');
		}
		return k;
	}
	if (typeof k === 'bigint') {
		if (k < 0n || k > BigInt(Number.MAX_SAFE_INTEGER)) {
			throw new RangeError('k must be a non-negative integer within safe integer range');
		}
		return Number(k);
	}
	throw new TypeError('k must be a non-negative integer (number or BigInt)');
}

/**
 * Computes the k-th row of signed Stirling numbers of the first kind s(k, m)
 * for 0 <= m <= k using the exact recurrence:
 *   s(0, 0) = 1
 *   s(n, 0) = 0 for n >= 1
 *   s(n, m) = s(n - 1, m - 1) - (n - 1) * s(n - 1, m) for 1 <= m <= n
 *
 * @param {number} k Non-negative integer.
 * @returns {bigint[]} Array of length k + 1 where index m holds s(k, m).
 */
function signedStirlingFirstRow(k) {
	const row = new Array(k + 1).fill(0n);
	row[0] = 1n;
	for (let n = 1; n <= k; n++) {
		const factor = BigInt(n - 1);
		for (let m = n; m >= 1; m--) {
			row[m] = row[m - 1] - factor * row[m];
		}
		row[0] = 0n;
	}
	return row;
}

/**
 * Computes the generalized discrete permutations (falling factorial / Pochhammer polynomial)
 * P(x, k) = (x)_k over exact rationals using the signed Stirling numbers of the first kind
 * polynomial series identity:
 *
 *   P(x, k) = (x)_k = prod_{j=0}^{k-1} (x - j) = sum_{m=0}^{k} s(k, m) * x^m
 *
 * For an exact normalized rational x = p / q (q > 0, gcd(|p|, q) = 1), the series is evaluated
 * exactly via homogeneous Horner's method:
 *
 *   (p / q)_k = (sum_{m=0}^{k} s(k, m) * p^m * q^(k - m)) / q^k
 *
 * and reduced to lowest terms with positive denominator.
 *
 * @param {Rational} x Exact rational { num: BigInt, den: BigInt } with den !== 0n.
 * @param {number | bigint} k Non-negative integer permutation length / falling factorial order.
 * @returns {Rational} Exact rational P(x, k) normalized to lowest terms with den > 0n.
 * @throws {TypeError} If x is not a valid { num: BigInt, den: BigInt } object or k is not a number/BigInt.
 * @throws {RangeError} If x.den === 0n or k is negative, non-integer, or not a safe integer.
 */
export function permutationsRationalSeries(x, k) {
	const { num: p, den: q } = validateRational(x);
	const order = validateOrder(k);

	if (order === 0) {
		return { num: 1n, den: 1n };
	}

	// Exact root identity: for integer x with 0 <= x < k, (x)_k contains the factor (x - x) = 0.
	if (q === 1n && p >= 0n && p < BigInt(order)) {
		return { num: 0n, den: 1n };
	}

	const stirling = signedStirlingFirstRow(order);

	// Homogeneous Horner evaluation of sum_{m=0}^{k} s(k, m) * p^m * q^(k - m) over q^k.
	let num = stirling[order];
	let den = 1n;
	for (let m = order - 1; m >= 0; m--) {
		den *= q;
		num = num * p + stirling[m] * den;
	}

	return normalizeRational(num, den);
}
