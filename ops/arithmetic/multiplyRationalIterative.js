/**
 * @typedef {Object} Rational
 * @property {bigint} num - Numerator of the exact rational number.
 * @property {bigint} den - Non-zero denominator of the exact rational number.
 */

/**
 * Computes the greatest common divisor of two BigInt values using an
 * iterative Euclidean algorithm.
 *
 * @param {bigint} x - First integer.
 * @param {bigint} y - Second integer.
 * @returns {bigint} Non-negative greatest common divisor of `x` and `y`.
 */
function gcdIterative(x, y) {
	let a = x < 0n ? -x : x;
	let b = y < 0n ? -y : y;
	while (b !== 0n) {
		const remainder = a % b;
		a = b;
		b = remainder;
	}
	return a;
}

/**
 * Validates that a value is a well-formed rational object `{ num: bigint, den: bigint }`
 * with a non-zero denominator.
 *
 * @param {unknown} value - Candidate rational value.
 * @param {string} name - Parameter name for descriptive error messages.
 * @returns {Rational} The validated rational object.
 * @throws {TypeError} If `value` is not an object or `num`/`den` are not BigInts.
 * @throws {RangeError} If `value.den` is `0n`.
 */
function validateRational(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be an object with BigInt properties { num, den }`);
	}
	const { num, den } = value;
	if (typeof num !== 'bigint') {
		throw new TypeError(`${name}.num must be a BigInt`);
	}
	if (typeof den !== 'bigint') {
		throw new TypeError(`${name}.den must be a BigInt`);
	}
	if (den === 0n) {
		throw new RangeError(`${name}.den must not be 0n`);
	}
	return { num, den };
}

/**
 * Multiplies two exact rational numbers `{ num: bigint, den: bigint }` and
 * returns the product in canonical lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`,
 * and `{ num: 0n, den: 1n }` for zero) using a straightforward iterative implementation.
 *
 * @param {Rational} a - First rational operand.
 * @param {Rational} b - Second rational operand.
 * @returns {Rational} Product of `a` and `b` reduced to canonical lowest terms.
 * @throws {TypeError} If `a` or `b` is not a valid `{ num: bigint, den: bigint }` object.
 * @throws {RangeError} If either operand has a zero denominator (`den === 0n`).
 */
export function multiplyRationalIterative(a, b) {
	const left = validateRational(a, 'a');
	const right = validateRational(b, 'b');

	if (left.num === 0n || right.num === 0n) {
		return { num: 0n, den: 1n };
	}

	let aNum = left.den < 0n ? -left.num : left.num;
	let aDen = left.den < 0n ? -left.den : left.den;
	let bNum = right.den < 0n ? -right.num : right.num;
	let bDen = right.den < 0n ? -right.den : right.den;

	// Reduce each operand and cross-cancel iteratively to keep intermediates compact.
	const gLeft = gcdIterative(aNum, aDen);
	aNum /= gLeft;
	aDen /= gLeft;

	const gRight = gcdIterative(bNum, bDen);
	bNum /= gRight;
	bDen /= gRight;

	const gCross1 = gcdIterative(aNum, bDen);
	aNum /= gCross1;
	bDen /= gCross1;

	const gCross2 = gcdIterative(bNum, aDen);
	bNum /= gCross2;
	aDen /= gCross2;

	return {
		num: aNum * bNum,
		den: aDen * bDen,
	};
}
