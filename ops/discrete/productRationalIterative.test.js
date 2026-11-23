import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { productRationalIterative } from './productRationalIterative.js';

/**
 * Helper to compute BigInt GCD for test assertions.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
	a = a < 0n ? -a : a;
	b = b < 0n ? -b : b;
	while (b !== 0n) {
		const r = a % b;
		a = b;
		b = r;
	}
	return a;
}

/**
 * Helper to compute exact BigInt factorial.
 * @param {number} n
 * @returns {bigint}
 */
function factorial(n) {
	let result = 1n;
	for (let k = 2n; k <= BigInt(n); k += 1n) {
		result *= k;
	}
	return result;
}

/**
 * Reduces a rational to canonical lowest terms with den > 0n for independent cross-checking.
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function reduce(num, den) {
	if (den < 0n) {
		num = -num;
		den = -den;
	}
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}
	const g = gcd(num, den);
	return { num: num / g, den: den / g };
}

describe('productRationalIterative', () => {
	describe('normal cases', () => {
		it('computes product of a single rational and reduces to lowest terms', () => {
			assert.deepEqual(productRationalIterative([{ num: 3n, den: 7n }]), {
				num: 3n,
				den: 7n,
			});
			assert.deepEqual(productRationalIterative([{ num: 12n, den: 18n }]), {
				num: 2n,
				den: 3n,
			});
		});

		it('computes exact product of multiple rationals with cross-cancellation', () => {
			const input = [
				{ num: 2n, den: 3n },
				{ num: 9n, den: 10n },
				{ num: 5n, den: 6n },
			];
			assert.deepEqual(productRationalIterative(input), { num: 1n, den: 2n });
		});

		it('works with non-array iterables (generators and Sets)', () => {
			function* gen() {
				yield { num: 4n, den: 9n };
				yield { num: 3n, den: 8n };
				yield { num: 6n, den: 5n };
			}
			assert.deepEqual(productRationalIterative(gen()), { num: 1n, den: 5n });

			const set = new Set([
				{ num: 7n, den: 4n },
				{ num: 8n, den: 21n },
			]);
			assert.deepEqual(productRationalIterative(set), { num: 2n, den: 3n });
		});

		it('handles arbitrarily large BigInt numerators and denominators', () => {
			const p = 10n ** 40n + 7n;
			const q = 10n ** 40n + 9n;
			const input = [
				{ num: p * 6n, den: q * 5n },
				{ num: q * 25n, den: p * 12n },
			];
			assert.deepEqual(productRationalIterative(input), { num: 5n, den: 2n });
		});

		it('does not mutate input array or element objects', () => {
			const a = { num: -4n, den: -6n };
			const b = { num: 9n, den: -12n };
			const arr = [a, b];
			const result = productRationalIterative(arr);
			assert.deepEqual(result, { num: -1n, den: 2n });
			assert.deepEqual(a, { num: -4n, den: -6n });
			assert.deepEqual(b, { num: 9n, den: -12n });
			assert.equal(arr.length, 2);
		});
	});

	describe('edge cases', () => {
		it('returns multiplicative identity { num: 1n, den: 1n } for empty iterables', () => {
			assert.deepEqual(productRationalIterative([]), { num: 1n, den: 1n });
			assert.deepEqual(productRationalIterative(new Set()), { num: 1n, den: 1n });
			function* emptyGen() {}
			assert.deepEqual(productRationalIterative(emptyGen()), {
				num: 1n,
				den: 1n,
			});
		});

		it('returns canonical { num: 0n, den: 1n } when any element is zero', () => {
			assert.deepEqual(
				productRationalIterative([
					{ num: 0n, den: 5n },
					{ num: 3n, den: 7n },
				]),
				{ num: 0n, den: 1n }
			);
			assert.deepEqual(
				productRationalIterative([
					{ num: 2n, den: 3n },
					{ num: 0n, den: -9n },
					{ num: -5n, den: 4n },
				]),
				{ num: 0n, den: 1n }
			);
			assert.deepEqual(
				productRationalIterative([
					{ num: 7n, den: 11n },
					{ num: 0n, den: 1n },
				]),
				{ num: 0n, den: 1n }
			);
		});

		it('handles negative numerators and denominators and normalizes sign to numerator', () => {
			// Odd number of negatives -> negative result, positive denominator
			assert.deepEqual(
				productRationalIterative([
					{ num: -2n, den: 3n },
					{ num: 5n, den: 7n },
				]),
				{ num: -10n, den: 21n }
			);
			// Even number of negatives -> positive result
			assert.deepEqual(
				productRationalIterative([
					{ num: -2n, den: 3n },
					{ num: -3n, den: 4n },
				]),
				{ num: 1n, den: 2n }
			);
			// Negative denominators
			assert.deepEqual(
				productRationalIterative([
					{ num: 2n, den: -3n },
					{ num: -6n, den: -5n },
				]),
				{ num: -4n, den: 5n }
			);
			// Single element with negative denominator
			assert.deepEqual(productRationalIterative([{ num: 4n, den: -6n }]), {
				num: -2n,
				den: 3n,
			});
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-iterable or string top-level inputs', () => {
			for (const bad of [null, undefined, 42, 42n, true, {}, '', '1/2']) {
				assert.throws(
					() => productRationalIterative(bad),
					{ name: 'TypeError' },
					`Expected TypeError for input: ${String(bad)}`
				);
			}
		});

		it('throws TypeError for malformed elements or non-BigInt fields', () => {
			const invalidElements = [
				null,
				undefined,
				1,
				'1/2',
				{},
				{ num: 1n },
				{ den: 1n },
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: '1', den: '2' },
				{ num: NaN, den: 1n },
			];
			for (const elem of invalidElements) {
				assert.throws(
					() => productRationalIterative([elem]),
					{ name: 'TypeError' },
					`Expected TypeError for element: ${String(elem)}`
				);
			}
		});

		it('throws RangeError for zero denominator', () => {
			assert.throws(
				() => productRationalIterative([{ num: 1n, den: 0n }]),
				{ name: 'RangeError' }
			);
			assert.throws(
				() => productRationalIterative([{ num: 0n, den: 0n }]),
				{ name: 'RangeError' }
			);
		});

		it('still validates elements appearing after a zero factor', () => {
			assert.throws(
				() =>
					productRationalIterative([
						{ num: 0n, den: 1n },
						{ num: 3n, den: 0n },
					]),
				{ name: 'RangeError' }
			);
			assert.throws(
				() =>
					productRationalIterative([
						{ num: 0n, den: 1n },
						{ num: 1, den: 2n },
					]),
				{ name: 'TypeError' }
			);
			assert.throws(
				() => productRationalIterative([{ num: 0n, den: 1n }, null]),
				{ name: 'TypeError' }
			);
			assert.throws(
				() =>
					productRationalIterative([
						{ num: 2n, den: 5n },
						{ num: 0n, den: 3n },
						{ num: 7n, den: 11n },
						{ num: 1n, den: 0n },
					]),
				{ name: 'RangeError' }
			);
		});
	});

	describe('independent mathematical cross-checks', () => {
		it('matches telescoping product prod_{k=1}^{n} (k+1)/k = (n+1)/1', () => {
			for (const n of [1, 10, 50, 200]) {
				const factors = [];
				for (let k = 1n; k <= BigInt(n); k += 1n) {
					factors.push({ num: k + 1n, den: k });
				}
				assert.deepEqual(productRationalIterative(factors), {
					num: BigInt(n + 1),
					den: 1n,
				});
			}
		});

		it('matches exact closed-form Wallis partial products and approximates pi/2', () => {
			// W_n = prod_{k=1}^{n} (2k/(2k-1)) * (2k/(2k+1)) = 16^n * (n!)^4 / ((2n+1) * ((2n)!)^2)
			for (const n of [1, 2, 3, 10, 25]) {
				const factors = [];
				for (let k = 1n; k <= BigInt(n); k += 1n) {
					factors.push({ num: 2n * k, den: 2n * k - 1n });
					factors.push({ num: 2n * k, den: 2n * k + 1n });
				}
				const actual = productRationalIterative(factors);

				const factN = factorial(n);
				const fact2N = factorial(2 * n);
				const expectedNum = 16n ** BigInt(n) * factN ** 4n;
				const expectedDen = BigInt(2 * n + 1) * fact2N ** 2n;
				const expected = reduce(expectedNum, expectedDen);

				assert.deepEqual(actual, expected);
				assert.equal(gcd(actual.num, actual.den), 1n);
				assert.ok(actual.den > 0n);
			}

			// Numerical sanity check: 2 * W_50 approximates pi within 0.02
			const wallis50 = [];
			for (let k = 1n; k <= 50n; k += 1n) {
				wallis50.push({ num: 4n * k * k, den: 4n * k * k - 1n });
			}
			const w = productRationalIterative(wallis50);
			const scaled = Number((w.num * 2n * 10n ** 12n) / w.den) / 1e12;
			assert.ok(
				Math.abs(scaled - Math.PI) < 0.02,
				`Expected 2*W_50 (${scaled}) to approximate pi`
			);
		});

		it('matches naive unreduced BigInt multiplication + final GCD reduction', () => {
			const factors = [];
			let seed = 123456789n;
			for (let i = 0; i < 40; i += 1) {
				seed = (seed * 1103515245n + 12345n) % 2147483648n;
				const num = (seed % 997n) - 498n;
				seed = (seed * 1103515245n + 12345n) % 2147483648n;
				const rawDen = (seed % 991n) + 1n;
				const den = i % 3 === 0 ? -rawDen : rawDen;
				// Avoid accidental zero here so we test full multi-factor cancellation
				factors.push({ num: num === 0n ? 17n : num, den });
			}

			let naiveNum = 1n;
			let naiveDen = 1n;
			for (const { num, den } of factors) {
				naiveNum *= num;
				naiveDen *= den;
			}
			const expected = reduce(naiveNum, naiveDen);
			const actual = productRationalIterative(factors);

			assert.deepEqual(actual, expected);
			assert.equal(gcd(actual.num, actual.den), 1n);
			assert.ok(actual.den > 0n);
		});
	});
});
