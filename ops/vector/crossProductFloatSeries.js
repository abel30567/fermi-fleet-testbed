/**
 * Error-free product and 2x2 determinant helpers using Dekker/Veltkamp splitting
 * and Knuth's TwoSum, minimizing catastrophic cancellation in IEEE-754 float64.
 */

const SPLITTER = 134217729; // 2^27 + 1
const SPLIT_MAX = 2 ** 995;
const SPLIT_MIN = 2 ** -969;
const OVERFLOW_GUARD = 2 ** 500;
const SCALE_DOWN = 2 ** -520;
const SCALE_UP = 2 ** 520;

/**
 * Splits an IEEE-754 float64 number into high and low 26-bit parts: x = hi + lo.
 *
 * @param {number} x - Finite number with |x| <= 2^995.
 * @returns {[number, number]} Exact pair [hi, lo].
 */
function split(x) {
	const c = SPLITTER * x;
	const hi = c - (c - x);
	const lo = x - hi;
	return [hi, lo];
}

/**
 * Error-free transformation for float64 multiplication: a * b = p + err.
 * Falls back to [a * b, 0] if operands or product lie outside Veltkamp's exact range.
 *
 * @param {number} a - First finite factor.
 * @param {number} b - Second finite factor.
 * @returns {[number, number]} Pair [product, roundingError].
 */
function twoProd(a, b) {
	const p = a * b;
	if (p === 0 || !Number.isFinite(p)) {
		return [p, 0];
	}
	const absA = Math.abs(a);
	const absB = Math.abs(b);
	const absP = Math.abs(p);
	if (
		absA > SPLIT_MAX ||
		absB > SPLIT_MAX ||
		absA < SPLIT_MIN ||
		absB < SPLIT_MIN ||
		absP < SPLIT_MIN
	) {
		return [p, 0];
	}
	const [aHi, aLo] = split(a);
	const [bHi, bLo] = split(b);
	const err = ((aHi * bHi - p) + aHi * bLo + aLo * bHi) + aLo * bLo;
	return [p, err];
}

/**
 * Knuth's error-free transformation for float64 addition: a + b = s + err.
 *
 * @param {number} a - First finite addend.
 * @param {number} b - Second finite addend.
 * @returns {[number, number]} Pair [sum, roundingError].
 */
function twoSum(a, b) {
	const s = a + b;
	const v = s - a;
	const err = (a - (s - v)) + (b - v);
	return [s, err];
}

/**
 * Computes the 2x2 determinant (u1 * v2 - u2 * v1) with compensated float64 arithmetic
 * and power-of-two rescaling to prevent spurious intermediate overflow.
 *
 * @param {number} u1
 * @param {number} u2
 * @param {number} v1
 * @param {number} v2
 * @returns {number}
 */
function det2(u1, u2, v1, v2) {
	let a1 = u1;
	let a2 = u2;
	let b1 = v1;
	let b2 = v2;
	let scaleCount = 0;

	if (!Number.isFinite(a1 * b2) || !Number.isFinite(a2 * b1)) {
		if (Math.max(Math.abs(a1), Math.abs(a2)) > OVERFLOW_GUARD) {
			a1 *= SCALE_DOWN;
			a2 *= SCALE_DOWN;
			scaleCount += 1;
		}
		if (Math.max(Math.abs(b1), Math.abs(b2)) > OVERFLOW_GUARD) {
			b1 *= SCALE_DOWN;
			b2 *= SCALE_DOWN;
			scaleCount += 1;
		}
	}

	const [p1, e1] = twoProd(a1, b2);
	const [p2, e2] = twoProd(a2, b1);
	const [s, ds] = twoSum(p1, -p2);
	let result = s + (ds + (e1 - e2));

	while (scaleCount > 0) {
		result *= SCALE_UP;
		scaleCount -= 1;
	}

	return result === 0 ? 0 : result;
}

/**
 * Validates that an input is a 3-element array of finite IEEE-754 float64 numbers.
 *
 * @param {unknown} v - Candidate 3D vector.
 * @param {string} label - Parameter label for error messages.
 */
function validateVector3(v, label) {
	if (!Array.isArray(v)) {
		throw new TypeError(`${label} must be an array of 3 finite numbers`);
	}
	if (v.length !== 3) {
		throw new RangeError(`${label} must have length 3, received length ${v.length}`);
	}
	for (let i = 0; i < 3; i += 1) {
		const elem = v[i];
		if (typeof elem !== 'number') {
			throw new TypeError(`${label}[${i}] must be a number`);
		}
		if (!Number.isFinite(elem)) {
			throw new RangeError(`${label}[${i}] must be a finite number`);
		}
	}
}

/**
 * Computes the 3D vector cross product `a × b` over IEEE-754 float64 numbers using the
 * closed-form Levi-Civita / cofactor determinant expansion:
 *
 *   (a × b)_i = Σ_{j,k} ε_{ijk} a_j b_k
 *             = [a1*b2 - a2*b1, a2*b0 - a0*b2, a0*b1 - a1*b0]
 *
 * Each 2x2 determinant uses Dekker/Veltkamp error-free multiplication and Knuth TwoSum
 * compensation to suppress catastrophic cancellation on nearly parallel vectors, with
 * power-of-two rescaling to avoid spurious intermediate overflow.
 *
 * @param {readonly [number, number, number]} a - First 3D vector of finite float64 numbers.
 * @param {readonly [number, number, number]} b - Second 3D vector of finite float64 numbers.
 * @returns {[number, number, number]} The 3D cross product vector `a × b`.
 * @throws {TypeError} If either argument is not an array or contains a non-number element.
 * @throws {RangeError} If either argument does not have length 3 or contains NaN/Infinity.
 */
export function crossProductFloatSeries(a, b) {
	validateVector3(a, 'a');
	validateVector3(b, 'b');

	const [a0, a1, a2] = a;
	const [b0, b1, b2] = b;

	return [
		det2(a1, a2, b1, b2),
		det2(a2, a0, b2, b0),
		det2(a0, a1, b0, b1),
	];
}
