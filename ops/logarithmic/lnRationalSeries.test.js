import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lnRationalSeries } from './lnRationalSeries.js';

function gcd(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const t = x % y;
		x = y;
		y = t;
	}
	return x;
}

function addRat(a, b) {
	const num = a.num * b.den + b.num * a.den;
	const den = a.den * b.den;
	if (num === 0n) return { num: 0n, den: 1n };
	const g = gcd(num, den);
	return { num: num / g, den: den / g };
}

function mulIntRat(k, r) {
	const num = k * r.num;
	if (num === 0n) return { num: 0n, den: 1n };
	const g = gcd(num, r.den);
	return { num: num / g, den: r.den / g };
}

/**
 * Convert an exact rational { num, den } to a JS Number without overflow
 * even when num and den exceed Number.MAX_VALUE.
 */
function ratToNumber({ num, den }) {
	if (num === 0n) return 0;
	const sign = num < 0n ? -1 : 1;
	const absNum = num < 0n ? -num : num;
	const scale = 10n ** 18n;
	const scaled = (absNum * scale) / den;
	return sign * (Number(scaled) / 1e18);
}

function assertLowestTerms(r) {
	assert.equal(typeof r, 'object');
	assert.notEqual(r, null);
	assert.equal(typeof r.num, 'bigint');
	assert.equal(typeof r.den, 'bigint');
	assert.ok(r.den > 0n, `expected positive denominator, got ${r.den}`);
	if (r.num === 0n) {
		assert.equal(r.den, 1n);
	} else {
		assert.equal(gcd(r.num, r.den), 1n, `expected reduced rational, got ${r.num}/${r.den}`);
	}
}

describe('lnRationalSeries', () => {
	describe('exact closed-form and normalization', () => {
		it('returns exact 0/1 for x = 1 regardless of representation or terms', () => {
			for (const input of [
				{ num: 1n, den: 1n },
				{ num: 7n, den: 7n },
				{ num: -99n, den: -99n },
				{ num: 2n ** 128n, den: 2n ** 128n },
			]) {
				for (const terms of [1, 5, 12]) {
					const res = lnRationalSeries(input, terms);
					assert.deepEqual(res, { num: 0n, den: 1n });
					assertLowestTerms(res);
				}
			}
		});

		it('produces identical lowest-terms results for unreduced and double-negative inputs', () => {
			const base = lnRationalSeries({ num: 3n, den: 2n });
			assertLowestTerms(base);
			assert.deepEqual(lnRationalSeries({ num: 30n, den: 20n }), base);
			assert.deepEqual(lnRationalSeries({ num: -3n, den: -2n }), base);
			assert.deepEqual(lnRationalSeries({ num: -15n, den: -10n }), base);
		});

		it('matches exact hand-calculated closed form when terms = 1', () => {
			// For x = 2: m = 1, r = 1 => ln_1(2) = 2*(1/5 + 1/7) = 24/35
			assert.deepEqual(lnRationalSeries({ num: 2n, den: 1n }, 1), { num: 24n, den: 35n });
			// For x = 5/4 (in (1/√2, √2)): m = 0, u = (5-4)/(5+4) = 1/9 => 2*(1/9) = 2/9
			assert.deepEqual(lnRationalSeries({ num: 5n, den: 4n }, 1), { num: 2n, den: 9n });
			// For x = 4/5: exact negation -2/9
			assert.deepEqual(lnRationalSeries({ num: 4n, den: 5n }, 1), { num: -2n, den: 9n });
		});
	});

	describe('normal cases and accuracy against Math.log', () => {
		it('accurately computes ln(x) across small, moderate, and large rationals', () => {
			const cases = [
				{ num: 2n, den: 1n },
				{ num: 3n, den: 1n },
				{ num: 10n, den: 1n },
				{ num: 100n, den: 1n },
				{ num: 1n, den: 2n },
				{ num: 1n, den: 10n },
				{ num: 1n, den: 100n },
				{ num: 3n, den: 2n },
				{ num: 2n, den: 3n },
				{ num: 7n, den: 5n },
				{ num: 10n, den: 7n },
				{ num: 355n, den: 113n },
				{ num: 2718281828459045n, den: 1000000000000000n }, // ~e => ln(e) ≈ 1
			];

			for (const q of cases) {
				const res = lnRationalSeries(q);
				assertLowestTerms(res);
				const approx = ratToNumber(res);
				const expected = Math.log(Number(q.num) / Number(q.den));
				const err = Math.abs(approx - expected);
				assert.ok(
					err < 1e-14,
					`ln(${q.num}/${q.den}): got ${approx}, expected ${expected}, err=${err}`,
				);
			}
		});

		it('is strictly monotonic over sorted positive rationals', () => {
			const sorted = [
				{ num: 1n, den: 1000n },
				{ num: 1n, den: 10n },
				{ num: 1n, den: 2n },
				{ num: 7n, den: 10n },
				{ num: 99n, den: 100n },
				{ num: 1n, den: 1n },
				{ num: 101n, den: 100n },
				{ num: 7n, den: 5n },
				{ num: 10n, den: 7n },
				{ num: 2n, den: 1n },
				{ num: 10n, den: 1n },
				{ num: 1000n, den: 1n },
			];

			const values = sorted.map((q) => lnRationalSeries(q));
			for (let i = 1; i < values.length; i++) {
				const prev = values[i - 1];
				const curr = values[i];
				assert.ok(
					prev.num * curr.den < curr.num * prev.den,
					`expected ln(${sorted[i - 1].num}/${sorted[i - 1].den}) < ln(${sorted[i].num}/${sorted[i].den})`,
				);
			}
		});
	});

	describe('exact algebraic identities and independent cross-checks', () => {
		it('satisfies exact antisymmetry ln(1/x) === -ln(x) as exact rationals', () => {
			const samples = [
				{ num: 2n, den: 1n },
				{ num: 3n, den: 2n },
				{ num: 7n, den: 5n },
				{ num: 10n, den: 7n },
				{ num: 17n, den: 12n },
				{ num: 99n, den: 70n },
				{ num: 1000n, den: 3n },
				{ num: 1234567n, den: 891011n },
			];

			for (const { num, den } of samples) {
				const pos = lnRationalSeries({ num, den });
				const inv = lnRationalSeries({ num: den, den: num });
				assertLowestTerms(pos);
				assertLowestTerms(inv);
				assert.deepEqual(inv, { num: -pos.num, den: pos.den });
			}
		});

		it('satisfies exact dyadic scaling ln(2^k * x) === k * ln(2) + ln(x)', () => {
			const ln2 = lnRationalSeries({ num: 2n, den: 1n });
			const base = { num: 5n, den: 3n };
			const lnBase = lnRationalSeries(base);

			for (const k of [-20n, -3n, -1n, 0n, 1n, 5n, 37n]) {
				const scaled = k >= 0n
					? { num: base.num << k, den: base.den }
					: { num: base.num, den: base.den << -k };
				const lhs = lnRationalSeries(scaled);
				const rhs = addRat(mulIntRat(k, ln2), lnBase);
				assert.deepEqual(lhs, rhs);
			}
		});

		it('cross-checks against product and power logarithm identities', () => {
			const a = { num: 7n, den: 3n };
			const b = { num: 11n, den: 5n };
			const ab = { num: a.num * b.num, den: a.den * b.den };

			const lnA = ratToNumber(lnRationalSeries(a));
			const lnB = ratToNumber(lnRationalSeries(b));
			const lnAB = ratToNumber(lnRationalSeries(ab));
			assert.ok(Math.abs(lnAB - (lnA + lnB)) < 1e-15);

			const a5 = { num: a.num ** 5n, den: a.den ** 5n };
			const lnA5 = ratToNumber(lnRationalSeries(a5));
			assert.ok(Math.abs(lnA5 - 5 * lnA) < 1e-14);
		});

		it('cross-checks against independent Mercator series for x in (0, 2)', () => {
			// Independent Mercator series: ln(x) = Σ_{k=1}^M (-1)^(k-1) * (x - 1)^k / k
			function mercator(x, M = 100) {
				const t = x - 1;
				let sum = 0;
				let pow = t;
				for (let k = 1; k <= M; k++) {
					sum += (k % 2 === 1 ? 1 : -1) * (pow / k);
					pow *= t;
				}
				return sum;
			}

			for (const q of [
				{ num: 5n, den: 4n },
				{ num: 4n, den: 5n },
				{ num: 11n, den: 10n },
				{ num: 9n, den: 10n },
			]) {
				const res = ratToNumber(lnRationalSeries(q, 14));
				const ref = mercator(Number(q.num) / Number(q.den), 120);
				assert.ok(Math.abs(res - ref) < 1e-14, `Mercator mismatch for ${q.num}/${q.den}`);
			}
		});

		it('cross-checks against independent Simpson numerical integration of 1/t', () => {
			// ln(x) = ∫_1^x (1/t) dt via composite Simpson's rule
			function simpsonLn(x, n = 4000) {
				const h = (x - 1) / n;
				let sum = 1 + 1 / x;
				for (let i = 1; i < n; i++) {
					const t = 1 + i * h;
					sum += (i % 2 === 0 ? 2 : 4) / t;
				}
				return (h / 3) * sum;
			}

			for (const q of [
				{ num: 5n, den: 1n },
				{ num: 1n, den: 3n },
				{ num: 13n, den: 4n },
			]) {
				const res = ratToNumber(lnRationalSeries(q));
				const ref = simpsonLn(Number(q.num) / Number(q.den));
				assert.ok(Math.abs(res - ref) < 1e-10, `Simpson mismatch for ${q.num}/${q.den}`);
			}
		});

		it('converges to >30 decimal digits of ln(2) in exact BigInt arithmetic', () => {
			// Known 35-digit value of ln(2): 0.69314718055994530941723212145817657
			const known30 = 693147180559945309417232121458n;
			const scale = 10n ** 30n;

			let prevErr = null;
			for (const terms of [2, 5, 10, 15, 25]) {
				const res = lnRationalSeries({ num: 2n, den: 1n }, terms);
				assertLowestTerms(res);
				const scaled = (res.num * scale) / res.den;
				const err = scaled >= known30 ? scaled - known30 : known30 - scaled;
				if (prevErr !== null) {
					assert.ok(err <= prevErr, `expected non-increasing error at terms=${terms}`);
				}
				prevErr = err;
			}

			// At terms = 25, error must be <= 1 ulp at 10^-30
			assert.ok(prevErr <= 1n, `expected <= 1e-30 error at terms=25, got ${prevErr}e-30`);
		});
	});

	describe('edge cases', () => {
		it('handles values very close to 1 without catastrophic cancellation', () => {
			// ln(1 + 10^-9) ≈ 10^-9 - 0.5e-18
			const nearAbove = lnRationalSeries({ num: 1_000_000_001n, den: 1_000_000_000n }, 6);
			assertLowestTerms(nearAbove);
			const scale = 10n ** 27n;
			const scaled = (nearAbove.num * scale) / nearAbove.den;
			// Expected: 1e-9 - 0.5e-18 + (1/3)e-27 => 999_999_999_500_000_000
			const expected = 999_999_999_500_000_000n;
			const diff = scaled > expected ? scaled - expected : expected - scaled;
			assert.ok(diff <= 1n, `unexpected cancellation error: diff=${diff}`);
		});

		it('handles huge and tiny BigInt rationals beyond IEEE 754 float range', () => {
			const ln2 = lnRationalSeries({ num: 2n, den: 1n });

			const huge = lnRationalSeries({ num: 2n ** 1500n, den: 1n });
			assertLowestTerms(huge);
			assert.deepEqual(huge, mulIntRat(1500n, ln2));

			const tiny = lnRationalSeries({ num: 1n, den: 2n ** 1500n });
			assertLowestTerms(tiny);
			assert.deepEqual(tiny, { num: -huge.num, den: huge.den });
		});

		it('handles rationals tightly straddling the √2 and 1/√2 reduction boundaries', () => {
			// Continued-fraction convergents of √2 alternating below and above √2
			const convergents = [
				{ num: 7n, den: 5n },
				{ num: 10n, den: 7n },
				{ num: 17n, den: 12n },
				{ num: 24n, den: 17n },
				{ num: 41n, den: 29n },
				{ num: 58n, den: 41n },
				{ num: 99n, den: 70n },
				{ num: 140n, den: 99n },
			];

			for (const q of convergents) {
				const res = lnRationalSeries(q);
				assertLowestTerms(res);
				const approx = ratToNumber(res);
				const expected = Math.log(Number(q.num) / Number(q.den));
				assert.ok(Math.abs(approx - expected) < 1e-14);

				const inv = lnRationalSeries({ num: q.den, den: q.num });
				assert.deepEqual(inv, { num: -res.num, den: res.den });
			}
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-object or malformed rational inputs', () => {
			for (const bad of [
				null,
				undefined,
				2,
				2n,
				'2/1',
				true,
				[1n, 2n],
				{},
				{ num: 1n },
				{ den: 1n },
				{ num: 1, den: 2 },
				{ num: 1n, den: 2 },
				{ num: 1, den: 2n },
				{ num: '1', den: '2' },
			]) {
				assert.throws(() => lnRationalSeries(bad), TypeError);
			}
		});

		it('throws RangeError for zero denominator or non-positive rationals', () => {
			for (const bad of [
				{ num: 1n, den: 0n },
				{ num: 0n, den: 0n },
				{ num: -1n, den: 0n },
				{ num: 0n, den: 1n },
				{ num: 0n, den: -5n },
				{ num: -1n, den: 1n },
				{ num: 1n, den: -1n },
				{ num: -7n, den: 3n },
				{ num: 7n, den: -3n },
			]) {
				assert.throws(() => lnRationalSeries(bad), RangeError);
			}
		});

		it('throws TypeError or RangeError for invalid terms argument', () => {
			const valid = { num: 2n, den: 1n };

			for (const badType of ['10', 10n, null, {}, true]) {
				assert.throws(() => lnRationalSeries(valid, badType), TypeError);
			}

			for (const badRange of [0, -1, -100, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(() => lnRationalSeries(valid, badRange), RangeError);
			}
		});
	});
});
