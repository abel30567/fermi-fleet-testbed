import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { productRationalMemo } from './productRationalMemo.js';

/**
 * Independent reference Euclidean gcd for test cross-checks.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function refGcd(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const r = x % y;
		x = y;
		y = r;
	}
	return x;
}

/**
 * Independent naive rational product (multiply all numerators, all denominators,
 * then normalize once) for differential testing.
 * @param {Array<{ num: bigint, den: bigint }>} terms
 * @returns {{ num: bigint, den: bigint }}
 */
function refNaiveProduct(terms) {
	let num = 1n;
	let den = 1n;
	for (const t of terms) {
		num *= t.num;
		den *= t.den;
	}
	if (num === 0n) return { num: 0n, den: 1n };
	if (den < 0n) {
		num = -num;
		den = -den;
	}
	const g = refGcd(num, den);
	return { num: num / g, den: den / g };
}

/**
 * Independent BigInt factorial helper for Wallis / binomial identities.
 * @param {bigint} n
 * @returns {bigint}
 */
function factorial(n) {
	let acc = 1n;
	for (let k = 2n; k <= n; k += 1n) {
		acc *= k;
	}
	return acc;
}

describe('productRationalMemo', () => {
	describe('normal cases', () => {
		it('computes basic fraction products in lowest terms', () => {
			assert.deepEqual(
				productRationalMemo([
					{ num: 2n, den: 3n },
					{ num: 9n, den: 4n },
					{ num: 5n, den: 6n },
				]),
				{ num: 5n, den: 4n },
			);
		});

		it('handles mixed signs across numerators and denominators', () => {
			assert.deepEqual(
				productRationalMemo([
					{ num: -2n, den: 3n },
					{ num: 9n, den: -4n },
					{ num: -5n, den: -6n },
				]),
				{ num: 5n, den: 4n },
			);

			assert.deepEqual(
				productRationalMemo([
					{ num: -2n, den: 3n },
					{ num: 3n, den: 5n },
					{ num: 5n, den: -7n },
					{ num: -7n, den: 11n },
				]),
				{ num: -2n, den: 11n },
			);
		});

		it('cancels exact reciprocals and repeated identical factors', () => {
			assert.deepEqual(
				productRationalMemo([
					{ num: 17n, den: 29n },
					{ num: 29n, den: 17n },
					{ num: -13n, den: 7n },
					{ num: 7n, den: -13n },
				]),
				{ num: 1n, den: 1n },
			);

			assert.deepEqual(
				productRationalMemo([
					{ num: 2n, den: 3n },
					{ num: 2n, den: 3n },
					{ num: 2n, den: 3n },
					{ num: 2n, den: 3n },
				]),
				{ num: 16n, den: 81n },
			);
		});

		it('handles large BigInt fractions beyond Number.MAX_SAFE_INTEGER exactly', () => {
			const p1 = 10n ** 40n + 7n;
			const p2 = 10n ** 40n + 9n;
			const bigScale = 2n ** 128n;

			const res = productRationalMemo([
				{ num: p1 * bigScale, den: p2 * bigScale },
				{ num: p2 * 3n, den: p1 * 5n },
				{ num: 25n * 10n ** 30n, den: 9n * 10n ** 30n },
			]);
			assert.deepEqual(res, { num: 5n, den: 3n });

			const huge = productRationalMemo([
				{ num: 2n ** 200n, den: 3n ** 100n },
				{ num: 3n ** 50n, den: 2n ** 100n },
			]);
			assert.deepEqual(huge, { num: 2n ** 100n, den: 3n ** 50n });
		});

		it('supports the 3-argument (start, end, termFn) form with safe integers and bigints', () => {
			const resNum = productRationalMemo(1, 5, (k) => ({
				num: BigInt(k),
				den: BigInt(k + 1),
			}));
			assert.deepEqual(resNum, { num: 1n, den: 6n });

			const resBig = productRationalMemo(1n, 6n, (k) => ({
				num: k,
				den: k + 1n,
			}));
			assert.deepEqual(resBig, { num: 1n, den: 7n });
		});
	});

	describe('edge cases', () => {
		it('returns 1/1 for empty array and empty ranges (start > end)', () => {
			assert.deepEqual(productRationalMemo([]), { num: 1n, den: 1n });
			let called = false;
			assert.deepEqual(
				productRationalMemo(5, 3, () => {
					called = true;
					return { num: 2n, den: 3n };
				}),
				{ num: 1n, den: 1n },
			);
			assert.equal(called, false);
			assert.deepEqual(
				productRationalMemo(10n, 9n, () => ({ num: 2n, den: 3n })),
				{ num: 1n, den: 1n },
			);
		});

		it('handles single-element products including unreduced and negative denominators', () => {
			assert.deepEqual(productRationalMemo([{ num: 24n, den: -36n }]), { num: -2n, den: 3n });
			assert.deepEqual(productRationalMemo([{ num: -18n, den: -18n }]), { num: 1n, den: 1n });
			assert.deepEqual(productRationalMemo([{ num: 0n, den: -99n }]), { num: 0n, den: 1n });
		});

		it('handles unreduced inputs cleanly', () => {
			assert.deepEqual(
				productRationalMemo([
					{ num: 100n, den: 250n },
					{ num: -15n, den: -6n },
					{ num: 42n, den: 14n },
				]),
				{ num: 3n, den: 1n },
			);
		});

		it('returns 0/1 when any factor is zero while still validating remaining inputs', () => {
			assert.deepEqual(
				productRationalMemo([
					{ num: 3n, den: 7n },
					{ num: 0n, den: -5n },
					{ num: 11n, den: 13n },
				]),
				{ num: 0n, den: 1n },
			);

			assert.throws(
				() =>
					productRationalMemo([
						{ num: 0n, den: 1n },
						{ num: 5n, den: 0n },
					]),
				RangeError,
			);

			assert.throws(
				() =>
					productRationalMemo([
						{ num: 0n, den: 1n },
						{ num: 5, den: 2n },
					]),
				TypeError,
			);

			assert.throws(
				() => productRationalMemo([{ num: 0n, den: 1n }, null]),
				TypeError,
			);

			assert.throws(
				() =>
					productRationalMemo(0, 2, (k) =>
						k === 2 ? { num: 1n, den: 0n } : { num: BigInt(k), den: 1n },
					),
				RangeError,
			);
		});

		it('maintains memoization consistency and protects cache against caller mutation', () => {
			const terms = [
				{ num: 4n, den: 9n },
				{ num: 15n, den: 8n },
				{ num: -7n, den: 10n },
			];
			const first = productRationalMemo(terms);
			assert.deepEqual(first, { num: -7n, den: 12n });

			// Mutate returned result — must not poison internal memo cache
			first.num = 999999n;
			first.den = 1n;

			const second = productRationalMemo(terms);
			assert.deepEqual(second, { num: -7n, den: 12n });
			assert.notEqual(first, second);

			// Permuted sequence hits canonical multiset cache and yields identical value
			const permuted = productRationalMemo([terms[2], terms[0], terms[1]]);
			assert.deepEqual(permuted, { num: -7n, den: 12n });

			// Negative / opposite-sign variant with same magnitudes
			const negated = productRationalMemo([
				{ num: 4n, den: 9n },
				{ num: 15n, den: 8n },
				{ num: 7n, den: 10n },
			]);
			assert.deepEqual(negated, { num: 7n, den: 12n });
		});

		it('strictly rejects invalid inputs', () => {
			assert.throws(() => productRationalMemo(), TypeError);
			assert.throws(() => productRationalMemo(1, 2), TypeError);
			assert.throws(() => productRationalMemo(1, 2, () => ({ num: 1n, den: 1n }), 4), TypeError);
			assert.throws(() => productRationalMemo(null), TypeError);
			assert.throws(() => productRationalMemo('not-an-array'), TypeError);
			assert.throws(() => productRationalMemo({ num: 1n, den: 2n }), TypeError);

			// Invalid term elements
			assert.throws(() => productRationalMemo([null]), TypeError);
			assert.throws(() => productRationalMemo([undefined]), TypeError);
			assert.throws(() => productRationalMemo([[1n, 2n]]), TypeError);
			assert.throws(() => productRationalMemo([{ num: 1, den: 2n }]), TypeError);
			assert.throws(() => productRationalMemo([{ num: 1n, den: 2 }]), TypeError);
			assert.throws(() => productRationalMemo([{ num: 1n }]), TypeError);
			assert.throws(() => productRationalMemo([{ num: 1n, den: 0n }]), RangeError);

			// Sparse array hole must be rejected
			const sparse = new Array(2);
			sparse[0] = { num: 1n, den: 2n };
			assert.throws(() => productRationalMemo(sparse), TypeError);

			// Invalid 3-arg parameters
			assert.throws(() => productRationalMemo(1.5, 3, () => ({ num: 1n, den: 1n })), TypeError);
			assert.throws(() => productRationalMemo(1, 3n, () => ({ num: 1n, den: 1n })), TypeError);
			assert.throws(() => productRationalMemo(1, NaN, () => ({ num: 1n, den: 1n })), TypeError);
			assert.throws(() => productRationalMemo(1, 3, 'not-a-fn'), TypeError);
		});
	});

	describe('independent mathematical cross-checks', () => {
		it('matches telescoping product prod_{k=1}^n (k / (k+1)) == 1 / (n+1)', () => {
			for (const n of [1, 10, 50, 200]) {
				const terms = [];
				for (let k = 1; k <= n; k++) {
					terms.push({ num: BigInt(k), den: BigInt(k + 1) });
				}
				assert.deepEqual(productRationalMemo(terms), {
					num: 1n,
					den: BigInt(n + 1),
				});
				assert.deepEqual(
					productRationalMemo(1, n, (k) => ({ num: BigInt(k), den: BigInt(k + 1) })),
					{ num: 1n, den: BigInt(n + 1) },
				);
			}
		});

		it('matches quadratic telescoping product prod_{k=2}^n (1 - 1/k^2) == (n+1) / (2n)', () => {
			for (const n of [2n, 15n, 75n]) {
				const actual = productRationalMemo(2n, n, (k) => ({
					num: k * k - 1n,
					den: k * k,
				}));
				const expectedNum = n + 1n;
				const expectedDen = 2n * n;
				const g = refGcd(expectedNum, expectedDen);
				assert.deepEqual(actual, {
					num: expectedNum / g,
					den: expectedDen / g,
				});
			}
		});

		it('matches Wallis product identity prod_{k=1}^n (4k^2 / (4k^2 - 1)) == 2^(4n) (n!)^4 / ((2n)! (2n+1)!)', () => {
			for (const n of [1n, 5n, 12n, 25n]) {
				const actual = productRationalMemo(1n, n, (k) => {
					const fourK2 = 4n * k * k;
					return { num: fourK2, den: fourK2 - 1n };
				});

				const factN = factorial(n);
				const fact2N = factorial(2n * n);
				const fact2N1 = fact2N * (2n * n + 1n);
				const rawNum = (1n << (4n * n)) * factN ** 4n;
				const rawDen = fact2N * fact2N1;
				const g = refGcd(rawNum, rawDen);

				assert.deepEqual(actual, {
					num: rawNum / g,
					den: rawDen / g,
				});
				assert.equal(refGcd(actual.num, actual.den), 1n);
			}
		});

		it('matches central binomial factorial identity prod_{k=1}^n ((n+k) / k) == (2n)! / (n!)^2', () => {
			for (const n of [1n, 8n, 20n]) {
				const actual = productRationalMemo(1n, n, (k) => ({
					num: n + k,
					den: k,
				}));
				const factN = factorial(n);
				const expected = factorial(2n * n) / (factN * factN);
				assert.deepEqual(actual, { num: expected, den: 1n });
			}
		});

		it('agrees with naive uncancelled BigInt reference on deterministic pseudo-random fractions', () => {
			let seed = 0x123456789abcdef1n;
			const nextRand = () => {
				seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
				return seed;
			};

			for (let trial = 0; trial < 15; trial++) {
				const count = Number(nextRand() % 30n) + 1;
				const terms = [];
				for (let i = 0; i < count; i++) {
					const signN = (nextRand() & 1n) === 0n ? 1n : -1n;
					const signD = (nextRand() & 1n) === 0n ? 1n : -1n;
					const num = signN * ((nextRand() % 200n) + 1n);
					const den = signD * ((nextRand() % 200n) + 1n);
					terms.push({ num, den });
				}
				const expected = refNaiveProduct(terms);
				const actual = productRationalMemo(terms);
				assert.deepEqual(actual, expected);
				assert.equal(actual.den > 0n, true);
				assert.equal(refGcd(actual.num, actual.den), 1n);
			}
		});
	});
});
