import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { multiplyRationalSeries } from './multiplyRationalSeries.js';

function absBig(x) {
	return x < 0n ? -x : x;
}

function refGcd(a, b) {
	let x = absBig(a);
	let y = absBig(b);
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
			`expected lowest terms, got ${r.num}/${r.den}`
		);
	}
}

function factorial(n) {
	let acc = 1n;
	for (let i = 2n; i <= n; i++) {
		acc *= i;
	}
	return acc;
}

describe('multiplyRationalSeries', () => {
	describe('normal cases', () => {
		it('multiplies coprime positive rationals', () => {
			assert.deepEqual(
				multiplyRationalSeries({ num: 2n, den: 3n }, { num: 5n, den: 7n }),
				{ num: 10n, den: 21n }
			);
		});

		it('performs cross-cancellation into lowest terms', () => {
			assert.deepEqual(
				multiplyRationalSeries({ num: 3n, den: 8n }, { num: 4n, den: 9n }),
				{ num: 1n, den: 6n }
			);
			assert.deepEqual(
				multiplyRationalSeries({ num: 14n, den: 15n }, { num: 25n, den: 21n }),
				{ num: 10n, den: 9n }
			);
		});

		it('handles multiplicative identity 1/1 and -1/1', () => {
			const q = { num: 17n, den: 23n };
			assert.deepEqual(multiplyRationalSeries(q, { num: 1n, den: 1n }), q);
			assert.deepEqual(multiplyRationalSeries({ num: 1n, den: 1n }, q), q);
			assert.deepEqual(multiplyRationalSeries(q, { num: -1n, den: 1n }), {
				num: -17n,
				den: 23n,
			});
		});

		it('multiplies integer rationals', () => {
			assert.deepEqual(
				multiplyRationalSeries({ num: 6n, den: 1n }, { num: 7n, den: 1n }),
				{ num: 42n, den: 1n }
			);
		});
	});

	describe('zero multiplication', () => {
		it('returns canonical {num: 0n, den: 1n} when either or both operands are zero', () => {
			assert.deepEqual(
				multiplyRationalSeries({ num: 0n, den: 1n }, { num: 5n, den: 7n }),
				{ num: 0n, den: 1n }
			);
			assert.deepEqual(
				multiplyRationalSeries({ num: 5n, den: 7n }, { num: 0n, den: 1n }),
				{ num: 0n, den: 1n }
			);
			assert.deepEqual(
				multiplyRationalSeries({ num: 0n, den: -9n }, { num: 0n, den: 42n }),
				{ num: 0n, den: 1n }
			);
			assert.deepEqual(
				multiplyRationalSeries({ num: 0n, den: 13n }, { num: -8n, den: -4n }),
				{ num: 0n, den: 1n }
			);
		});
	});

	describe('negative signs in numerator and denominator', () => {
		it('normalizes negative denominators and resolves sign combinations', () => {
			assert.deepEqual(
				multiplyRationalSeries({ num: -2n, den: 3n }, { num: 5n, den: 7n }),
				{ num: -10n, den: 21n }
			);
			assert.deepEqual(
				multiplyRationalSeries({ num: 2n, den: -3n }, { num: 5n, den: 7n }),
				{ num: -10n, den: 21n }
			);
			assert.deepEqual(
				multiplyRationalSeries({ num: -2n, den: -3n }, { num: 5n, den: 7n }),
				{ num: 10n, den: 21n }
			);
			assert.deepEqual(
				multiplyRationalSeries({ num: 2n, den: -3n }, { num: -5n, den: 7n }),
				{ num: 10n, den: 21n }
			);
			assert.deepEqual(
				multiplyRationalSeries({ num: -2n, den: -3n }, { num: -5n, den: -7n }),
				{ num: 10n, den: 21n }
			);
			assert.deepEqual(
				multiplyRationalSeries({ num: -6n, den: 15n }, { num: 10n, den: -4n }),
				{ num: 1n, den: 1n }
			);
		});
	});

	describe('unreduced inputs and immutability', () => {
		it('reduces unreduced inputs and does not mutate input objects', () => {
			const a = Object.freeze({ num: 12n, den: 18n });
			const b = Object.freeze({ num: -25n, den: -15n });
			const res = multiplyRationalSeries(a, b);
			assertCanonical(res);
			assert.deepEqual(res, { num: 10n, den: 9n });
			assert.deepEqual(a, { num: 12n, den: 18n });
			assert.deepEqual(b, { num: -25n, den: -15n });
		});

		it('handles unreduced inputs with large shared factors', () => {
			const k = 9876543210987654321n;
			const res = multiplyRationalSeries(
				{ num: 3n * k, den: 7n * k },
				{ num: 14n * k, den: 9n * k }
			);
			assert.deepEqual(res, { num: 2n, den: 3n });
		});
	});

	describe('reciprocals', () => {
		it('multiplies reciprocals to {num: 1n, den: 1n}', () => {
			const cases = [
				{ num: 7n, den: 13n },
				{ num: -19n, den: 4n },
				{ num: 12n, den: -30n },
				{ num: -1000000000000000003n, den: -999999999999999989n },
			];
			for (const q of cases) {
				const recip = { num: q.den, den: q.num };
				assert.deepEqual(multiplyRationalSeries(q, recip), {
					num: 1n,
					den: 1n,
				});
			}
		});
	});

	describe('huge BigInts', () => {
		it('handles multi-hundred-bit rationals accurately with cross-cancellation', () => {
			const p1 = (1n << 256n) + 297n;
			const p2 = (1n << 256n) + 617n;
			const common = (1n << 300n) + 123456789n;
			const a = { num: p1 * common, den: p2 };
			const b = { num: p2, den: common };
			const res = multiplyRationalSeries(a, b);
			assertCanonical(res);
			assert.deepEqual(res, { num: p1, den: 1n });
		});

		it('handles products of large coprime powers without precision loss', () => {
			const a = { num: 3n ** 120n, den: 5n ** 110n };
			const b = { num: 5n ** 100n, den: 3n ** 115n };
			const res = multiplyRationalSeries(a, b);
			assertCanonical(res);
			assert.deepEqual(res, { num: 3n ** 5n, den: 5n ** 10n });
		});
	});

	describe('invalid input validation', () => {
		it('throws TypeError for non-object or array operands', () => {
			const valid = { num: 1n, den: 2n };
			const invalidObjs = [
				undefined,
				null,
				42,
				42n,
				'1/2',
				true,
				Symbol('r'),
				[1n, 2n],
				() => {},
			];
			for (const bad of invalidObjs) {
				assert.throws(() => multiplyRationalSeries(bad, valid), TypeError);
				assert.throws(() => multiplyRationalSeries(valid, bad), TypeError);
			}
		});

		it('throws TypeError when num or den is not a BigInt', () => {
			const valid = { num: 1n, den: 2n };
			const invalidRationals = [
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
			for (const bad of invalidRationals) {
				assert.throws(() => multiplyRationalSeries(bad, valid), TypeError);
				assert.throws(() => multiplyRationalSeries(valid, bad), TypeError);
			}
		});

		it('throws RangeError when denominator is 0n (including when other operand is zero)', () => {
			assert.throws(
				() => multiplyRationalSeries({ num: 1n, den: 0n }, { num: 2n, den: 3n }),
				RangeError
			);
			assert.throws(
				() => multiplyRationalSeries({ num: 2n, den: 3n }, { num: 1n, den: 0n }),
				RangeError
			);
			assert.throws(
				() => multiplyRationalSeries({ num: 0n, den: 1n }, { num: 5n, den: 0n }),
				RangeError
			);
			assert.throws(
				() => multiplyRationalSeries({ num: 0n, den: 0n }, { num: 0n, den: 1n }),
				RangeError
			);
		});

		it('still validates second operand when first operand is zero', () => {
			assert.throws(
				() => multiplyRationalSeries({ num: 0n, den: 1n }, null),
				TypeError
			);
		});
	});

	describe('cross-checks and algebraic identities', () => {
		it('matches direct (a.num*b.num)/(a.den*b.den) cross-multiplication across a grid', () => {
			const nums = [-12n, -7n, -3n, -1n, 0n, 1n, 2n, 6n, 15n];
			const dens = [-10n, -6n, -1n, 1n, 4n, 9n, 14n];
			const samples = [];
			for (const num of nums) {
				for (const den of dens) {
					samples.push({ num, den });
				}
			}

			for (let i = 0; i < samples.length; i += 3) {
				for (let j = 0; j < samples.length; j += 5) {
					const a = samples[i];
					const b = samples[j];
					const prod = multiplyRationalSeries(a, b);
					assertCanonical(prod);
					assert.equal(
						prod.num * (a.den * b.den),
						a.num * b.num * prod.den
					);
				}
			}
		});

		it('satisfies commutativity and associativity', () => {
			const triples = [
				[
					{ num: 6n, den: 15n },
					{ num: -10n, den: 21n },
					{ num: 14n, den: -8n },
				],
				[
					{ num: 0n, den: 5n },
					{ num: 17n, den: -3n },
					{ num: -9n, den: 4n },
				],
				[
					{ num: 123456789012345n, den: 98765432109876n },
					{ num: -49382716054938n, den: 24691357802469n },
					{ num: 11111111111111n, den: 33333333333333n },
				],
			];

			for (const [a, b, c] of triples) {
				assert.deepEqual(
					multiplyRationalSeries(a, b),
					multiplyRationalSeries(b, a)
				);
				assert.deepEqual(
					multiplyRationalSeries(multiplyRationalSeries(a, b), c),
					multiplyRationalSeries(a, multiplyRationalSeries(b, c))
				);
			}
		});

		it('satisfies telescoping rational product identities', () => {
			// Identity 1: prod_{k=1..N} k / (k + 1) = 1 / (N + 1)
			const N1 = 100n;
			let acc1 = { num: 1n, den: 1n };
			for (let k = 1n; k <= N1; k++) {
				acc1 = multiplyRationalSeries(acc1, { num: k, den: k + 1n });
			}
			assert.deepEqual(acc1, { num: 1n, den: N1 + 1n });

			// Identity 2: prod_{k=2..N} (k^2 - 1) / k^2 = (N + 1) / (2N)
			const N2 = 80n;
			let acc2 = { num: 1n, den: 1n };
			for (let k = 2n; k <= N2; k++) {
				acc2 = multiplyRationalSeries(acc2, {
					num: k * k - 1n,
					den: k * k,
				});
			}
			const expectedNum = N2 + 1n;
			const expectedDen = 2n * N2;
			const g = refGcd(expectedNum, expectedDen);
			assert.deepEqual(acc2, {
				num: expectedNum / g,
				den: expectedDen / g,
			});
		});

		it('satisfies the exact Wallis product identity and bounds pi/2', () => {
			// W_N = prod_{k=1..N} (2k)^2 / ((2k - 1)(2k + 1))
			// Closed form: W_N = (2^(4N) * (N!)^4) / (((2N)!)^2 * (2N + 1))
			const N = 25n;
			let wallis = { num: 1n, den: 1n };
			for (let k = 1n; k <= N; k++) {
				const term = {
					num: 4n * k * k,
					den: (2n * k - 1n) * (2n * k + 1n),
				};
				wallis = multiplyRationalSeries(wallis, term);
			}
			assertCanonical(wallis);

			const factN = factorial(N);
			const fact2N = factorial(2n * N);
			const closedNum = (1n << (4n * N)) * factN ** 4n;
			const closedDen = fact2N ** 2n * (2n * N + 1n);
			const g = refGcd(closedNum, closedDen);
			assert.deepEqual(wallis, {
				num: closedNum / g,
				den: closedDen / g,
			});

			// Floating-point check: 2 * W_N < pi < 2 * W_N * (2N + 1) / (2N)
			const scale = 10n ** 12n;
			const twoW = Number((2n * wallis.num * scale) / wallis.den) / 1e12;
			const upper =
				(twoW * Number(2n * N + 1n)) / Number(2n * N);
			assert.ok(twoW < Math.PI && Math.PI < upper);
		});
	});
});
