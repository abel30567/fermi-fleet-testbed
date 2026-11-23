/**
 * @typedef {Object} Rational
 * @property {bigint} num - Numerator of the exact rational number.
 * @property {bigint} den - Non-zero denominator of the exact rational number.
 */

/**
 * Computes the greatest common divisor of two BigInt values using the
 * iterative Euclidean algorithm. Always returns a non-negative BigInt.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const rem = x % y;
		x = y;
		y = rem;
	}
	return x;
}

/**
 * Computes the exact discrete summation over an iterable of rational numbers
 * `{ num: bigint, den: bigint }`, returning the result reduced to lowest terms
 * with a strictly positive denominator (`den > 0n`), using a straightforward
 * iterative accumulation algorithm.
 *
 * For an empty iterable, returns `{ num: 0n, den: 1n }`.
 * Zero results are canonically represented as `{ num: 0n, den: 1n }`.
 *
 * @param {Iterable<Rational>} terms - Array or iterable of exact rationals `{ num: bigint, den: bigint }`.
 * @returns {Rational} Exact sum in lowest terms with `den > 0n`.
 * @throws {TypeError} If `terms` is not an iterable object or any element lacks BigInt `num`/`den`.
 * @throws {RangeError} If any element has a zero denominator (`den === 0n`).
 */
export function summationRationalIterative(terms) {
	if (
		terms === null ||
		typeof terms !== 'object' ||
		typeof terms[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('terms must be an iterable object of { num: bigint, den: bigint }');
	}

	let accNum = 0n;
	let accDen = 1n;
	let index = 0;

	for (const term of terms) {
		if (term === null || typeof term !== 'object') {
			throw new TypeError(`term at index ${index} must be a non-null object`);
		}
		if (typeof term.num !== 'bigint') {
			throw new TypeError(`term.num at index ${index} must be a bigint`);
		}
		if (typeof term.den !== 'bigint') {
			throw new TypeError(`term.den at index ${index} must be a bigint`);
		}
		if (term.den === 0n) {
			throw new RangeError(`term.den at index ${index} must not be 0n`);
		}

		let n = term.num;
		let d = term.den;

		if (d < 0n) {
			n = -n;
			d = -d;
		}

		if (n !== 0n) {
			const gTerm = gcd(n, d);
			n /= gTerm;
			d /= gTerm;

			const gDen = gcd(accDen, d);
			const nextNum = accNum * (d / gDen) + n * (accDen / gDen);

			if (nextNum === 0n) {
				accNum = 0n;
				accDen = 1n;
			} else {
				const nextDen = (accDen / gDen) * d;
				const gRes = gcd(nextNum, nextDen);
				accNum = nextNum / gRes;
				accDen = nextDen / gRes;
			}
		}

		index += 1;
	}

	return { num: accNum, den: accDen };
}
