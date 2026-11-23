/**
 * Compute the greatest common divisor of two non-negative BigInts iteratively.
 * Uses iterative Euclidean reduction to avoid recursion stack limits on large inputs.
 *
 * @param {bigint} x - Non-negative integer.
 * @param {bigint} y - Non-negative integer.
 * @returns {bigint} Non-negative greatest common divisor of x and y.
 */
function gcdBigInt(x, y) {
	let a = x < 0n ? -x : x;
	let b = y < 0n ? -y : y;
	while (b !== 0n) {
		const r = a % b;
		a = b;
		b = r;
	}
	return a;
}

/**
 * Validate and normalize a rational operand `{ num: bigint, den: bigint }` into
 * canonical lowest terms with a strictly positive denominator.
 *
 * @param {{ num: bigint, den: bigint }} value - Candidate rational object.
 * @param {string} label - Parameter label for diagnostic error messages.
 * @returns {{ num: bigint, den: bigint }} Normalized rational in lowest terms.
 * @throws {TypeError} If value is not an object with bigint `num` and `den` fields.
 * @throws {RangeError} If `den` is `0n`.
 */
function normalizeRational(value, label) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`${label} must be an object with bigint { num, den } properties`);
	}
	const { num, den } = value;
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label}.num and ${label}.den must be BigInts`);
	}
	if (den === 0n) {
		throw new RangeError(`${label}.den must not be 0n`);
	}
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}

	const sign = (num < 0n) !== (den < 0n) ? -1n : 1n;
	const absNum = num < 0n ? -num : num;
	const absDen = den < 0n ? -den : den;
	const g = gcdBigInt(absNum, absDen);

	return {
		num: sign * (absNum / g),
		den: absDen / g,
	};
}

/**
 * Divide two exact rational numbers `{ num: bigint, den: bigint }` and return the
 * quotient in canonical lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`, and
 * `{ num: 0n, den: 1n }` for zero).
 *
 * Numerical robustness:
 * - Inputs are normalized first to remove any common factors and canonicalize signs.
 * - Cross-cancellation (scaling by `gcd(|a.num|, |b.num|)` and `gcd(b.den, a.den)`)
 *   is performed before multiplying numerators and denominators, preventing unnecessary
 *   intermediate bit-length growth and guaranteeing the product is already in lowest terms.
 * - Iterative BigInt GCD avoids recursion-depth overflow on very large operands.
 *
 * @param {{ num: bigint, den: bigint }} a - Dividend rational `{ num, den }`.
 * @param {{ num: bigint, den: bigint }} b - Divisor rational `{ num, den }` (must be non-zero).
 * @returns {{ num: bigint, den: bigint }} Exact quotient `a / b` in lowest terms.
 * @throws {TypeError} If `a` or `b` is not a valid `{ num: bigint, den: bigint }` object.
 * @throws {RangeError} If either denominator is `0n` or if divisor `b` has `num === 0n`.
 */
export function divideRationalStable(a, b) {
	const na = normalizeRational(a, 'a');
	const nb = normalizeRational(b, 'b');

	if (nb.num === 0n) {
		throw new RangeError('Division by zero rational (b.num must not be 0n)');
	}
	if (na.num === 0n) {
		return { num: 0n, den: 1n };
	}

	const sign = (na.num < 0n) !== (nb.num < 0n) ? -1n : 1n;
	const absA = na.num < 0n ? -na.num : na.num;
	const absB = nb.num < 0n ? -nb.num : nb.num;

	// Cross-cancel common factors prior to multiplication to minimize intermediate magnitude.
	// Since gcd(absA, na.den) = 1 and gcd(absB, nb.den) = 1, cancelling cross-terms
	// guarantees gcd(n1 * n2, d1 * d2) === 1n without a post-multiplication GCD.
	const gNum = gcdBigInt(absA, absB);
	const gDen = gcdBigInt(nb.den, na.den);

	const n1 = absA / gNum;
	const d2 = absB / gNum;
	const n2 = nb.den / gDen;
	const d1 = na.den / gDen;

	return {
		num: sign * (n1 * n2),
		den: d1 * d2,
	};
}
