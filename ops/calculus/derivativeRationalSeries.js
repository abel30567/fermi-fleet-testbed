/**
 * Compute the non-negative greatest common divisor of two BigInts.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	a = a < 0n ? -a : a;
	b = b < 0n ? -b : b;
	while (b !== 0n) {
		const r = a % b;
		a = b;
		b = r;
	}
	return a;
}

/**
 * Validate and normalize a rational object `{ num: BigInt, den: BigInt }`
 * into canonical lowest terms with `den > 0n` and zero as `{ num: 0n, den: 1n }`.
 *
 * @param {{ num: bigint, den: bigint }} value
 * @param {number} index
 * @returns {{ num: bigint, den: bigint }}
 */
function parseRational(value, index) {
	if (
		typeof value !== 'object' ||
		value === null ||
		typeof value.num !== 'bigint' ||
		typeof value.den !== 'bigint'
	) {
		throw new TypeError(
			`coeffs[${index}] must be an object with BigInt properties { num, den }`
		);
	}
	if (value.den === 0n) {
		throw new RangeError(`coeffs[${index}].den must be non-zero`);
	}
	let { num, den } = value;
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}
	if (den < 0n) {
		num = -num;
		den = -den;
	}
	const g = gcdBigInt(num, den);
	return { num: num / g, den: den / g };
}

/**
 * Compute the exact formal derivative of a given non-negative integer order
 * for a rational power series / polynomial `f(x) = sum_{k=0}^{n-1} c_k x^k`.
 *
 * Algorithm:
 * Uses the closed-form falling factorial identity for the m-th formal derivative:
 *
 *   f^(m)(x) = sum_{j=0}^{n-1-m} c_{j+m} * ((j + m)! / j!) * x^j
 *
 * The falling factorial factor F(j) = (j + m)! / j! is computed in O(m + n)
 * exact BigInt operations via the recurrence:
 *   F(0) = m!
 *   F(j) = F(j - 1) * (j + m) / j   (for j >= 1)
 *
 * Before multiplying each normalized coefficient `p / q` by `F(j)`, the common
 * factor `gcd(F(j), q)` is cancelled so every output coefficient is guaranteed
 * to be in canonical lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`, and
 * zero represented as `{ num: 0n, den: 1n }`).
 *
 * If `order >= coeffs.length` (e.g., differentiating a constant polynomial with
 * `order = 1`), the derivative is identically zero and `[{ num: 0n, den: 1n }]`
 * is returned.
 *
 * @param {Array<{ num: bigint, den: bigint }>} coeffs
 *   Non-empty array of exact rational coefficients `[c_0, c_1, ...]` representing
 *   `sum c_k x^k`. Each element must have BigInt `num` and non-zero BigInt `den`.
 * @param {number} [order=1]
 *   Non-negative safe integer specifying the order of differentiation.
 * @returns {Array<{ num: bigint, den: bigint }>}
 *   Coefficient array of the formal `order`-th derivative with every entry in
 *   canonical lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`, zero as
 *   `{ num: 0n, den: 1n }`).
 * @throws {TypeError} If `coeffs` is not an Array, any element is not a valid
 *   `{ num: BigInt, den: BigInt }` object, or `order` is not a number.
 * @throws {RangeError} If `coeffs` is empty, any denominator is `0n`, or
 *   `order` is negative or not a safe integer.
 */
export function derivativeRationalSeries(coeffs, order = 1) {
	if (!Array.isArray(coeffs)) {
		throw new TypeError('coeffs must be an array of rational objects');
	}
	if (coeffs.length === 0) {
		throw new RangeError('coeffs must be a non-empty array');
	}
	if (typeof order !== 'number') {
		throw new TypeError('order must be a non-negative safe integer');
	}
	if (!Number.isSafeInteger(order) || order < 0) {
		throw new RangeError('order must be a non-negative safe integer');
	}

	const normalized = new Array(coeffs.length);
	for (let i = 0; i < coeffs.length; i++) {
		if (!(i in coeffs)) {
			throw new TypeError(
				`coeffs[${i}] must be an object with BigInt properties { num, den }`
			);
		}
		normalized[i] = parseRational(coeffs[i], i);
	}

	if (order === 0) {
		return normalized;
	}

	if (order >= normalized.length) {
		return [{ num: 0n, den: 1n }];
	}

	// Base falling factorial: F(0) = order!
	let factor = 1n;
	for (let i = 2; i <= order; i++) {
		factor *= BigInt(i);
	}

	const outLen = normalized.length - order;
	const result = new Array(outLen);

	for (let j = 0; j < outLen; j++) {
		if (j > 0) {
			factor = (factor * BigInt(j + order)) / BigInt(j);
		}
		const { num, den } = normalized[j + order];
		if (num === 0n) {
			result[j] = { num: 0n, den: 1n };
		} else {
			const g = gcdBigInt(factor, den);
			result[j] = {
				num: num * (factor / g),
				den: den / g,
			};
		}
	}

	return result;
}
