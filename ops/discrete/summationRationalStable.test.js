import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summationRationalStable } from './summationRationalStable.js';

/**
 * Independent naive reference GCD for test verification.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function refGcd(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		[x, y] = [y, x % y];
	}
	return x;
}

/**
 * Independent naive sequential left-to-right exact rational summation
 * (unscaled cross-multiplication followed by full GCD reduction).
 * @param {Array<{num: bigint, den: bigint}>} terms
 * @returns {{num: bigint, den: bigint}}
 */
function naiveSequentialSum(terms) {
	let num = 0n;
	let den = 1n;
	for (const t of terms) {
		let tn = t.num;
		let td = t.den;
		if (td < 0n) {
			tn = -tn;
			td = -td;
		}
		num = num * td + tn * den;
		den = den * td;
		if (num === 0n) {
			den = 1n;
		} else {
			const g = refGcd(num, den);
			num /= g;
			den /= g;
		}
	}
	return { num, den };
}

/**
 * Asserts that a rational result is in canonical lowest terms with den > 0n.
 * @param {{num: bigint, den: bigint}} r
 */
function assertCanonical(r) {
	assert.equal(typeof r.num, 'bigint');
	assert.equal(typeof r.den, 'bigint');
	assert.ok(r.den > 0n, `Expected positive denominator, got ${r.den}`);
	if (r.num === 0n) {
		assert.equal(r.den, 1n);
	} else {
		assert.equal(refGcd(r.num, r.den), 1n, `Fraction ${r.num}/${r.den} is not in lowest terms`);
	}
}

describe('summationRationalStable', () => {
	describe('normal series', () => {
		it('computes exact harmonic series H_n', () => {
			const expected = [
				[1, { num: 1n, den: 1n }],
				[2, { num: 3n, den: 2n }],
				[3, { num: 11n, den: 6n }],
				[4, { num: 25n, den: 12n }],
				[5, { num: 137n, den: 60n }],
				[10, { num: 7381n, den: 2520n }],
			];

			for (const [n, exp] of expected) {
				const terms = Array.from({ length: n }, (_, i) => ({ num: 1n, den: BigInt(i + 1) }));
				const res = summationRationalStable(terms);
				assertCanonical(res);
				assert.deepEqual(res, exp);
			}
		});

		it('computes exact alternating harmonic series', () => {
			// 1 - 1/2 + 1/3 - 1/4 + 1/5 - 1/6 = 37/60
			const terms = Array.from({ length: 6 }, (_, i) => ({
				num: i % 2 === 0 ? 1n : -1n,
				den: BigInt(i + 1),
			}));
			const res = summationRationalStable(terms);
			assertCanonical(res);
			assert.deepEqual(res, { num: 37n, den: 60n });
		});

		it('computes exact geometric series sum_{k=0}^{n} (1/2)^k = (2^{n+1} - 1) / 2^n', () => {
			const n = 50;
			const terms = Array.from({ length: n + 1 }, (_, k) => ({
				num: 1n,
				den: 1n << BigInt(k),
			}));
			const res = summationRationalStable(terms);
			assertCanonical(res);
			assert.deepEqual(res, {
				num: (1n << BigInt(n + 1)) - 1n,
				den: 1n << BigInt(n),
			});
		});

		it('supports lazy iterables (generators) and indexed function overload', () => {
			function* harmonicGen(n) {
				for (let k = 1n; k <= n; k += 1n) {
					yield { num: 1n, den: k };
				}
			}

			const fromGen = summationRationalStable(harmonicGen(10n));
			const fromFnNum = summationRationalStable((k) => ({ num: 1n, den: BigInt(k) }), 1, 10);
			const fromFnBig = summationRationalStable((k) => ({ num: 1n, den: k }), 1n, 10n);

			assert.deepEqual(fromGen, { num: 7381n, den: 2520n });
			assert.deepEqual(fromFnNum, { num: 7381n, den: 2520n });
			assert.deepEqual(fromFnBig, { num: 7381n, den: 2520n });
		});
	});

	describe('edge cases', () => {
		it('returns { num: 0n, den: 1n } for empty array, empty iterable, and empty ranges', () => {
			assert.deepEqual(summationRationalStable([]), { num: 0n, den: 1n });
			assert.deepEqual(summationRationalStable(new Set()), { num: 0n, den: 1n });
			assert.deepEqual(
				summationRationalStable((k) => ({ num: 1n, den: BigInt(k) }), 5, 4),
				{ num: 0n, den: 1n },
			);
			assert.deepEqual(
				summationRationalStable((k) => ({ num: 1n, den: k }), 10n, 0n),
				{ num: 0n, den: 1n },
			);
		});

		it('handles single element and does not alias or mutate caller input', () => {
			const input = { num: -6n, den: -9n };
			const terms = [input];
			const res = summationRationalStable(terms);
			assertCanonical(res);
			assert.deepEqual(res, { num: 2n, den: 3n });
			assert.deepEqual(input, { num: -6n, den: -9n });
			assert.notEqual(res, input);
		});

		it('handles zero terms and sums cancelling identically to zero', () => {
			const res1 = summationRationalStable([
				{ num: 0n, den: 7n },
				{ num: 0n, den: -13n },
			]);
			assertCanonical(res1);
			assert.deepEqual(res1, { num: 0n, den: 1n });

			const res2 = summationRationalStable([
				{ num: 5n, den: 12n },
				{ num: -10n, den: 24n },
			]);
			assertCanonical(res2);
			assert.deepEqual(res2, { num: 0n, den: 1n });
		});

		it('preserves exact precision under extreme catastrophic cancellation', () => {
			const huge = 10n ** 120n;
			const tiny = { num: 1n, den: 10n ** 120n + 7n };
			const terms = [
				{ num: huge, den: 3n },
				{ num: huge + 1n, den: 5n },
				tiny,
				{ num: -huge, den: 3n },
				{ num: -(huge + 1n), den: 5n },
			];

			const res = summationRationalStable(terms);
			assertCanonical(res);
			assert.deepEqual(res, tiny);

			// Interleaved large cancelling pairs around a non-trivial small rational sum
			const interleaved = [];
			for (let i = 1n; i <= 25n; i += 1n) {
				interleaved.push({ num: huge * i, den: 7n * i + 1n });
				interleaved.push({ num: 1n, den: i * (i + 1n) });
				interleaved.push({ num: -(huge * i), den: 7n * i + 1n });
			}
			const resInterleaved = summationRationalStable(interleaved);
			assertCanonical(resInterleaved);
			assert.deepEqual(resInterleaved, { num: 25n, den: 26n });
		});

		it('normalizes unreduced fractions and negative denominators', () => {
			// (12 / -18) + (-25 / -30) + (14 / 21) = -2/3 + 5/6 + 2/3 = 5/6
			const res = summationRationalStable([
				{ num: 12n, den: -18n },
				{ num: -25n, den: -30n },
				{ num: 14n, den: 21n },
			]);
			assertCanonical(res);
			assert.deepEqual(res, { num: 5n, den: 6n });
		});

		it('handles safe integer upper boundary in function mode without overflow', () => {
			const max = Number.MAX_SAFE_INTEGER;
			const res = summationRationalStable(() => ({ num: 1n, den: 3n }), max - 2, max);
			assertCanonical(res);
			assert.deepEqual(res, { num: 1n, den: 1n });
		});
	});

	describe('cross-checks against independent computations', () => {
		it('matches closed-form telescoping series sum_{k=1}^{N} 1/(k(k+1)) = N/(N+1)', () => {
			const N = 1500;
			const terms = Array.from({ length: N }, (_, i) => {
				const k = BigInt(i + 1);
				return { num: 1n, den: k * (k + 1n) };
			});
			const res = summationRationalStable(terms);
			assertCanonical(res);
			assert.deepEqual(res, { num: BigInt(N), den: BigInt(N + 1) });
		});

		it('matches closed-form cubic telescoping sum_{k=1}^{N} 2/(k(k+1)(k+2)) = 1/2 - 1/((N+1)(N+2))', () => {
			const N = 600n;
			const res = summationRationalStable(
				(k) => ({ num: 2n, den: k * (k + 1n) * (k + 2n) }),
				1n,
				N,
			);
			assertCanonical(res);

			// Independent closed form: 1/2 - 1/((N+1)(N+2)) = ((N+1)(N+2) - 2) / (2(N+1)(N+2))
			const p = (N + 1n) * (N + 2n);
			const rawNum = p - 2n;
			const rawDen = 2n * p;
			const g = refGcd(rawNum, rawDen);
			assert.deepEqual(res, { num: rawNum / g, den: rawDen / g });
		});

		it('matches naive sequential reference on harmonic, alternating, and pseudo-random inputs', () => {
			// 1) Harmonic H_120
			const harmonic = Array.from({ length: 120 }, (_, i) => ({
				num: 1n,
				den: BigInt(i + 1),
			}));
			const hStable = summationRationalStable(harmonic);
			const hNaive = naiveSequentialSum(harmonic);
			assertCanonical(hStable);
			assert.deepEqual(hStable, hNaive);

			// 2) Alternating series of length 127 (non-power-of-2 bucket boundary)
			const alt = Array.from({ length: 127 }, (_, i) => ({
				num: i % 2 === 0 ? BigInt(i + 3) : -BigInt(i + 3),
				den: BigInt((i + 1) * (i + 2)),
			}));
			const aStable = summationRationalStable(alt);
			const aNaive = naiveSequentialSum(alt);
			assertCanonical(aStable);
			assert.deepEqual(aStable, aNaive);

			// 3) Deterministic LCG pseudo-random rationals with unreduced & negative denominators
			let seed = 0x123456789abcdef1n;
			const mod = 1n << 64n;
			const nextRand = () => {
				seed = (seed * 6364136223846793005n + 1442695040888963407n) % mod;
				return seed;
			};

			const randomTerms = [];
			for (let i = 0; i < 150; i += 1) {
				const r1 = nextRand();
				const r2 = nextRand();
				const signNum = (r1 & 1n) === 0n ? 1n : -1n;
				const signDen = (r2 & 1n) === 0n ? 1n : -1n;
				const scale = (r1 % 11n) + 1n;
				const num = signNum * ((r1 >> 8n) % 1000n) * scale;
				const den = signDen * (((r2 >> 8n) % 500n) + 1n) * scale;
				randomTerms.push({ num, den });
			}

			const rStable = summationRationalStable(randomTerms);
			const rNaive = naiveSequentialSum(randomTerms);
			assertCanonical(rStable);
			assert.deepEqual(rStable, rNaive);
		});
	});

	describe('input validation', () => {
		it('rejects missing, non-iterable, or string top-level inputs', () => {
			assert.throws(() => summationRationalStable(), TypeError);
			assert.throws(() => summationRationalStable(null), TypeError);
			assert.throws(() => summationRationalStable(undefined), TypeError);
			assert.throws(() => summationRationalStable(42), TypeError);
			assert.throws(() => summationRationalStable('1/2'), TypeError);
			assert.throws(() => summationRationalStable({ num: 1n, den: 2n }), TypeError);
			assert.throws(() => summationRationalStable([], 0, 1), TypeError);
		});

		it('rejects malformed rational terms and zero denominators', () => {
			assert.throws(() => summationRationalStable([null]), TypeError);
			assert.throws(() => summationRationalStable([1]), TypeError);
			assert.throws(() => summationRationalStable([{ num: 1, den: 2n }]), TypeError);
			assert.throws(() => summationRationalStable([{ num: 1n, den: 2 }]), TypeError);
			assert.throws(() => summationRationalStable([{ num: 1n }]), TypeError);
			assert.throws(() => summationRationalStable([{ num: 1n, den: 0n }]), RangeError);
			assert.throws(() => summationRationalStable([{ num: 0n, den: 0n }]), RangeError);
		});

		it('rejects invalid arguments in function mode', () => {
			const fn = (k) => ({ num: 1n, den: BigInt(k) });
			assert.throws(() => summationRationalStable(fn), TypeError);
			assert.throws(() => summationRationalStable(fn, 1), TypeError);
			assert.throws(() => summationRationalStable(fn, 1, 5n), TypeError);
			assert.throws(() => summationRationalStable(fn, 1n, 5), TypeError);
			assert.throws(() => summationRationalStable(fn, '1', '5'), TypeError);
			assert.throws(() => summationRationalStable(fn, 1.5, 5), RangeError);
			assert.throws(() => summationRationalStable(fn, 1, Number.POSITIVE_INFINITY), RangeError);
			assert.throws(() => summationRationalStable(fn, 1, Number.NaN), RangeError);
			assert.throws(() => summationRationalStable(fn, 1, Number.MAX_SAFE_INTEGER + 1), RangeError);
			assert.throws(() => summationRationalStable(() => ({ num: 1n, den: 0n }), 1, 1), RangeError);
		});
	});
});
