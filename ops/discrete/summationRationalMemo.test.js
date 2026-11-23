import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summationRationalMemo } from './summationRationalMemo.js';

/**
 * Independent reference GCD for test assertions.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function refGcd(a, b) {
	a = a < 0n ? -a : a;
	b = b < 0n ? -b : b;
	while (b !== 0n) {
		const t = a % b;
		a = b;
		b = t;
	}
	return a;
}

/**
 * Independent common-denominator exact rational check (no pairwise reduction).
 *
 * @param {Array<{ num: bigint, den: bigint }>} terms
 * @param {{ num: bigint, den: bigint }} actual
 */
function assertMatchesCommonDenominator(terms, actual) {
	assert.equal(typeof actual.num, 'bigint');
	assert.equal(typeof actual.den, 'bigint');
	assert.ok(actual.den > 0n, `expected positive denominator, got ${actual.den}`);
	assert.equal(
		refGcd(actual.num, actual.den),
		1n,
		`expected lowest terms, got ${actual.num}/${actual.den}`,
	);
	if (actual.num === 0n) {
		assert.equal(actual.den, 1n);
	}

	let commonDen = 1n;
	for (const { den } of terms) {
		commonDen *= den < 0n ? -den : den;
	}
	let scaledNum = 0n;
	for (const { num, den } of terms) {
		const sign = den < 0n ? -1n : 1n;
		const absDen = den < 0n ? -den : den;
		scaledNum += sign * num * (commonDen / absDen);
	}
	assert.equal(
		actual.num * commonDen,
		scaledNum * actual.den,
		`expected ${actual.num}/${actual.den} to equal ${scaledNum}/${commonDen}`,
	);
}

describe('summationRationalMemo', () => {
	describe('normal cases', () => {
		it('computes exact harmonic partial sums (precomputed range and beyond)', () => {
			const expected = [
				{ n: 1, num: 1n, den: 1n },
				{ n: 2, num: 3n, den: 2n },
				{ n: 3, num: 11n, den: 6n },
				{ n: 4, num: 25n, den: 12n },
				{ n: 5, num: 137n, den: 60n },
				{ n: 6, num: 49n, den: 20n },
				{ n: 10, num: 7381n, den: 2520n },
				{ n: 12, num: 86021n, den: 27720n },
			];

			for (const { n, num, den } of expected) {
				const terms = Array.from({ length: n }, (_, i) => ({
					num: 1n,
					den: BigInt(i + 1),
				}));
				assert.deepEqual(summationRationalMemo(terms), { num, den });
			}

			// Beyond precomputed H_32 table (H_40)
			const h40Terms = Array.from({ length: 40 }, (_, i) => ({
				num: 1n,
				den: BigInt(i + 1),
			}));
			const h40 = summationRationalMemo(h40Terms);
			assertMatchesCommonDenominator(h40Terms, h40);
		});

		it('handles mixed-sign fractions and alternating harmonic sums', () => {
			const terms = [
				{ num: 1n, den: 1n },
				{ num: -1n, den: 2n },
				{ num: 1n, den: 3n },
				{ num: -1n, den: 4n },
				{ num: 1n, den: 5n },
				{ num: -1n, den: 6n },
			];
			// 1 - 1/2 + 1/3 - 1/4 + 1/5 - 1/6 = 37/60
			assert.deepEqual(summationRationalMemo(terms), { num: 37n, den: 60n });

			const negResult = summationRationalMemo([
				{ num: -5n, den: 6n },
				{ num: 1n, den: 10n },
				{ num: -2n, den: 15n },
			]);
			// (-25 + 3 - 4) / 30 = -26/30 = -13/15
			assert.deepEqual(negResult, { num: -13n, den: 15n });
		});

		it('handles large BigInt numerators and denominators without precision loss', () => {
			const big1 = (1n << 128n) + 159n;
			const big2 = (1n << 128n) + 173n;
			const big3 = (1n << 100n) + 277n;
			const terms = [
				{ num: big3, den: big1 },
				{ num: -big3, den: big2 },
				{ num: (1n << 150n) + 1n, den: big1 * big2 },
			];
			const res = summationRationalMemo(terms);
			assertMatchesCommonDenominator(terms, res);
		});

		it('accepts arbitrary iterables such as generators and Sets', () => {
			function* genTerms() {
				yield { num: 1n, den: 2n };
				yield { num: 1n, den: 3n };
				yield { num: 1n, den: 6n };
			}
			assert.deepEqual(summationRationalMemo(genTerms()), { num: 1n, den: 1n });

			const setTerms = new Set([
				{ num: 2n, den: 5n },
				{ num: 3n, den: 10n },
				{ num: -1n, den: 2n },
			]);
			assert.deepEqual(summationRationalMemo(setTerms), { num: 1n, den: 5n });
		});

		it('supports 3-argument range mode (start, end, termFn) for safe integers and BigInts', () => {
			const intSum = summationRationalMemo(1, 6, (k) => ({
				num: 1n,
				den: BigInt(k),
			}));
			assert.deepEqual(intSum, { num: 49n, den: 20n });

			const bigSum = summationRationalMemo(1n, 5n, (k) => ({
				num: k,
				den: k + 1n,
			}));
			// 1/2 + 2/3 + 3/4 + 4/5 + 5/6 = (30 + 40 + 45 + 48 + 50)/60 = 213/60 = 71/20
			assert.deepEqual(bigSum, { num: 71n, den: 20n });

			// Empty range (start > end) returns 0/1 without calling termFn
			let called = false;
			const emptyRange = summationRationalMemo(5, 3, () => {
				called = true;
				return { num: 1n, den: 1n };
			});
			assert.deepEqual(emptyRange, { num: 0n, den: 1n });
			assert.equal(called, false);

			// Single-element range (start === end)
			const singleRange = summationRationalMemo(7n, 7n, (k) => ({
				num: k * 2n,
				den: 4n,
			}));
			assert.deepEqual(singleRange, { num: 7n, den: 2n });
		});
	});

	describe('edge cases', () => {
		it('returns 0/1 for an empty array', () => {
			assert.deepEqual(summationRationalMemo([]), { num: 0n, den: 1n });
		});

		it('normalizes single-element inputs including zero, negative denominators, and unreduced fractions', () => {
			assert.deepEqual(summationRationalMemo([{ num: 0n, den: 99n }]), {
				num: 0n,
				den: 1n,
			});
			assert.deepEqual(summationRationalMemo([{ num: 0n, den: -7n }]), {
				num: 0n,
				den: 1n,
			});
			assert.deepEqual(summationRationalMemo([{ num: 6n, den: -9n }]), {
				num: -2n,
				den: 3n,
			});
			assert.deepEqual(summationRationalMemo([{ num: -12n, den: -18n }]), {
				num: 2n,
				den: 3n,
			});
		});

		it('handles exact cancellations to 0/1', () => {
			assert.deepEqual(
				summationRationalMemo([
					{ num: 7n, den: 13n },
					{ num: -7n, den: 13n },
				]),
				{ num: 0n, den: 1n },
			);
			assert.deepEqual(
				summationRationalMemo([
					{ num: 1n, den: 2n },
					{ num: 1n, den: 3n },
					{ num: 1n, den: 6n },
					{ num: -10n, den: 10n },
				]),
				{ num: 0n, den: 1n },
			);
		});

		it('handles unreduced inputs and negative denominators in multi-term sums', () => {
			const terms = [
				{ num: -4n, den: -6n }, // +2/3
				{ num: 10n, den: -15n }, // -2/3
				{ num: 21n, den: 14n }, // +3/2
				{ num: 0n, den: -5n }, // 0
			];
			assert.deepEqual(summationRationalMemo(terms), { num: 3n, den: 2n });
		});

		it('preserves memoization consistency, prefix reuse, commutativity, and return-value isolation', () => {
			const base = [
				{ num: 3n, den: 7n },
				{ num: 5n, den: 11n },
				{ num: -2n, den: 13n },
			];
			const first = summationRationalMemo(base);
			// Mutate returned object to verify cache is isolated from caller mutations.
			first.num = 999999n;
			first.den = 1n;

			const second = summationRationalMemo(base);
			assertMatchesCommonDenominator(base, second);
			assert.notEqual(second.num, 999999n);

			// Extending cached prefix reuses cached prefix sum cleanly.
			const extended = [...base, { num: 4n, den: 17n }, { num: -1n, den: 19n }];
			const extendedSum = summationRationalMemo(extended);
			assertMatchesCommonDenominator(extended, extendedSum);

			// Commutativity: reversed order yields identical reduced rational.
			const reversedSum = summationRationalMemo([...extended].reverse());
			assert.deepEqual(reversedSum, extendedSum);
		});

		it('validates inputs strictly and throws descriptive errors', () => {
			// Invalid arity
			assert.throws(() => /** @type {any} */ (summationRationalMemo)(), TypeError);
			assert.throws(
				() => /** @type {any} */ (summationRationalMemo)(1, 2),
				TypeError,
			);
			assert.throws(
				() =>
					/** @type {any} */ (summationRationalMemo)(
						1,
						2,
						() => ({ num: 0n, den: 1n }),
						4,
					),
				TypeError,
			);

			// Invalid iterable
			assert.throws(
				() => summationRationalMemo(/** @type {any} */ (null)),
				TypeError,
			);
			assert.throws(
				() => summationRationalMemo(/** @type {any} */ (undefined)),
				TypeError,
			);
			assert.throws(
				() => summationRationalMemo(/** @type {any} */ ('1/2')),
				TypeError,
			);
			assert.throws(
				() => summationRationalMemo(/** @type {any} */ (42)),
				TypeError,
			);
			assert.throws(
				() => summationRationalMemo(/** @type {any} */ ({ num: 1n, den: 2n })),
				TypeError,
			);

			// Invalid term shapes
			assert.throws(
				() => summationRationalMemo(/** @type {any} */ ([null])),
				TypeError,
			);
			assert.throws(
				() => summationRationalMemo(/** @type {any} */ ([{ num: 1, den: 2n }])),
				TypeError,
			);
			assert.throws(
				() => summationRationalMemo(/** @type {any} */ ([{ num: 1n, den: 2 }])),
				TypeError,
			);
			assert.throws(
				() => summationRationalMemo(/** @type {any} */ ([{ num: 1n }])),
				TypeError,
			);

			// Zero denominator
			assert.throws(
				() => summationRationalMemo([{ num: 1n, den: 0n }]),
				RangeError,
			);
			assert.throws(
				() => summationRationalMemo([{ num: 0n, den: 0n }]),
				RangeError,
			);
			assert.throws(
				() => summationRationalMemo(1, 3, (k) => ({ num: 1n, den: BigInt(k - 2) })),
				RangeError,
			);

			// Invalid range mode arguments
			assert.throws(
				() => summationRationalMemo(1.5, 3, () => ({ num: 1n, den: 1n })),
				TypeError,
			);
			assert.throws(
				() => summationRationalMemo(1, Infinity, () => ({ num: 1n, den: 1n })),
				TypeError,
			);
			assert.throws(
				() =>
					summationRationalMemo(
						/** @type {any} */ (1),
						/** @type {any} */ (3n),
						() => ({ num: 1n, den: 1n }),
					),
				TypeError,
			);
			assert.throws(
				() => summationRationalMemo(1, 3, /** @type {any} */ ('not-a-fn')),
				TypeError,
			);
			assert.throws(
				() => summationRationalMemo(1, 2, () => /** @type {any} */ ({ num: 1, den: 2 })),
				TypeError,
			);
		});
	});

	describe('independent cross-checks', () => {
		it('satisfies the telescoping series identity sum_{k=1}^n (1/k - 1/(k+1)) == n/(n+1)', () => {
			for (const n of [1, 5, 10, 50, 120]) {
				// Iterable mode: 2*n terms alternating +1/k and -1/(k+1)
				const terms = [];
				for (let k = 1; k <= n; k++) {
					terms.push({ num: 1n, den: BigInt(k) });
					terms.push({ num: -1n, den: BigInt(k + 1) });
				}
				assert.deepEqual(summationRationalMemo(terms), {
					num: BigInt(n),
					den: BigInt(n + 1),
				});

				// Range mode: single combined term 1/(k*(k+1))
				const rangeSum = summationRationalMemo(1n, BigInt(n), (k) => ({
					num: 1n,
					den: k * (k + 1n),
				}));
				assert.deepEqual(rangeSum, {
					num: BigInt(n),
					den: BigInt(n + 1),
				});
			}
		});

		it('matches independent common-denominator summation across deterministic mixed batches', () => {
			// Deterministic LCG for reproducible mixed-sign, unreduced fractions.
			let state = 123456789n;
			const next = () => {
				state = (1103515245n * state + 12345n) & 0x7fffffffn;
				return state;
			};

			for (const batchSize of [3, 15, 45]) {
				const terms = [];
				for (let i = 0; i < batchSize; i++) {
					const rawNum = (next() % 401n) - 200n;
					const signDen = (next() & 1n) === 0n ? 1n : -1n;
					const rawDen = signDen * ((next() % 97n) + 1n);
					const scale = (next() % 5n) + 1n; // intentionally unreduced
					terms.push({ num: rawNum * scale, den: rawDen * scale });
				}
				const actual = summationRationalMemo(terms);
				assertMatchesCommonDenominator(terms, actual);
			}
		});

		it('satisfies exact geometric series identity sum_{k=0}^{n-1} r^k == (1 - r^n)/(1 - r)', () => {
			// r = 2/3, n = 12: (1 - (2/3)^12) / (1/3) = 3 * (3^12 - 2^12) / 3^12 = (3^12 - 2^12) / 3^11
			const n = 12n;
			const geomPos = summationRationalMemo(0n, n - 1n, (k) => ({
				num: 2n ** k,
				den: 3n ** k,
			}));
			const expNum = 3n ** n - 2n ** n;
			const expDen = 3n ** (n - 1n);
			const g = refGcd(expNum, expDen);
			assert.deepEqual(geomPos, { num: expNum / g, den: expDen / g });

			// r = -3/5, n = 9: (1 - (-3/5)^9) / (8/5) = (5^9 + 3^9) / (8 * 5^8)
			const m = 9n;
			const geomAlt = summationRationalMemo(0n, m - 1n, (k) => ({
				num: (-3n) ** k,
				den: 5n ** k,
			}));
			const altNum = 5n ** m + 3n ** m;
			const altDen = 8n * 5n ** (m - 1n);
			const g2 = refGcd(altNum, altDen);
			assert.deepEqual(geomAlt, { num: altNum / g2, den: altDen / g2 });
		});
	});
});
