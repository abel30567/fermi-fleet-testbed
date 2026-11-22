/**
 * Computes the absolute value of a BigInt.
 *
 * @param {bigint} value - Integer value.
 * @returns {bigint} Non-negative magnitude of `value`.
 */
function absBigInt(value) {
	return value < 0n ? -value : value;
}

/**
 * Computes the greatest common divisor of two BigInts using the iterative
 * Euclidean algorithm.
 *
 * @param {bigint} a - First integer.
 * @param {bigint} b - Second integer.
 * @returns {bigint} Non-negative greatest common divisor of `a` and `b`.
 */
function gcd(a, b) {
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
 * Validates and normalizes a rational operand `{ num: bigint, den: bigint }`
 * into canonical lowest terms with `den > 0n` and `0n/1n` for zero.
 *
 * @param {unknown} value - Candidate rational object.
 * @param {string} name - Parameter name for error messages.
 * @returns {{ num: bigint, den: bigint }} Normalized rational in lowest terms.
 * @throws {TypeError} If `value` is not an object with `bigint` `num` and `den` properties.
 * @throws {RangeError} If `den` is `0n`.
 */
function normalizeRational(value, name) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${name} must be an object with { num: bigint, den: bigint }`);
	}

	const { num, den } = value;

	if (typeof num !== 'bigint') {
		throw new TypeError(`${name}.num must be a bigint`);
	}
	if (typeof den !== 'bigint') {
		throw new TypeError(`${name}.den must be a bigint`);
	}
	if (den === 0n) {
		throw new RangeError(`${name}.den must not be 0n`);
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

	const divisor = gcd(n, d);
	return {
		num: n / divisor,
		den: d / divisor,
	};
}

/**
 * Adds two exact rational numbers represented as `{ num: bigint, den: bigint }`
 * and returns their exact sum in canonical lowest terms (`den > 0n`,
 * `gcd(|num|, den) === 1n`, and `{ num: 0n, den: 1n }` for zero).
 *
 * Algorithm:
 * 1. Validate and normalize each operand `(n1, d1)` and `(n2, d2)` so denominators
 *    are positive and each fraction is reduced.
 * 2. Apply the closed-form LCM / GCD-reduced addition identity:
 *    - `g = gcd(d1, d2)`
 *    - `num = n1 * (d2 / g) + n2 * (d1 / g)`
 *    - `den = (d1 / g) * d2`
 * 3. Reduce `{ num, den }` by `gcd(|num|, den)`, returning `{ num: 0n, den: 1n }`
 *    when `num === 0n`.
 *
 * @param {{ num: bigint, den: bigint }} a - First rational addend (`den !== 0n`).
 * @param {{ num: bigint, den: bigint }} b - Second rational addend (`den !== 0n`).
 * @returns {{ num: bigint, den: bigint }} Exact sum in canonical lowest terms.
 * @throws {TypeError} If `a` or `b` is not an object with `bigint` `num` and `den` fields.
 * @throws {RangeError} If `a.den === 0n` or `b.den === 0n`.
 */
export function addRationalSeries(a, b) {
	const r1 = normalizeRational(a, 'a');
	const r2 = normalizeRational(b, 'b');

	const g = gcd(r1.den, r2.den);
	const d1OverG = r1.den / g;
	const d2OverG = r2.den / g;

	const num = r1.num * d2OverG + r2.num * d1OverG;
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}

	const den = d1OverG * r2.den;
	const common = gcd(absBigInt(num), den);

	return {
		num: num / common,
		den: den / common,
	};
}
