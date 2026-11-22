/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * An exact rational number represented in lowest terms with `den > 0n`,
 * `gcd(|num|, den) === 1n`, and zero represented as `{ num: 0n, den: 1n }`.
 */

/**
 * Computes the non-negative greatest common divisor of two BigInts using the
 * recursive Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigIntRecursive(a, b) {
	const x = a < 0n ? -a : a;
	const y = b < 0n ? -b : b;
	if (y === 0n) {
		return x;
	}
	return gcdBigIntRecursive(y, x % y);
}

/**
 * Normalizes a rational number `(num, den)` into canonical lowest terms with
 * `den > 0n`, `gcd(|num|, den) === 1n`, and zero as `{ num: 0n, den: 1n }`.
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
	const g = gcdBigIntRecursive(n, d);
	return { num: n / g, den: d / g };
}

/**
 * Negates a normalized rational number, returning a fresh Rational object.
 *
 * @param {Rational} r
 * @returns {Rational}
 */
function negRational(r) {
	if (r.num === 0n) {
		return { num: 0n, den: 1n };
	}
	return { num: -r.num, den: r.den };
}

/**
 * Multiplies two normalized rational numbers in lowest terms using cross-cancellation.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function mulRational(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n };
	}
	const g1 = gcdBigIntRecursive(a.num, b.den);
	const g2 = gcdBigIntRecursive(b.num, a.den);
	return {
		num: (a.num / g1) * (b.num / g2),
		den: (a.den / g2) * (b.den / g1),
	};
}

/**
 * Adds two normalized rational numbers, returning a canonical lowest-terms Rational.
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
	const g = gcdBigIntRecursive(a.den, b.den);
	const aDenReduced = a.den / g;
	const bDenReduced = b.den / g;
	const num = a.num * bDenReduced + b.num * aDenReduced;
	const den = aDenReduced * b.den;
	return normalizeRational(num, den);
}

/**
 * Validates and normalizes a single rational input component.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 * @throws {TypeError} If `value` is not a rational object with BigInt `num` and `den`.
 * @throws {RangeError} If `value.den === 0n`.
 */
function validateRational(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be an object with BigInt num and den properties`);
	}
	const { num, den } = value;
	if (typeof num !== 'bigint') {
		throw new TypeError(`${label}.num must be a BigInt`);
	}
	if (typeof den !== 'bigint') {
		throw new TypeError(`${label}.den must be a BigInt`);
	}
	if (den === 0n) {
		throw new RangeError(`${label}.den must not be 0n`);
	}
	return normalizeRational(num, den);
}

/**
 * Recursively validates and normalizes the elements of a 3D rational vector
 * over index range `[lo, hi)`.
 *
 * @param {unknown[]} vec
 * @param {string} name
 * @param {number} lo
 * @param {number} hi
 * @returns {Rational[]}
 */
function validateComponentsRecursive(vec, name, lo, hi) {
	if (hi - lo === 1) {
		if (!(lo in vec)) {
			throw new TypeError(`${name}[${lo}] must be a rational object, not an empty slot`);
		}
		return [validateRational(vec[lo], `${name}[${lo}]`)];
	}
	const mid = (lo + hi) >> 1;
	const left = validateComponentsRecursive(vec, name, lo, mid);
	const right = validateComponentsRecursive(vec, name, mid, hi);
	return [...left, ...right];
}

/**
 * Validates that `vec` is a dense 3-element array of valid exact rationals
 * and returns a normalized copy.
 *
 * @param {unknown} vec
 * @param {string} name
 * @returns {Rational[]}
 * @throws {TypeError} If `vec` is not an Array or contains invalid rational elements.
 * @throws {RangeError} If `vec.length !== 3` or any component has `den === 0n`.
 */
function validateVector3D(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an Array of length 3`);
	}
	if (vec.length !== 3) {
		throw new RangeError(`${name} must have length 3, received length ${vec.length}`);
	}
	return validateComponentsRecursive(vec, name, 0, 3);
}

/**
 * Recursively builds a row excluding column index `skipCol` over `[lo, hi)`.
 *
 * @param {Rational[]} row
 * @param {number} skipCol
 * @param {number} lo
 * @param {number} hi
 * @returns {Rational[]}
 */
function omitColumnRecursive(row, skipCol, lo, hi) {
	if (lo >= hi) {
		return [];
	}
	if (hi - lo === 1) {
		return lo === skipCol ? [] : [row[lo]];
	}
	const mid = (lo + hi) >> 1;
	return [
		...omitColumnRecursive(row, skipCol, lo, mid),
		...omitColumnRecursive(row, skipCol, mid, hi),
	];
}

/**
 * Recursively builds the minor submatrix obtained by omitting rows before `startRow`
 * and omitting column `skipCol`, over row range `[lo, hi)`.
 *
 * @param {Rational[][]} rows
 * @param {number} skipCol
 * @param {number} lo
 * @param {number} hi
 * @returns {Rational[][]}
 */
function buildMinorRecursive(rows, skipCol, lo, hi) {
	if (lo >= hi) {
		return [];
	}
	if (hi - lo === 1) {
		return [omitColumnRecursive(rows[lo], skipCol, 0, rows[lo].length)];
	}
	const mid = (lo + hi) >> 1;
	return [
		...buildMinorRecursive(rows, skipCol, lo, mid),
		...buildMinorRecursive(rows, skipCol, mid, hi),
	];
}

/**
 * Recursively sums the Laplace cofactor expansion terms of an `n x n` rational
 * matrix along row 0 over column range `[lo, hi)` using divide-and-conquer.
 *
 * @param {Rational[][]} matrix
 * @param {number} lo
 * @param {number} hi
 * @returns {Rational}
 */
function sumCofactorsRecursive(matrix, lo, hi) {
	if (hi - lo === 1) {
		const entry = matrix[0][lo];
		if (entry.num === 0n) {
			return { num: 0n, den: 1n };
		}
		const minor = buildMinorRecursive(matrix, lo, 1, matrix.length);
		const minorDet = detRationalRecursive(minor);
		const term = mulRational(entry, minorDet);
		return lo % 2 === 0 ? term : negRational(term);
	}
	const mid = (lo + hi) >> 1;
	const left = sumCofactorsRecursive(matrix, lo, mid);
	const right = sumCofactorsRecursive(matrix, mid, hi);
	return addRational(left, right);
}

/**
 * Computes the exact determinant of an `n x n` matrix of normalized rationals
 * using recursive Laplace cofactor expansion.
 *
 * @param {Rational[][]} matrix
 * @returns {Rational}
 */
function detRationalRecursive(matrix) {
	const n = matrix.length;
	if (n === 0) {
		return { num: 1n, den: 1n };
	}
	if (n === 1) {
		return { num: matrix[0][0].num, den: matrix[0][0].den };
	}
	return sumCofactorsRecursive(matrix, 0, n);
}

/**
 * Recursively computes the components of the 3D cross product `u x v` over
 * component index range `[lo, hi)` by evaluating each formal determinant cofactor
 * `(-1)^k * det(M_{0,k})`.
 *
 * @param {Rational[][]} rows - The 2x3 matrix `[u, v]` of normalized rationals.
 * @param {number} lo
 * @param {number} hi
 * @returns {Rational[]}
 */
function crossComponentsRecursive(rows, lo, hi) {
	if (hi - lo === 1) {
		const minor = buildMinorRecursive(rows, lo, 0, rows.length);
		const minorDet = detRationalRecursive(minor);
		const component = lo % 2 === 0 ? minorDet : negRational(minorDet);
		return [component];
	}
	const mid = (lo + hi) >> 1;
	const left = crossComponentsRecursive(rows, lo, mid);
	const right = crossComponentsRecursive(rows, mid, hi);
	return [...left, ...right];
}

/**
 * Computes the exact 3D cross product `a x b` of two 3-dimensional rational vectors.
 *
 * Algorithm:
 * Treats the 3D cross product as the formal Laplace cofactor expansion of the
 * 3x3 determinant whose first row is the standard basis `(e_0, e_1, e_2)` and
 * whose remaining rows are `a` and `b`. A divide-and-conquer recursion splits
 * the output component indices `[0, 3)` down to single components, constructing
 * each 2x2 minor submatrix recursively and evaluating its determinant via
 * recursive Laplace cofactor expansion (`detRationalRecursive`) down to 1x1
 * base cases. All rational operations use exact BigInt arithmetic with recursive
 * Euclidean GCD reduction so every output component is in canonical lowest terms.
 *
 * @param {[Rational, Rational, Rational]} a - First 3D vector of exact rationals `{ num: bigint, den: bigint }`.
 * @param {[Rational, Rational, Rational]} b - Second 3D vector of exact rationals `{ num: bigint, den: bigint }`.
 * @returns {[Rational, Rational, Rational]} Exact 3D cross product `a x b` with every component in lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`, zero as `{ num: 0n, den: 1n }`).
 * @throws {TypeError} If `a` or `b` is not an Array, has sparse/missing elements, or contains an element that is not a valid `{ num: bigint, den: bigint }` object.
 * @throws {RangeError} If `a` or `b` does not have length 3, or if any component has `den === 0n`.
 */
export function crossProductRationalRecursive(a, b) {
	const u = validateVector3D(a, 'a');
	const v = validateVector3D(b, 'b');
	return crossComponentsRecursive([u, v], 0, 3);
}
