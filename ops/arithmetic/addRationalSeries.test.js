import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addRationalSeries } from './addRationalSeries.js';

function refGcd(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const t = x % y;
		x = y;
		y = t;
	}
	return x;
}

function assertCanonical(r) {
	assert.equal(typeof r, 'object');
	assert.notEqual(r, null);
	assert.equal(typeof r.num, 'bigint');
	assert.equal(typeof r.den, 'bigint');
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`);
	if (r.num === 0n) {
		assert.equal(r.den, 1n, `expected canonical zero 0n/1n, got 0n/${r.den}`);
	} else {
		assert.equal(
			refGcd(r.num, r.den),
			1n,
			`expected lowest terms for ${r.num}/${r.den}`
		);
	}
}

function assertCrossMultMatches(a, b, res) {
	assertCanonical(res);
	const directNum = a.num * b.den + b.num * a.den;
	const directDen = a.den * b.den;
	assert.equal(
		res.num * directDen,
		directNum * res.den,
		`cross-multiplication mismatch for (${a.num}/${a.den}) + (${b.num}/${b.den}) = ${res.num}/${res.den}`
	);
}

describe('addRationalSeries', () => {
	describe('normal cases', () => {
		it('adds simple positive fractions with coprime and shared denominators', () => {
			assert.deepStrictEqual(
				addRationalSeries({ num: 1n, den: 2n }, { num: 1n, den: 3n }),
				{ num: 5n, den: 6n }
			);
			assert.deepStrictEqual(
				addRationalSeries({ num: 1n, den: 6n }, { num: 1n, den: 3n }),
				{ num: 1n, den: 2n }
			);
			assert.deepStrictEqual(
				addRationalSeries({ num: 2n, den: 5n }, { num: 3n, den: 5n }),
				{ num: 1n, den: 1n }
			);
			assert.deepStrictEqual(
				addRationalSeries({ num: 5n, den: 12n }, { num: 7n, den: 18n }),
				{ num: 29n, den: 36n }
			);
		});

		it('adds integer rationals and zero addends', () => {
			assert.deepStrictEqual(
				addRationalSeries({ num: 3n, den: 1n }, { num: 4n, den: 1n }),
				{ num: 7n, den: 1n }
			);
			assert.deepStrictEqual(
				addRationalSeries({ num: 0n, den: 1n }, { num: 7n, den: 9n }),
				{ num: 7n, den: 9n }
			);
			assert.deepStrictEqual(
				addRationalSeries({ num: 7n, den: 9n }, { num: 0n, den: 1n }),
				{ num: 7n, den: 9n }
			);
			assert.deepStrictEqual(
				addRationalSeries({ num: 0n, den: 1n }, { num: 0n, den: 1n }),
				{ num: 0n, den: 1n }
			);
		});

		it('does not mutate input objects and accepts null-prototype objects', () => {
			const a = Object.freeze({ num: 4n, den: -6n });
			const b = Object.freeze({ num: 10n, den: 15n });
			assert.deepStrictEqual(addRationalSeries(a, b), { num: 0n, den: 1n });

			const nullProtoA = Object.assign(Object.create(null), { num: 1n, den: 4n });
			const nullProtoB = Object.assign(Object.create(null), { num: 3n, den: 8n });
			assert.deepStrictEqual(addRationalSeries(nullProtoA, nullProtoB), {
				num: 5n,
				den: 8n,
			});
		});
	});

	describe('negative numerators, negative denominators, and unreduced inputs', () => {
		it('handles negative numerators correctly', () => {
			assert.deepStrictEqual(
				addRationalSeries({ num: -1n, den: 2n }, { num: 1n, den: 3n }),
				{ num: -1n, den: 6n }
			);
			assert.deepStrictEqual(
				addRationalSeries({ num: -3n, den: 4n }, { num: -5n, den: 6n }),
				{ num: -19n, den: 12n }
			);
		});

		it('normalizes negative denominators into canonical positive denominator form', () => {
			assert.deepStrictEqual(
				addRationalSeries({ num: 1n, den: -2n }, { num: 1n, den: -3n }),
				{ num: -5n, den: 6n }
			);
			assert.deepStrictEqual(
				addRationalSeries({ num: -1n, den: -2n }, { num: 1n, den: 3n }),
				{ num: 5n, den: 6n }
			);
			assert.deepStrictEqual(
				addRationalSeries({ num: 0n, den: -7n }, { num: 2n, den: -6n }),
				{ num: -1n, den: 3n }
			);
			assert.deepStrictEqual(
				addRationalSeries({ num: 0n, den: -5n }, { num: 0n, den: -11n }),
				{ num: 0n, den: 1n }
			);
		});

		it('reduces unreduced inputs to lowest terms', () => {
			assert.deepStrictEqual(
				addRationalSeries({ num: 6n, den: 12n }, { num: 10n, den: 15n }),
				{ num: 7n, den: 6n }
			);
			assert.deepStrictEqual(
				addRationalSeries({ num: 14n, den: -21n }, { num: -25n, den: -15n }),
				{ num: 1n, den: 1n }
			);
			assert.deepStrictEqual(
				addRationalSeries({ num: 120n, den: 360n }, { num: 0n, den: 999n }),
				{ num: 1n, den: 3n }
			);
		});

		it('returns canonical zero { num: 0n, den: 1n } on exact cancellation', () => {
			assert.deepStrictEqual(
				addRationalSeries({ num: 3n, den: 7n }, { num: -3n, den: 7n }),
				{ num: 0n, den: 1n }
			);
			assert.deepStrictEqual(
				addRationalSeries({ num: 2n, den: -4n }, { num: -3n, den: -6n }),
				{ num: 0n, den: 1n }
			);
			assert.deepStrictEqual(
				addRationalSeries({ num: 100n, den: 250n }, { num: 4n, den: -10n }),
				{ num: 0n, den: 1n }
			);
		});
	});

	describe('huge BigInt numerators and denominators', () => {
		it('handles 100+ digit BigInts accurately in lowest terms', () => {
			const big = 10n ** 120n;
			const a = { num: big + 1n, den: 2n * big };
			const b = { num: big - 1n, den: 2n * big };
			const sum = addRationalSeries(a, b);
			assert.deepStrictEqual(sum, { num: 1n, den: 1n });
			assertCrossMultMatches(a, b, sum);
		});

		it('handles large coprime and shared-factor denominators without precision loss', () => {
			const p = 2n ** 127n - 1n; // Mersenne prime M127
			const q = 2n ** 89n - 1n; // Mersenne prime M89
			const k = 3n ** 60n;

			const a = { num: 5n * k, den: p * k };
			const b = { num: -7n, den: q };
			const res = addRationalSeries(a, b);

			assertCrossMultMatches(a, b, res);
			assert.deepStrictEqual(res, {
				num: 5n * q - 7n * p,
				den: p * q,
			});

			// Exact cancellation with huge negative denominator
			const negRes = { num: res.num, den: -res.den };
			assert.deepStrictEqual(addRationalSeries(res, negRes), {
				num: 0n,
				den: 1n,
			});
		});
	});

	describe('invalid input validation', () => {
		const valid = { num: 1n, den: 2n };

		it('throws TypeError for non-object or array arguments', () => {
			const badValues = [
				undefined,
				null,
				0,
				1,
				1n,
				'1/2',
				true,
				false,
				Symbol('r'),
				[1n, 2n],
				() => ({ num: 1n, den: 2n }),
			];
			for (const bad of badValues) {
				assert.throws(() => addRationalSeries(bad, valid), TypeError);
				assert.throws(() => addRationalSeries(valid, bad), TypeError);
			}
			assert.throws(() => addRationalSeries(), TypeError);
			assert.throws(() => addRationalSeries(valid), TypeError);
		});

		it('throws TypeError when num or den is missing or not a BigInt', () => {
			const badRationals = [
				{},
				{ num: 1n },
				{ den: 2n },
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: 1, den: 2 },
				{ num: NaN, den: 1n },
				{ num: 1n, den: Infinity },
				{ num: '1', den: 2n },
				{ num: 1n, den: '2' },
				{ num: null, den: 1n },
				{ num: 1n, den: undefined },
				{ num: true, den: 1n },
			];
			for (const bad of badRationals) {
				assert.throws(() => addRationalSeries(bad, valid), TypeError);
				assert.throws(() => addRationalSeries(valid, bad), TypeError);
			}
		});

		it('throws RangeError when den is 0n', () => {
			const zeroDens = [
				{ num: 1n, den: 0n },
				{ num: -5n, den: 0n },
				{ num: 0n, den: 0n },
			];
			for (const bad of zeroDens) {
				assert.throws(() => addRationalSeries(bad, valid), RangeError);
				assert.throws(() => addRationalSeries(valid, bad), RangeError);
			}
		});
	});

	describe('cross-checks and algebraic identities', () => {
		const samples = [
			{ num: 0n, den: 1n },
			{ num: 0n, den: -9n },
			{ num: 1n, den: 2n },
			{ num: -1n, den: 2n },
			{ num: 2n, den: -4n },
			{ num: 3n, den: 6n },
			{ num: -7n, den: -14n },
			{ num: 5n, den: 12n },
			{ num: -11n, den: 18n },
			{ num: 17n, den: -24n },
			{ num: 100n, den: 35n },
			{ num: -42n, den: -105n },
		];

		it('matches direct cross-multiplication equality for all sample pairs', () => {
			for (const a of samples) {
				for (const b of samples) {
					const res = addRationalSeries(a, b);
					assertCrossMultMatches(a, b, res);
				}
			}
		});

		it('satisfies commutativity: a + b === b + a', () => {
			for (const a of samples) {
				for (const b of samples) {
					assert.deepStrictEqual(
						addRationalSeries(a, b),
						addRationalSeries(b, a)
					);
				}
			}
		});

		it('satisfies associativity: (a + b) + c === a + (b + c)', () => {
			const subset = samples.slice(0, 8);
			for (const a of subset) {
				for (const b of subset) {
					for (const c of subset) {
						const left = addRationalSeries(addRationalSeries(a, b), c);
						const right = addRationalSeries(a, addRationalSeries(b, c));
						assert.deepStrictEqual(left, right);
					}
				}
			}
		});

		it('reproduces telescoping harmonic series sum(1/(k*(k+1)), k=1..N) === N/(N+1)', () => {
			const N = 150n;
			let acc = { num: 0n, den: 1n };
			for (let k = 1n; k <= N; k++) {
				acc = addRationalSeries(acc, { num: 1n, den: k * (k + 1n) });
				assertCanonical(acc);
				assert.deepStrictEqual(acc, { num: k, den: k + 1n });
			}
		});

		it('reproduces telescoping difference sum(1/k - 1/(k+1), k=1..N) === N/(N+1)', () => {
			const N = 100n;
			let acc = { num: 0n, den: 1n };
			for (let k = 1n; k <= N; k++) {
				const term = addRationalSeries(
					{ num: 1n, den: k },
					{ num: -1n, den: k + 1n }
				);
				acc = addRationalSeries(acc, term);
			}
			assert.deepStrictEqual(acc, { num: N, den: N + 1n });
		});

		it('reproduces telescoping sum(1/(k*(k+2)), k=1..N) === N*(3N+5)/(4*(N+1)*(N+2))', () => {
			const N = 60n;
			let acc = { num: 0n, den: 1n };
			for (let k = 1n; k <= N; k++) {
				acc = addRationalSeries(acc, { num: 1n, den: k * (k + 2n) });
			}
			const expected = addRationalSeries(
				{ num: N * (3n * N + 5n), den: 4n * (N + 1n) * (N + 2n) },
				{ num: 0n, den: 1n }
			);
			assert.deepStrictEqual(acc, expected);
		});

		it('reproduces exact geometric series sum(1/2^k, k=0..80) === (2^81 - 1)/2^80', () => {
			const N = 80n;
			let acc = { num: 0n, den: 1n };
			for (let k = 0n; k <= N; k++) {
				acc = addRationalSeries(acc, { num: 1n, den: 1n << k });
			}
			assert.deepStrictEqual(acc, {
				num: (1n << (N + 1n)) - 1n,
				den: 1n << N,
			});
		});

		it('agrees with floating-point harmonic number H_40 within 1e-13', () => {
			let acc = { num: 0n, den: 1n };
			let fp = 0;
			for (let k = 1; k <= 40; k++) {
				acc = addRationalSeries(acc, { num: 1n, den: BigInt(k) });
				fp += 1 / k;
			}
			assertCanonical(acc);
			// Scale numerator by 10^15 before integer division to convert accurately to Number
			const scaled = (acc.num * 10n ** 15n) / acc.den;
			const exactApprox = Number(scaled) / 1e15;
			assert.ok(
				Math.abs(exactApprox - fp) < 1e-13,
				`expected ${exactApprox} to be close to ${fp}`
			);
		});
	});
});
