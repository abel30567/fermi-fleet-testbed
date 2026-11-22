/**
 * Exact rational arithmetic subtraction using recursive Euclidean GCD reduction
 * and divide-and-conquer recursive summation for variadic or list subtrahends.
 *
 * A rational number is represented as `{ num: bigint, den: bigint }` with
 * `den !== 0n`. All returned rationals are normalized to lowest terms with
 * `den > 0n`, and zero is uniquely represented as `{ num: 0n, den: 1n }`.
 *
 * @module ops/arithmetic/subtractRationalRecursive
 */

/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Computes the greatest common divisor of two non-negative BigInts using
 * the recursive Euclidean algorithm.
 *
 * @param {bigint} a - Non-negative integer.
 * @param {bigint} b - Non-negative integer.
 * @returns {bigint} Non-negative greatest common divisor of `a` and `b`.
 */
function gcdRecursive(a, b) {
	if (b === 0n) {
		return a;
	}
	return gcdRecursive(b, a % b);
}

/**
 * Normalizes a numerator/denominator pair to lowest terms with `den > 0n`
 * and `{ num: 0n, den: 1n }` for zero.
 *
 * @param {bigint} num - Rational numerator.
 * @param {bigint} den - Rational denominator (must be non-zero).
 * @returns {Rational} Normalized rational in lowest terms.
 * @throws {RangeError} If `den === 0n`.
 */
function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must not be zero');
	}
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}

	let normNum = num;
	let normDen = den;
	if (normDen < 0n) {
		normNum = -normNum;
		normDen = -normDen;
	}

	const absNum = normNum < 0n ? -normNum : normNum;
	const divisor = gcdRecursive(absNum, normDen);
	return {
		num: normNum / divisor,
		den: normDen / divisor,
	};
}

/**
 * Validates that a value is a well-formed `{ num: bigint, den: bigint }`
 * rational object and returns its normalized form.
 *
 * @param {unknown} value - Candidate rational object.
 * @param {string} label - Parameter label for error messages.
 * @returns {Rational} Normalized rational in lowest terms.
 * @throws {TypeError} If `value` is not an object with BigInt `num` and `den`.
 * @throws {RangeError} If `value.den === 0n`.
 */
function validateAndNormalize(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be a rational object { num: BigInt, den: BigInt }`);
	}
	const { num, den } = value;
	if (typeof num !== 'bigint') {
		throw new TypeError(`${label}.num must be a BigInt`);
	}
	if (typeof den !== 'bigint') {
		throw new TypeError(`${label}.den must be a BigInt`);
	}
	return normalizeRational(num, den);
}

/**
 * Adds two normalized rationals and returns the normalized sum.
 *
 * @param {Rational} x - Normalized rational.
 * @param {Rational} y - Normalized rational.
 * @returns {Rational} Normalized sum `x + y`.
 */
function addNormalized(x, y) {
	const g = gcdRecursive(x.den, y.den);
	const xDenReduced = x.den / g;
	const yDenReduced = y.den / g;
	const num = x.num * yDenReduced + y.num * xDenReduced;
	const den = xDenReduced * y.den;
	return normalizeRational(num, den);
}

/**
 * Subtracts two normalized rationals and returns the normalized difference.
 *
 * @param {Rational} x - Normalized minuend.
 * @param {Rational} y - Normalized subtrahend.
 * @returns {Rational} Normalized difference `x - y`.
 */
function subtractNormalized(x, y) {
	const g = gcdRecursive(x.den, y.den);
	const xDenReduced = x.den / g;
	const yDenReduced = y.den / g;
	const num = x.num * yDenReduced - y.num * xDenReduced;
	const den = xDenReduced * y.den;
	return normalizeRational(num, den);
}

/**
 * Sums a slice `list[start..end)` of normalized rationals using recursive
 * divide-and-conquer binary splitting.
 *
 * @param {Rational[]} list - Array of normalized rationals.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {Rational} Normalized sum of the slice.
 */
function sumRationalsDivideAndConquer(list, start, end) {
	if (start >= end) {
		return { num: 0n, den: 1n };
	}
	if (end - start === 1) {
		return list[start];
	}
	const mid = start + ((end - start) >> 1);
	const leftSum = sumRationalsDivideAndConquer(list, start, mid);
	const rightSum = sumRationalsDivideAndConquer(list, mid, end);
	return addNormalized(leftSum, rightSum);
}

/**
 * Subtracts one or more exact rationals from `a`, returning the exact result
 * normalized to lowest terms with `den > 0n` (and `{ num: 0n, den: 1n }` for zero).
 *
 * Supports both:
 * - Two or more positional rationals: `subtractRationalRecursive(a, b)` or
 *   `subtractRationalRecursive(a, b1, b2, ..., bk)`, computing `a - (b1 + b2 + ... + bk)`.
 * - A minuend and an array of subtrahends: `subtractRationalRecursive(a, [b1, b2, ..., bk])`,
 *   computing `a - (b1 + b2 + ... + bk)` (an empty list returns normalized `a`).
 *
 * Reduction uses recursive Euclidean GCD, and multi-subtrahend tails are combined
 * via divide-and-conquer recursive summation.
 *
 * @param {Rational} a - Minuend rational `{ num: bigint, den: bigint }`.
 * @param {...(Rational | Rational[])} subtrahends - One or more subtrahend rationals,
 *   or a single array of subtrahend rationals.
 * @returns {Rational} Exact difference normalized to lowest terms with `den > 0n`.
 * @throws {TypeError} If fewer than two arguments are provided, or if any argument
 *   is not a valid rational object (with BigInt `num` and `den`).
 * @throws {RangeError} If any rational has a zero denominator (`den === 0n`).
 */
export function subtractRationalRecursive(a, ...subtrahends) {
	if (subtrahends.length === 0) {
		throw new TypeError('subtractRationalRecursive requires at least two arguments (a, b)');
	}

	const minuend = validateAndNormalize(a, 'a');

	const rawSubtrahends =
		subtrahends.length === 1 && Array.isArray(subtrahends[0])
			? subtrahends[0]
			: subtrahends;

	const normalizedSubtrahends = new Array(rawSubtrahends.length);
	const isArrayForm = subtrahends.length === 1 && Array.isArray(subtrahends[0]);
	for (let i = 0; i < rawSubtrahends.length; i += 1) {
		const label = isArrayForm ? `subtrahends[${i}]` : `subtrahend ${i + 1}`;
		normalizedSubtrahends[i] = validateAndNormalize(rawSubtrahends[i], label);
	}

	if (normalizedSubtrahends.length === 0) {
		return minuend;
	}
	if (normalizedSubtrahends.length === 1) {
		return subtractNormalized(minuend, normalizedSubtrahends[0]);
	}

	const totalSubtrahend = sumRationalsDivideAndConquer(
		normalizedSubtrahends,
		0,
		normalizedSubtrahends.length,
	);
	return subtractNormalized(minuend, totalSubtrahend);
}
