/**
 * Computes the exact factorial of a non-negative integer represented as an exact
 * rational `{ num: BigInt, den: BigInt }`, returning the result as an exact
 * rational in lowest terms (`{ num: BigInt, den: 1n }`), using a straightforward
 * iterative loop.
 *
 * Accepts unreduced rationals and negative denominators as long as the reduced
 * value is a non-negative integer (e.g. `{ num: 10n, den: 2n }` or
 * `{ num: -6n, den: -2n }`).
 *
 * @param {{ num: bigint, den: bigint }} q - Exact rational representing a non-negative integer.
 * @returns {{ num: bigint, den: bigint }} Exact factorial in lowest terms (`den === 1n`).
 * @throws {TypeError} If `q` is not an object with `bigint` properties `num` and `den`.
 * @throws {RangeError} If `q.den === 0n`, `q` is negative, or `q` does not represent an integer.
 */
export function factorialRationalIterative(q) {
	if (q === null || typeof q !== 'object' || typeof q.num !== 'bigint' || typeof q.den !== 'bigint') {
		throw new TypeError('Input must be an exact rational object { num: BigInt, den: BigInt }');
	}

	let { num, den } = q;

	if (den === 0n) {
		throw new RangeError('Rational denominator must not be zero');
	}

	if (den < 0n) {
		num = -num;
		den = -den;
	}

	if (num < 0n) {
		throw new RangeError('Factorial is undefined for negative rationals');
	}

	if (num % den !== 0n) {
		throw new RangeError('Discrete factorial requires a rational representing an integer');
	}

	const n = num / den;
	let result = 1n;

	for (let i = 2n; i <= n; i += 1n) {
		result *= i;
	}

	return { num: result, den: 1n };
}
