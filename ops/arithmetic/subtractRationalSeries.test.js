import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { subtractRationalSeries } from './subtractRationalSeries.js';

function absBigInt(x) {
	return x < 0n ? -x : x;
}

function refGcd(a, b) {
	let x = absBigInt(a);
	let y = absBigInt(b);
	while (y !== 0n) {
		[x, y] = [y, x % y];
	}
	return x;
}

function refNormalize({ num, den }) {
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}
	const sign = den < 0n ? -1n : 1n;
	const n = num * sign;
	const d = den * sign;
	const g = refGcd(n, d);
	return { num: n / g, den: d / g };
}

function refAdd(a, b) {
	return refNormalize({
		num: a.num * b.den + b.num * a.den,
		den: a.den * b.den,
	});
}

function refNegate(r) {
	return r.num === 0n ? { num: 0n, den: 1n } : { num: -r.num, den: r.den };
}

function assertCanonical(r) {
	assert.equal(typeof r.num, 'bigint');
	assert.equal(typeof r.den, 'bigint');
	assert.ok(r.den > 0n, `expected positive denominator, got ${r.den}`);
	if (r.num === 0n) {
		assert.equal(r.den, 1n, `expected 0n/1n for zero, got 0n/${r.den}`);
	} else {
		assert.equal(
			refGcd(r.num, r.den),
			1n,
			`expected lowest terms for ${r.num}/${r.den}`,
		);
	}
}

describe('subtractRationalSeries', () => {
	describe('normal cases', () => {
		it('subtracts fractions with coprime denominators', () => {
			assert.deepEqual(
				subtractRationalSeries({ num: 1n, den: 2n }, { num: 1n, den: 3n }),
				{ num: 1n, den: 6n },
			);
			assert.deepEqual(
				subtractRationalSeries({ num: 3n, den: 4n }, { num: 2n, den: 5n }),
				{ num: 7n, den: 20n },
			);
			assert.deepEqual(
				subtractRationalSeries({ num: 1n, den: 3n }, { num: 1n, den: 2n }),
				{ num: -1n, den: 6n },
			);
		});

		it('subtracts fractions with shared factors and reduces result', () => {
			assert.deepEqual(
				subtractRationalSeries({ num: 5n, den: 6n }, { num: 1n, den: 6n }),
				{ num: 2n, den: 3n },
			);
			assert.deepEqual(
				subtractRationalSeries({ num: 5n, den: 12n }, { num: 1n, den: 18n }),
				{ num: 13n, den: 36n },
			);
			assert.deepEqual(
				subtractRationalSeries({ num: 7n, den: 12n }, { num: 1n, den: 12n }),
				{ num: 1n, den: 2n },
			);
			assert.deepEqual(
				subtractRationalSeries({ num: 7n, den: 4n }, { num: 3n, den: 4n }),
				{ num: 1n, den: 1n },
			);
		});

		it('handles integer rationals and zero operands', () => {
			assert.deepEqual(
				subtractRationalSeries({ num: 10n, den: 1n }, { num: 3n, den: 1n }),
				{ num: 7n, den: 1n },
			);
			assert.deepEqual(
				subtractRationalSeries({ num: 0n, den: 1n }, { num: 3n, den: 7n }),
				{ num: -3n, den: 7n },
			);
			assert.deepEqual(
				subtractRationalSeries({ num: 3n, den: 7n }, { num: 0n, den: 1n }),
				{ num: 3n, den: 7n },
			);
			assert.deepEqual(
				subtractRationalSeries({ num: 0n, den: 1n }, { num: 0n, den: 1n }),
				{ num: 0n, den: 1n },
			);
			assert.deepEqual(
				subtractRationalSeries({ num: 0n, den: -9n }, { num: 0n, den: 15n }),
				{ num: 0n, den: 1n },
			);
		});
	});

	describe('negative numerators and denominators', () => {
		it('canonicalizes negative denominators and mixed signs', () => {
			const cases = [
				[{ num: -3n, den: 4n }, { num: 1n, den: 4n }, { num: -1n, den: 1n }],
				[{ num: 1n, den: 4n }, { num: -3n, den: 4n }, { num: 1n, den: 1n }],
				[{ num: 1n, den: -2n }, { num: 1n, den: 3n }, { num: -5n, den: 6n }],
				[{ num: 1n, den: 2n }, { num: 1n, den: -3n }, { num: 5n, den: 6n }],
				[{ num: -3n, den: -4n }, { num: -1n, den: -2n }, { num: 1n, den: 4n }],
				[{ num: 5n, den: -6n }, { num: -1n, den: 6n }, { num: -2n, den: 3n }],
				[{ num: -7n, den: -10n }, { num: 3n, den: -10n }, { num: 1n, den: 1n }],
			];

			for (const [a, b, expected] of cases) {
				const result = subtractRationalSeries(a, b);
				assertCanonical(result);
				assert.deepEqual(result, expected);
			}
		});
	});

	describe('self-subtraction to canonical zero', () => {
		it('returns { num: 0n, den: 1n } for identical and equivalent rationals', () => {
			const pairs = [
				[{ num: 5n, den: 7n }, { num: 5n, den: 7n }],
				[{ num: -5n, den: 7n }, { num: 5n, den: -7n }],
				[{ num: 6n, den: 9n }, { num: 2n, den: 3n }],
				[{ num: -4n, den: -6n }, { num: 2n, den: 3n }],
				[{ num: 0n, den: -99n }, { num: 0n, den: 42n }],
				[
					{ num: 123456789012345678901234567890n, den: 98765432109876543210987654321n },
					{ num: -246913578024691357802469135780n, den: -197530864219753086421975308642n },
				],
			];

			for (const [a, b] of pairs) {
				const result = subtractRationalSeries(a, b);
				assert.deepEqual(result, { num: 0n, den: 1n });
				assertCanonical(result);
			}
		});
	});

	describe('unreduced inputs and immutability', () => {
		it('handles unreduced fractions and does not mutate input objects', () => {
			const a = { num: 10n, den: 20n };
			const b = { num: 6n, den: 18n };
			const result = subtractRationalSeries(a, b);

			assert.deepEqual(result, { num: 1n, den: 6n });
			assert.deepEqual(a, { num: 10n, den: 20n });
			assert.deepEqual(b, { num: 6n, den: 18n });
			assertCanonical(result);
		});

		it('handles null-prototype objects', () => {
			const a = Object.assign(Object.create(null), { num: 14n, den: 21n });
			const b = Object.assign(Object.create(null), { num: 5n, den: 15n });
			assert.deepEqual(subtractRationalSeries(a, b), { num: 1n, den: 3n });
		});
	});

	describe('huge BigInts', () => {
		it('computes exact differences for very large coprime denominators', () => {
			const p = 10n ** 60n + 7n;
			const q = 10n ** 60n + 9n;
			// 1/p - 1/q = (q - p) / (p * q) = 2 / (p * q), and p, q are odd so gcd(2, p*q) === 1
			const result = subtractRationalSeries({ num: 1n, den: p }, { num: 1n, den: q });
			assertCanonical(result);
			assert.deepEqual(result, { num: 2n, den: p * q });
		});

		it('exploits huge shared GCD cleanly without loss of precision', () => {
			const k = 10n ** 80n;
			// (3 / (2*k)) - (1 / (3*k)) = 7 / (6*k)
			const a = { num: 3n, den: 2n * k };
			const b = { num: 1n, den: 3n * k };
			const result = subtractRationalSeries(a, b);
			assertCanonical(result);
			assert.deepEqual(result, { num: 7n, den: 6n * k });
		});

		it('cancels huge numerators cleanly when difference collapses', () => {
			const big = 10n ** 100n;
			const a = { num: big + 1n, den: big };
			const b = { num: big - 1n, den: big };
			// 2 / 10^100 = 1 / (5 * 10^99)
			const result = subtractRationalSeries(a, b);
			assertCanonical(result);
			assert.deepEqual(result, { num: 1n, den: 5n * 10n ** 99n });
		});
	});

	describe('invalid input validation', () => {
		const valid = { num: 1n, den: 2n };

		it('throws TypeError for non-object or array operands', () => {
			const badObjects = [
				null,
				undefined,
				0,
				1,
				1n,
				'1/2',
				true,
				false,
				[1n, 2n],
				() => ({ num: 1n, den: 2n }),
				Symbol('rational'),
			];

			for (const bad of badObjects) {
				assert.throws(() => subtractRationalSeries(bad, valid), TypeError);
				assert.throws(() => subtractRationalSeries(valid, bad), TypeError);
			}
			assert.throws(() => subtractRationalSeries(), TypeError);
			assert.throws(() => subtractRationalSeries(valid), TypeError);
		});

		it('throws TypeError when num or den is missing or not a BigInt', () => {
			const badRationals = [
				{},
				{ num: 1n },
				{ den: 2n },
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: '1', den: 2n },
				{ num: 1n, den: '2' },
				{ num: NaN, den: 2n },
				{ num: 1n, den: Infinity },
				{ num: null, den: 2n },
				{ num: 1n, den: undefined },
			];

			for (const bad of badRationals) {
				assert.throws(() => subtractRationalSeries(bad, valid), TypeError);
				assert.throws(() => subtractRationalSeries(valid, bad), TypeError);
			}
		});

		it('throws RangeError when denominator is 0n', () => {
			assert.throws(
				() => subtractRationalSeries({ num: 1n, den: 0n }, valid),
				RangeError,
			);
			assert.throws(
				() => subtractRationalSeries(valid, { num: 1n, den: 0n }),
				RangeError,
			);
			assert.throws(
				() => subtractRationalSeries({ num: 0n, den: 0n }, { num: 0n, den: 0n }),
				RangeError,
			);
		});
	});

	describe('algebraic cross-checks and independent verification', () => {
		const sampleRationals = [
			{ num: 0n, den: 1n },
			{ num: 0n, den: -7n },
			{ num: 1n, den: 1n },
			{ num: -1n, den: 1n },
			{ num: 1n, den: 2n },
			{ num: -3n, den: 4n },
			{ num: 5n, den: -6n },
			{ num: -14n, den: -21n },
			{ num: 22n, den: 7n },
			{ num: -355n, den: 113n },
			{ num: 120n, den: 360n },
			{ num: 10n ** 30n + 3n, den: 10n ** 30n + 11n },
			{ num: -(10n ** 30n + 5n), den: -(2n * (10n ** 30n + 11n)) },
		];

		it('satisfies anticommutativity: a - b === -(b - a)', () => {
			for (const a of sampleRationals) {
				for (const b of sampleRationals) {
					const ab = subtractRationalSeries(a, b);
					const ba = subtractRationalSeries(b, a);
					assertCanonical(ab);
					assertCanonical(ba);
					assert.deepEqual(ab, refNegate(ba));
				}
			}
		});

		it('satisfies additive inverse identity: (a - b) + b === a', () => {
			for (const a of sampleRationals) {
				const normA = refNormalize(a);
				for (const b of sampleRationals) {
					const diff = subtractRationalSeries(a, b);
					assertCanonical(diff);
					assert.deepEqual(refAdd(diff, b), normA);
				}
			}
		});

		it('matches direct cross-multiplication equivalence: diff.num * d1 * d2 === (n1 * d2 - n2 * d1) * diff.den', () => {
			for (const a of sampleRationals) {
				for (const b of sampleRationals) {
					const diff = subtractRationalSeries(a, b);
					assertCanonical(diff);

					const lhs = diff.num * a.den * b.den;
					const rhs = (a.num * b.den - b.num * a.den) * diff.den;
					assert.equal(lhs, rhs);
				}
			}
		});

		it('satisfies telescoping series identity: sum_{k=1}^{N} (1/k - 1/(k+1)) === 1 - 1/(N+1)', () => {
			const N = 40n;
			let total = { num: 0n, den: 1n };
			for (let k = 1n; k <= N; k += 1n) {
				const term = subtractRationalSeries(
					{ num: 1n, den: k },
					{ num: 1n, den: k + 1n },
				);
				assertCanonical(term);
				total = refAdd(total, term);
			}
			const expected = subtractRationalSeries(
				{ num: 1n, den: 1n },
				{ num: 1n, den: N + 1n },
			);
			assert.deepEqual(total, expected);
			assert.deepEqual(total, { num: N, den: N + 1n });
		});

		it('agrees with IEEE-754 floating point for moderate rationals', () => {
			const pairs = [
				[{ num: 22n, den: 7n }, { num: 355n, den: 113n }],
				[{ num: -17n, den: 19n }, { num: 23n, den: -29n }],
				[{ num: 1001n, den: 13n }, { num: 77n, den: 1n }],
			];

			for (const [a, b] of pairs) {
				const res = subtractRationalSeries(a, b);
				const approxRes = Number(res.num) / Number(res.den);
				const approxDirect = Number(a.num) / Number(a.den) - Number(b.num) / Number(b.den);
				assert.ok(Math.abs(approxRes - approxDirect) < 1e-12);
			}
		});
	});
});
