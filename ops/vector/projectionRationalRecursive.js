/**
 * Computes the exact orthogonal vector projection of vector `u` onto vector `v`
 * over exact BigInt rationals:
 *
 *   proj_v(u) = ((u · v) / (v · v)) * v
 *
 * Algorithm:
 * 1. Recursively validates and normalizes both input vectors via divide-and-conquer
 *    halving into lowest-terms rationals `{ num: bigint, den: bigint }` with `den > 0n`.
 * 2. Computes the exact dot products `u · v` and `v · v` using recursive
 *    divide-and-conquer halving, which balances intermediate denominator growth
 *    in `O(log n)` recursion depth.
 * 3. Verifies `v · v !== 0` (i.e. `v` is not the zero vector) and computes the exact
 *    scalar factor `c = (u · v) / (v · v)`.
 * 4. Computes the scaled vector `c * v` using recursive divide-and-conquer halving,
 *    returning a new array of lowest-terms rationals.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 *
 * @param {Rational[]} u - Non-empty vector of exact rationals to project.
 * @param {Rational[]} v - Non-empty non-zero target vector of exact rationals (same length as `u`).
 * @returns {Rational[]} Exact orthogonal projection `proj_v(u)` with every component in lowest terms
 *   (`den > 0n`, `gcd(|num|, den) === 1n`, and zero represented as `{ num: 0n, den: 1n }`).
 * @throws {TypeError} If `u` or `v` is not an array, or any element is not a `{ num: bigint, den: bigint }` object.
 * @throws {RangeError} If `u` or `v` is empty, their lengths differ, any denominator is `0n`,
 *   or `v` is the zero vector.
 */
export function projectionRationalRecursive(u, v) {
	if (!Array.isArray(u)) {
		throw new TypeError('First argument u must be an array of rationals');
	}
	if (!Array.isArray(v)) {
		throw new TypeError('Second argument v must be an array of rationals');
	}
	if (u.length === 0 || v.length === 0) {
		throw new RangeError('Input vectors u and v must be non-empty');
	}
	if (u.length !== v.length) {
		throw new RangeError(
			`Vector length mismatch: u has length ${u.length}, v has length ${v.length}`,
		);
	}

	const n = u.length;
	const normU = new Array(n);
	const normV = new Array(n);
	normalizeVectorRecursive(u, normU, 0, n, 'u');
	normalizeVectorRecursive(v, normV, 0, n, 'v');

	const vDotV = dotProductRecursive(normV, normV, 0, n);
	if (vDotV.num === 0n) {
		throw new RangeError('Cannot project onto the zero vector');
	}

	const uDotV = dotProductRecursive(normU, normV, 0, n);
	const scalar = divRational(uDotV, vDotV);

	const result = new Array(n);
	scaleVectorRecursive(scalar, normV, result, 0, n);
	return result;
}

/**
 * Returns the absolute value of a BigInt.
 * @param {bigint} value
 * @returns {bigint}
 */
function absBigInt(value) {
	return value < 0n ? -value : value;
}

/**
 * Computes the non-negative greatest common divisor of two BigInts.
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
 * Constructs a lowest-terms rational with `den > 0n` and zero as `{ num: 0n, den: 1n }`.
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function makeRational(num, den) {
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
 * Validates and normalizes a single rational object.
 * @param {unknown} item
 * @param {string} vectorName
 * @param {number} index
 * @returns {Rational}
 */
function validateAndNormalizeRational(item, vectorName, index) {
	if (item === null || typeof item !== 'object') {
		throw new TypeError(
			`Element ${vectorName}[${index}] must be an object with bigint num and den properties`,
		);
	}
	const { num, den } = item;
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(
			`Element ${vectorName}[${index}] must have bigint num and den properties`,
		);
	}
	if (den === 0n) {
		throw new RangeError(`Element ${vectorName}[${index}] has zero denominator`);
	}
	return makeRational(num, den);
}

/**
 * Recursively validates and normalizes `vec[start..end)` into `out[start..end)`.
 * @param {unknown[]} vec
 * @param {Rational[]} out
 * @param {number} start
 * @param {number} end
 * @param {string} vectorName
 */
function normalizeVectorRecursive(vec, out, start, end, vectorName) {
	if (end - start === 1) {
		out[start] = validateAndNormalizeRational(vec[start], vectorName, start);
		return;
	}
	const mid = start + ((end - start) >> 1);
	normalizeVectorRecursive(vec, out, start, mid, vectorName);
	normalizeVectorRecursive(vec, out, mid, end, vectorName);
}

/**
 * Adds two normalized rationals and returns the lowest-terms sum.
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
	const aDenReduced = a.den / g;
	const bDenReduced = b.den / g;
	return makeRational(
		a.num * bDenReduced + b.num * aDenReduced,
		aDenReduced * b.den,
	);
}

/**
 * Multiplies two normalized rationals using cross-cancellation and returns a lowest-terms product.
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function mulRational(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n };
	}
	const g1 = gcdBigInt(a.num, b.den);
	const g2 = gcdBigInt(b.num, a.den);
	return {
		num: (a.num / g1) * (b.num / g2),
		den: (a.den / g2) * (b.den / g1),
	};
}

/**
 * Divides two normalized rationals `a / b` and returns the lowest-terms quotient.
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function divRational(a, b) {
	if (b.num === 0n) {
		throw new RangeError('Division by zero');
	}
	if (a.num === 0n) {
		return { num: 0n, den: 1n };
	}
	const reciprocal =
		b.num < 0n
			? { num: -b.den, den: -b.num }
			: { num: b.den, den: b.num };
	return mulRational(a, reciprocal);
}

/**
 * Recursively computes the exact dot product of `a[start..end)` and `b[start..end)`
 * via divide-and-conquer halving.
 * @param {Rational[]} a
 * @param {Rational[]} b
 * @param {number} start
 * @param {number} end
 * @returns {Rational}
 */
function dotProductRecursive(a, b, start, end) {
	if (end - start === 1) {
		return mulRational(a[start], b[start]);
	}
	const mid = start + ((end - start) >> 1);
	const left = dotProductRecursive(a, b, start, mid);
	const right = dotProductRecursive(a, b, mid, end);
	return addRational(left, right);
}

/**
 * Recursively multiplies `vec[start..end)` by `scalar` into `out[start..end)`
 * via divide-and-conquer halving.
 * @param {Rational} scalar
 * @param {Rational[]} vec
 * @param {Rational[]} out
 * @param {number} start
 * @param {number} end
 */
function scaleVectorRecursive(scalar, vec, out, start, end) {
	if (end - start === 1) {
		out[start] = mulRational(scalar, vec[start]);
		return;
	}
	const mid = start + ((end - start) >> 1);
	scaleVectorRecursive(scalar, vec, out, start, mid);
	scaleVectorRecursive(scalar, vec, out, mid, end);
}
