/**
 * Discrete modulo over exact rational numbers using a recursive divide-and-conquer algorithm.
 *
 * Rationals are represented as `{ num: BigInt, den: BigInt }` objects. Results are
 * always returned in lowest terms with a strictly positive denominator (`den > 0n`),
 * and zero is represented canonically as `{ num: 0n, den: 1n }`.
 *
 * Uses floored (discrete) modulo semantics:
 *   `a mod b = a - floor(a / b) * b`
 * so the result satisfies `0 <= r < b` when `b > 0`, and `b < r <= 0` when `b < 0`.
 *
 * @module ops/discrete/moduloRationalRecursive
 */

/**
 * Returns the absolute value of a BigInt.
 *
 * @param {bigint} x
 * @returns {bigint}
 */
function absBigInt(x) {
	return x < 0n ? -x : x;
}

/**
 * Computes the bit length of a positive BigInt (`x > 0n`).
 *
 * @param {bigint} x
 * @returns {number}
 */
function bitLength(x) {
	const hex = x.toString(16);
	const leadingBits = 32 - Math.clz32(parseInt(hex[0], 16));
	return (hex.length - 1) * 4 + leadingBits;
}

/**
 * Recursive divide-and-conquer non-negative integer modulo (`n mod d`)
 * for `n >= 0n` and `d > 0n`, without using built-in division or remainder.
 *
 * Splits `n` at half the excess bit-length above `d`:
 *   `n = (n_hi << k) + n_lo`
 * computes `r_hi = n_hi mod d` recursively, recombines `(r_hi << k) + n_lo`,
 * and reduces recursively. Because the excess bit-length halves at each level,
 * recursion depth is `O(log(bitLength(n) - bitLength(d)))`.
 *
 * @param {bigint} n Non-negative dividend (`n >= 0n`).
 * @param {bigint} d Positive divisor (`d > 0n`).
 * @returns {bigint} Remainder `r` with `0n <= r < d`.
 */
function modNonNegativeRecursive(n, d) {
	if (n < d) {
		return n;
	}

	const diff = bitLength(n) - bitLength(d);
	if (diff <= 1) {
		// Since bitLength(n) <= bitLength(d) + 1, we are guaranteed n < 4 * d.
		let r = n;
		const d2 = d << 1n;
		if (r >= d2) {
			r -= d2;
		}
		if (r >= d) {
			r -= d;
		}
		return r;
	}

	const k = BigInt(diff >> 1);
	const mask = (1n << k) - 1n;
	const hi = n >> k;
	const lo = n & mask;

	const hiRem = modNonNegativeRecursive(hi, d);
	const combined = (hiRem << k) + lo;
	return modNonNegativeRecursive(combined, d);
}

/**
 * Recursive Euclidean greatest common divisor for non-negative BigInts.
 *
 * @param {bigint} a Non-negative integer.
 * @param {bigint} b Non-negative integer.
 * @returns {bigint} Greatest common divisor `gcd(a, b) >= 0n`.
 */
function gcdRecursive(a, b) {
	if (b === 0n) {
		return a;
	}
	return gcdRecursive(b, modNonNegativeRecursive(a, b));
}

/**
 * Validates that a value is a well-formed rational object `{ num: bigint, den: bigint }`
 * with `den !== 0n`.
 *
 * @param {unknown} value
 * @param {string} name Parameter name for error messages.
 * @returns {{ num: bigint, den: bigint }}
 */
function validateRational(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be an object with BigInt num and den properties`);
	}
	const { num, den } = value;
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${name}.num and ${name}.den must both be BigInt values`);
	}
	if (den === 0n) {
		throw new RangeError(`${name}.den must not be 0n`);
	}
	return { num, den };
}

/**
 * Normalizes a rational `{ num, den }` (`den !== 0n`) into lowest terms with `den > 0n`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
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
	const g = gcdRecursive(absBigInt(n), d);
	return { num: n / g, den: d / g };
}

/**
 * Computes the discrete (floored) modulo `a mod b` of two exact rationals
 * using a recursive divide-and-conquer reduction algorithm.
 *
 * Given `a = p / q` and `b = r / s` (`b !== 0`), computes the unique rational
 * `rem = a - floor(a / b) * b` reduced to lowest terms with `rem.den > 0n`.
 *
 * @param {{ num: bigint, den: bigint }} a Dividend rational.
 * @param {{ num: bigint, den: bigint }} b Non-zero divisor (modulus) rational.
 * @returns {{ num: bigint, den: bigint }} Exact remainder `{ num, den }` in lowest terms with `den > 0n`.
 * @throws {TypeError} If `a` or `b` is not a `{ num: bigint, den: bigint }` object.
 * @throws {RangeError} If `a.den === 0n`, `b.den === 0n`, or `b.num === 0n`.
 */
export function moduloRationalRecursive(a, b) {
	const rawA = validateRational(a, 'a');
	const rawB = validateRational(b, 'b');

	if (rawB.num === 0n) {
		throw new RangeError('Modulo by zero: b.num must not be 0n');
	}

	const normA = normalizeRational(rawA.num, rawA.den);
	const normB = normalizeRational(rawB.num, rawB.den);

	if (normA.num === 0n) {
		return { num: 0n, den: 1n };
	}

	// Express a = A / D and b = B / D over the common positive denominator D = normA.den * normB.den.
	const commonDen = normA.den * normB.den;
	const scaledA = normA.num * normB.den;
	const scaledB = normB.num * normA.den;

	const absA = absBigInt(scaledA);
	const absB = absBigInt(scaledB);
	const unsignedRem = modNonNegativeRecursive(absA, absB);

	if (unsignedRem === 0n) {
		return { num: 0n, den: 1n };
	}

	let signedRem;
	const sameSign = (scaledA < 0n) === (scaledB < 0n);
	if (sameSign) {
		signedRem = scaledB < 0n ? -unsignedRem : unsignedRem;
	} else {
		signedRem = scaledB < 0n ? unsignedRem + scaledB : scaledB - unsignedRem;
	}

	return normalizeRational(signedRem, commonDen);
}
