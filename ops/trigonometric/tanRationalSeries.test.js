import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { tanRationalSeries } from './tanRationalSeries.js';

function gcd(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const r = x % y;
		x = y;
		y = r;
	}
	return x;
}

function assertCanonicalRational(r) {
	assert.equal(typeof r, 'object');
	assert.notEqual(r, null);
	assert.equal(typeof r.num, 'bigint');
	assert.equal(typeof r.den, 'bigint');
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`);
	if (r.num === 0n) {
		assert.equal(r.den, 1n, `expected zero to have den === 1n, got ${r.den}`);
	} else {
		assert.equal(gcd(r.num, r.den), 1n, `expected lowest terms for ${r.num}/${r.den}`);
	}
}

function rationalToNumber({ num, den }) {
	const sign = num < 0n ? -1 : 1;
	const absNum = num < 0n ? -num : num;
	const intPart = absNum / den;
	const rem = absNum % den;
	const SCALE = 10n ** 18n;
	const fracPart = Number((rem * SCALE) / den) / 1e18;
	return sign * (Number(intPart) + fracPart);
}

// Independent exact rational helpers for cross-checks
function ratNorm(num, den) {
	if (den === 0n) throw new RangeError('zero den');
	if (num === 0n) return { num: 0n, den: 1n };
	let n = num;
	let d = den;
	if (d < 0n) {
		n = -n;
		d = -d;
	}
	const g = gcd(n, d);
	return { num: n / g, den: d / g };
}

function ratAdd(a, b) {
	return ratNorm(a.num * b.den + b.num * a.den, a.den * b.den);
}

function ratSub(a, b) {
	return ratNorm(a.num * b.den - b.num * a.den, a.den * b.den);
}

function ratMul(a, b) {
	return ratNorm(a.num * b.num, a.den * b.den);
}

function ratDiv(a, b) {
	return ratNorm(a.num * b.den, a.den * b.num);
}

function factorial(n) {
	let f = 1n;
	for (let i = 2n; i <= BigInt(n); i++) f *= i;
	return f;
}

function ratPow(r, exp) {
	let res = { num: 1n, den: 1n };
	for (let i = 0; i < exp; i++) {
		res = ratMul(res, r);
	}
	return res;
}

// Independent naive forward-sum Maclaurin sin/cos ratio
function naiveTanSeries(x, terms) {
	let sinSum = { num: 0n, den: 1n };
	let cosSum = { num: 0n, den: 1n };
	for (let k = 0; k < terms; k++) {
		const sign = k % 2 === 0 ? 1n : -1n;
		const sinPow = ratPow(x, 2 * k + 1);
		const sinTerm = ratNorm(sign * sinPow.num, sinPow.den * factorial(2 * k + 1));
		sinSum = ratAdd(sinSum, sinTerm);

		const cosPow = ratPow(x, 2 * k);
		const cosTerm = ratNorm(sign * cosPow.num, cosPow.den * factorial(2 * k));
		cosSum = ratAdd(cosSum, cosTerm);
	}
	return ratDiv(sinSum, cosSum);
}

describe('tanRationalSeries', () => {
	describe('normal cases and canonical lowest terms', () => {
		test('matches exact hand-computed closed forms for small term counts', () => {
			// terms = 1: tan_1(x) = x / 1 = x
			const t1 = tanRationalSeries({ num: 3n, den: 5n }, 1);
			assertCanonicalRational(t1);
			assert.deepEqual(t1, { num: 3n, den: 5n });

			// terms = 2, x = 1: sin_2(1) = 5/6, cos_2(1) = 1/2 => 5/3
			const t2One = tanRationalSeries({ num: 1n, den: 1n }, 2);
			assertCanonicalRational(t2One);
			assert.deepEqual(t2One, { num: 5n, den: 3n });

			// terms = 2, x = 1/2: sin_2(1/2) = 23/48, cos_2(1/2) = 7/8 => 23/42
			const t2Half = tanRationalSeries({ num: 1n, den: 2n }, 2);
			assertCanonicalRational(t2Half);
			assert.deepEqual(t2Half, { num: 23n, den: 42n });

			// terms = 3, x = 1: sin_3(1) = 101/120, cos_3(1) = 13/24 => 101/65
			const t3One = tanRationalSeries({ num: 1n, den: 1n }, 3);
			assertCanonicalRational(t3One);
			assert.deepEqual(t3One, { num: 101n, den: 65n });
		});

		test('default terms parameter equals 10', () => {
			const x = { num: 3n, den: 7n };
			const defResult = tanRationalSeries(x);
			const explicitResult = tanRationalSeries(x, 10);
			assertCanonicalRational(defResult);
			assert.deepEqual(defResult, explicitResult);
		});

		test('normalizes unreduced inputs and negative denominators', () => {
			const canonical = tanRationalSeries({ num: -1n, den: 2n }, 8);
			const unreduced = tanRationalSeries({ num: -6n, den: 12n }, 8);
			const negDen = tanRationalSeries({ num: 3n, den: -6n }, 8);
			assertCanonicalRational(canonical);
			assert.deepEqual(unreduced, canonical);
			assert.deepEqual(negDen, canonical);
		});
	});

	describe('edge cases', () => {
		test('returns canonical zero { num: 0n, den: 1n } for any zero input', () => {
			const zeroInputs = [
				{ num: 0n, den: 1n },
				{ num: 0n, den: 99n },
				{ num: 0n, den: -7n },
			];
			for (const z of zeroInputs) {
				for (const terms of [1, 5, 10]) {
					const res = tanRationalSeries(z, terms);
					assertCanonicalRational(res);
					assert.deepEqual(res, { num: 0n, den: 1n });
				}
			}
		});

		test('satisfies exact odd symmetry tan(-x) === -tan(x)', () => {
			const samples = [
				{ num: 1n, den: 1n },
				{ num: 1n, den: 3n },
				{ num: 7n, den: 5n },
				{ num: 11n, den: 4n },
			];
			for (const x of samples) {
				for (const terms of [1, 4, 10]) {
					const pos = tanRationalSeries(x, terms);
					const neg = tanRationalSeries({ num: -x.num, den: x.den }, terms);
					assertCanonicalRational(pos);
					assertCanonicalRational(neg);
					assert.deepEqual(neg, { num: -pos.num, den: pos.den });
				}
			}
		});

		test('handles very small inputs accurately', () => {
			const x = { num: 1n, den: 1000000n };
			const res = tanRationalSeries(x, 6);
			assertCanonicalRational(res);
			const approx = rationalToNumber(res);
			assert.ok(Math.abs(approx - Math.tan(1e-6)) < 1e-15);
		});

		test('handles inputs close to the pole at pi/2 on both sides', () => {
			// Just below pi/2 (~1.57079632679): tan(1.57) ~ +1255.7655915007897
			const belowPole = tanRationalSeries({ num: 157n, den: 100n }, 15);
			assertCanonicalRational(belowPole);
			const belowVal = rationalToNumber(belowPole);
			const expectedBelow = Math.tan(1.57);
			assert.ok(
				Math.abs(belowVal - expectedBelow) / Math.abs(expectedBelow) < 1e-12,
				`below pole mismatch: got ${belowVal}, expected ${expectedBelow}`
			);

			// Just above pi/2: 355/226 = 1.5707964601769912 > pi/2, tan(355/226) ~ -7497258.185...
			const abovePole = tanRationalSeries({ num: 355n, den: 226n }, 15);
			assertCanonicalRational(abovePole);
			assert.ok(abovePole.num < 0n, 'expected negative tangent just above pi/2');
			const aboveVal = rationalToNumber(abovePole);
			const expectedAbove = Math.tan(355 / 226);
			assert.ok(
				Math.abs(aboveVal - expectedAbove) / Math.abs(expectedAbove) < 1e-9,
				`above pole mismatch: got ${aboveVal}, expected ${expectedAbove}`
			);
		});

		test('converges beyond |x| >= pi/2 where the Bernoulli series diverges', () => {
			const samples = [
				{ num: 2n, den: 1n },
				{ num: -5n, den: 2n },
				{ num: 3n, den: 1n },
			];
			for (const x of samples) {
				const res = tanRationalSeries(x, 18);
				assertCanonicalRational(res);
				const approx = rationalToNumber(res);
				const expected = Math.tan(Number(x.num) / Number(x.den));
				assert.ok(
					Math.abs(approx - expected) < 1e-12,
					`mismatch for ${x.num}/${x.den}: got ${approx}, expected ${expected}`
				);
			}
		});

		test('improves accuracy monotonically as terms increase', () => {
			const x = { num: 1n, den: 1n };
			const target = Math.tan(1);
			const errors = [2, 4, 6, 10].map((n) => {
				const res = tanRationalSeries(x, n);
				assertCanonicalRational(res);
				return Math.abs(rationalToNumber(res) - target);
			});
			for (let i = 1; i < errors.length; i++) {
				assert.ok(
					errors[i] < errors[i - 1],
					`expected error to decrease: ${errors[i]} vs ${errors[i - 1]}`
				);
			}
		});
	});

	describe('input validation', () => {
		test('throws TypeError for non-object or malformed x', () => {
			const badInputs = [
				null,
				undefined,
				0,
				1.5,
				'1/2',
				[1n, 2n],
				{},
				{ num: 1n },
				{ den: 2n },
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: '1', den: '2' },
			];
			for (const bad of badInputs) {
				assert.throws(() => tanRationalSeries(bad), TypeError);
			}
		});

		test('throws RangeError for zero denominator in x', () => {
			assert.throws(() => tanRationalSeries({ num: 1n, den: 0n }), RangeError);
			assert.throws(() => tanRationalSeries({ num: 0n, den: 0n }), RangeError);
			assert.throws(() => tanRationalSeries({ num: -5n, den: 0n }), RangeError);
		});

		test('throws TypeError for non-number terms', () => {
			const x = { num: 1n, den: 2n };
			for (const badTerms of ['10', 10n, null, {}, true]) {
				assert.throws(() => tanRationalSeries(x, badTerms), TypeError);
			}
		});

		test('throws RangeError for non-positive, non-integer, or non-safe-integer terms', () => {
			const x = { num: 1n, den: 2n };
			for (const badTerms of [0, -1, -100, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(() => tanRationalSeries(x, badTerms), RangeError);
			}
		});
	});

	describe('independent cross-checks', () => {
		test('matches Math.tan across a broad range of rationals', () => {
			const testCases = [
				{ num: -4n, den: 3n },
				{ num: -1n, den: 1n },
				{ num: -3n, den: 4n },
				{ num: -1n, den: 5n },
				{ num: 1n, den: 7n },
				{ num: 1n, den: 2n },
				{ num: 3n, den: 4n },
				{ num: 1n, den: 1n },
				{ num: 6n, den: 5n },
			];
			for (const x of testCases) {
				const res = tanRationalSeries(x, 12);
				assertCanonicalRational(res);
				const approx = rationalToNumber(res);
				const expected = Math.tan(Number(x.num) / Number(x.den));
				assert.ok(
					Math.abs(approx - expected) < 1e-14,
					`Math.tan mismatch at ${x.num}/${x.den}: got ${approx}, expected ${expected}`
				);
			}
		});

		test('satisfies tangent double-angle identity tan(2x) = 2*tan(x) / (1 - tan(x)^2)', () => {
			const one = { num: 1n, den: 1n };
			const two = { num: 2n, den: 1n };
			const tolDen = 10n ** 18n; // exact rational tolerance: 10^-18

			const angles = [
				{ num: 1n, den: 10n },
				{ num: 1n, den: 4n },
				{ num: 1n, den: 3n },
				{ num: -2n, den: 5n },
				{ num: 1n, den: 2n },
			];

			for (const x of angles) {
				const twoX = { num: 2n * x.num, den: x.den };
				const tanX = tanRationalSeries(x, 16);
				const tan2X = tanRationalSeries(twoX, 16);
				assertCanonicalRational(tanX);
				assertCanonicalRational(tan2X);

				// RHS = (2 * tan(x)) / (1 - tan(x)^2) in exact rationals
				const numerator = ratMul(two, tanX);
				const denominator = ratSub(one, ratMul(tanX, tanX));
				const rhs = ratDiv(numerator, denominator);

				const diff = ratSub(tan2X, rhs);
				const absDiffNum = diff.num < 0n ? -diff.num : diff.num;
				assert.ok(
					absDiffNum * tolDen < diff.den,
					`double-angle identity residual too large at ${x.num}/${x.den}: ${rationalToNumber(diff)}`
				);
			}
		});

		test('matches independent naive Maclaurin summation bit-for-bit', () => {
			const cases = [
				{ x: { num: 1n, den: 3n }, terms: 5 },
				{ x: { num: -2n, den: 5n }, terms: 6 },
				{ x: { num: 7n, den: 4n }, terms: 7 },
				{ x: { num: 1n, den: 1n }, terms: 8 },
			];
			for (const { x, terms } of cases) {
				const actual = tanRationalSeries(x, terms);
				const expected = naiveTanSeries(x, terms);
				assertCanonicalRational(actual);
				assert.deepEqual(actual, expected);
			}
		});
	});
});
