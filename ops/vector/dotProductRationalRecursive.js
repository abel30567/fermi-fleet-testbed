/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * An exact rational number represented as a numerator and denominator of type `bigint`.
 * Normalized outputs always satisfy `den > 0n`, `gcd(|num|, den) === 1n`,
 * and represent zero uniquely as `{ num: 0n, den: 1n }`.
 */

/**
 * Computes the absolute value of a BigInt.
 *
 * @param {bigint} value
 * @returns {bigint}
 */
function absBigInt(value) {
	return value < 0n ? -value : value;
}

/**
 * Computes the greatest common divisor of two BigInts using the Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative greatest common divisor.
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
 * Reduces a rational `(num / den)` to canonical lowest terms with `den > 0n`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalizeRational(num, den) {
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
 * Validates and normalizes a single rational input.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 * @throws {TypeError} If `value` is not an object with `bigint` `num` and `den` fields.
 * @throws {RangeError} If `value.den === 0n`.
 */
function validateRational(value, label) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`${label} must be a rational object { num: bigint, den: bigint }`);
	}
	const { num, den } = /** @type {{ num?: unknown, den?: unknown }} */ (value);
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label} must have bigint num and den properties`);
	}
	if (den === 0n) {
		throw new RangeError(`${label} must have a non-zero denominator`);
	}
	return normalizeRational(num, den);
}

/**
 * Multiplies two normalized rationals and returns the exact product in lowest terms.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function multiplyRational(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n };
	}
	const g1 = gcdBigInt(a.num, b.den);
	const g2 = gcdBigInt(b.num, a.den);
	return normalizeRational(
		(a.num / g1) * (b.num / g2),
		(a.den / g2) * (b.den / g1),
	);
}

/**
 * Adds two normalized rationals and returns the exact sum in lowest terms.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function addRational(a, b) {
	if (a.num === 0n) {
		return { num: b.num, den: b.den };
	}
	if (b.num === 0n) {
		return { num: a.num, den: a.den };
	}
	const g = gcdBigInt(a.den, b.den);
	const aDenDivG = a.den / g;
	const bDenDivG = b.den / g;
	const num = a.num * bDenDivG + b.num * aDenDivG;
	const den = aDenDivG * b.den;
	return normalizeRational(num, den);
}

/**
 * Recursively computes the dot product over the half-open slice `[start, end)`.
 *
 * Splits `[start, end)` at the midpoint into two balanced halves, computes each
 * half's exact rational dot product recursively, and combines them via exact
 * rational addition in lowest terms.
 *
 * @param {Rational[]} vecA
 * @param {Rational[]} vecB
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index (`end > start`).
 * @returns {Rational}
 */
function dotRangeRecursive(vecA, vecB, start, end) {
	if (end - start === 1) {
		return multiplyRational(vecA[start], vecB[start]);
	}
	const mid = start + Math.floor((end - start) / 2);
	const left = dotRangeRecursive(vecA, vecB, start, mid);
	const right = dotRangeRecursive(vecA, vecB, mid, end);
	return addRational(left, right);
}

/**
 * Computes the exact dot product of two equal-length vectors of exact rationals
 * using a recursive divide-and-conquer split.
 *
 * Algorithm:
 * 1. Validates both inputs are arrays of equal length and every element is a valid
 *    rational `{ num: bigint, den: bigint }` with `den !== 0n`, normalizing each entry.
 * 2. Returns `{ num: 0n, den: 1n }` for empty vectors.
 * 3. Recursively splits the index range `[0, n)` into left `[start, mid)` and right
 *    `[mid, end)` halves (balanced binary splitting), multiplies corresponding elements
 *    at the leaves, and adds partial sums in lowest terms on the way back up.
 *
 * Balanced divide-and-conquer summation keeps intermediate denominators balanced
 * compared to linear accumulation while preserving exact BigInt rational arithmetic.
 *
 * @param {ReadonlyArray<Rational>} vecA - First vector of exact rationals.
 * @param {ReadonlyArray<Rational>} vecB - Second vector of exact rationals.
 * @returns {Rational} The exact dot product in lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`).
 * @throws {TypeError} If either argument is not an array or any element is not a valid `{ num: bigint, den: bigint }` object.
 * @throws {RangeError} If the two vectors have different lengths or any element has `den === 0n`.
 */
export function dotProductRationalRecursive(vecA, vecB) {
	if (!Array.isArray(vecA) || !Array.isArray(vecB)) {
		throw new TypeError('Both vecA and vecB must be arrays of rational objects');
	}
	if (vecA.length !== vecB.length) {
		throw new RangeError(
			`Vectors must have equal length (received ${vecA.length} and ${vecB.length})`,
		);
	}

	const n = vecA.length;
	const normA = new Array(n);
	const normB = new Array(n);
	for (let i = 0; i < n; i++) {
		if (!(i in vecA)) {
			throw new TypeError(`vecA[${i}] must be a rational object { num: bigint, den: bigint }`);
		}
		if (!(i in vecB)) {
			throw new TypeError(`vecB[${i}] must be a rational object { num: bigint, den: bigint }`);
		}
		normA[i] = validateRational(vecA[i], `vecA[${i}]`);
		normB[i] = validateRational(vecB[i], `vecB[${i}]`);
	}

	if (n === 0) {
		return { num: 0n, den: 1n };
	}

	return dotRangeRecursive(normA, normB, 0, n);
}
