import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cosRationalSeries } from './cosRationalSeries.js';

function absBigInt(n) {
	return n < 0n ? -n : n;
}

function gcd(a, b) {
	let x = absBigInt(a);
	let y = absBigInt(b);
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
		assert.equal(r.den, 1n, `zero must have den === 1n, got ${r.den}`);
	} else {
		assert.equal(gcd(r.num, r.den), 1n, `expected lowest terms for ${r.num}/${r.den}`);
	}
}

function rationalToNumber(r) {
	const scale = 10n ** 18n;
	const scaled = (r.num * scale) / r.den;
	return Number(scaled) / 1e18;
}

function addRat(a, b) {
	const num = a.num * b.den + b.num * a.den;
	const den = a.den * b.den;
	if (num === 0n) return { num: 0n, den: 1n };
	const g = gcd(num, den);
	const sign = den < 0n ? -1n : 1n;
	return { num: (sign * num) / g, den: (sign * den) / g };
}

function subRat(a, b) {
	return addRat(a, { num: -b.num, den: b.den });
}

function mulRat(a, b) {
	const num = a.num * b.num;
	const den = a.den * b.den;
	if (num === 0n) return { num: 0n, den: 1n };
	const g = gcd(num, den);
	const sign = den < 0n ? -1n : 1n;
	return { num: (sign * num) / g, den: (sign * den) / g };
}

function absRatLessThan(r, boundNum, boundDen) {
	return absBigInt(r.num) * boundDen < boundNum * r.den;
}

function factorial(n) {
	let res = 1n;
	for (let i = 2n; i <= BigInt(n); i++) {
		res *= i;
	}
	return res;
}

/**
 * Independent direct Maclaurin summation for cos(x) using explicit powers and factorials.
 */
function naiveCosSeries(x, terms) {
	let acc = { num: 0n, den: 1n };
	for (let k = 0; k < terms; k++) {
		const exp = BigInt(2 * k);
		const sign = k % 2 === 0 ? 1n : -1n;
		const termNum = sign * (x.num ** exp);
		const termDen = (x.den ** exp) * factorial(2 * k);
		acc = addRat(acc, { num: termNum, den: termDen });
	}
	return acc;
}

/**
 * Independent rational Maclaurin summation for sin(x) for Pythagorean identity cross-check.
 */
function naiveSinSeries(x, terms) {
	let acc = { num: 0n, den: 1n };
	for (let k = 0; k < terms; k++) {
		const exp = BigInt(2 * k + 1);
		const sign = k % 2 === 0 ? 1n : -1n;
		const termNum = sign * (x.num ** exp);
		const termDen = (x.den ** exp) * factorial(2 * k + 1);
		acc = addRat(acc, { num: termNum, den: termDen });
	}
	return acc;
}

describe('cosRationalSeries', () => {
	describe('normal cases and exact partial sums', () => {
		it('computes exact hand-verified Maclaurin partial sums for x = 1', () => {
			const one = { num: 1n, den: 1n };
			const expected = [
				[1, { num: 1n, den: 1n }],
				[2, { num: 1n, den: 2n }],
				[3, { num: 13n, den: 24n }],
				[4, { num: 389n, den: 720n }],
				[5, { num: 4357n, den: 8064n }],
			];

			for (const [terms, exp] of expected) {
				const res = cosRationalSeries(one, terms);
				assertCanonicalRational(res);
				assert.deepEqual(res, exp);
			}
		});

		it('computes exact partial sums for fractional and negative-output rationals', () => {
			// x = 1/2, terms = 4: 1 - 1/8 + 1/384 - 1/46080 = 40439/46080
			const halfRes = cosRationalSeries({ num: 1n, den: 2n }, 4);
			assertCanonicalRational(halfRes);
			assert.deepEqual(halfRes, { num: 40439n, den: 46080n });

			// x = 2, terms = 3: 1 - 4/2 + 16/24 = -1/3
			const twoRes = cosRationalSeries({ num: 2n, den: 1n }, 3);
			assertCanonicalRational(twoRes);
			assert.deepEqual(twoRes, { num: -1n, den: 3n });
		});

		it('uses terms = 10 by default', () => {
			const x = { num: 3n, den: 7n };
			const defaultRes = cosRationalSeries(x);
			const explicitRes = cosRationalSeries(x, 10);
			assertCanonicalRational(defaultRes);
			assert.deepEqual(defaultRes, explicitRes);
		});

		it('normalizes unreduced inputs and negative denominators without mutating input', () => {
			const canonical = cosRationalSeries({ num: 1n, den: 2n }, 8);
			const variants = [
				{ num: 3n, den: 6n },
				{ num: -3n, den: -6n },
				{ num: 3n, den: -6n },
				{ num: -5n, den: 10n },
			];

			for (const v of variants) {
				const snapshot = { num: v.num, den: v.den };
				const res = cosRationalSeries(v, 8);
				assertCanonicalRational(res);
				assert.deepEqual(res, canonical);
				assert.deepEqual(v, snapshot);
			}
		});
	});

	describe('edge cases', () => {
		it('returns exact { num: 1n, den: 1n } for x = 0 with any denominator sign or terms', () => {
			const zeros = [
				{ num: 0n, den: 1n },
				{ num: 0n, den: 5n },
				{ num: 0n, den: -13n },
			];

			for (const z of zeros) {
				for (const terms of [1, 2, 10, 40]) {
					const res = cosRationalSeries(z, terms);
					assertCanonicalRational(res);
					assert.deepEqual(res, { num: 1n, den: 1n });
				}
			}
		});

		it('returns exact { num: 1n, den: 1n } when terms = 1 for any valid x', () => {
			const inputs = [
				{ num: 0n, den: 1n },
				{ num: 1n, den: 100n },
				{ num: -999n, den: 7n },
				{ num: 10n ** 20n, den: 3n },
			];

			for (const x of inputs) {
				const res = cosRationalSeries(x, 1);
				assertCanonicalRational(res);
				assert.deepEqual(res, { num: 1n, den: 1n });
			}
		});

		it('satisfies exact evenness cos(-x) === cos(x)', () => {
			const samples = [
				{ num: 1n, den: 3n },
				{ num: 7n, den: 5n },
				{ num: 22n, den: 7n },
				{ num: 113n, den: 355n },
			];

			for (const x of samples) {
				const negX = { num: -x.num, den: x.den };
				const posRes = cosRationalSeries(x, 12);
				const negRes = cosRationalSeries(negX, 12);
				assertCanonicalRational(posRes);
				assertCanonicalRational(negRes);
				assert.deepEqual(negRes, posRes);
			}
		});

		it('handles larger angles accurately with sufficient terms', () => {
			// x = 355/113 ≈ pi => cos(pi) = -1
			const nearPi = cosRationalSeries({ num: 355n, den: 113n }, 18);
			assertCanonicalRational(nearPi);
			assert.ok(Math.abs(rationalToNumber(nearPi) - Math.cos(355 / 113)) < 1e-14);
			assert.ok(Math.abs(rationalToNumber(nearPi) - (-1)) < 1e-12);

			// x = 355/226 ≈ pi/2 => cos(pi/2) ≈ 0
			const nearHalfPi = cosRationalSeries({ num: 355n, den: 226n }, 14);
			assertCanonicalRational(nearHalfPi);
			assert.ok(Math.abs(rationalToNumber(nearHalfPi) - Math.cos(355 / 226)) < 1e-14);

			// x = 10 with 30 terms
			const atTen = cosRationalSeries({ num: 10n, den: 1n }, 30);
			assertCanonicalRational(atTen);
			assert.ok(Math.abs(rationalToNumber(atTen) - Math.cos(10)) < 1e-14);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-object or malformed x', () => {
			const invalidXs = [
				null,
				undefined,
				0,
				1.5,
				1n,
				'1/2',
				true,
				[1n, 2n],
				{},
				{ num: 1n },
				{ den: 1n },
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: '1', den: '2' },
				{ num: null, den: 1n },
			];

			for (const badX of invalidXs) {
				assert.throws(
					() => cosRationalSeries(badX),
					{ name: 'TypeError' },
					`expected TypeError for x = ${String(badX)}`
				);
			}
		});

		it('throws RangeError when x.den is zero', () => {
			assert.throws(() => cosRationalSeries({ num: 1n, den: 0n }), { name: 'RangeError' });
			assert.throws(() => cosRationalSeries({ num: 0n, den: 0n }), { name: 'RangeError' });
		});

		it('throws TypeError for non-number terms', () => {
			const x = { num: 1n, den: 2n };
			for (const badTerms of [null, '10', 10n, true, {}, []]) {
				assert.throws(
					() => cosRationalSeries(x, badTerms),
					{ name: 'TypeError' },
					`expected TypeError for terms = ${String(badTerms)}`
				);
			}
		});

		it('throws RangeError for non-positive, non-integer, or non-safe-integer terms', () => {
			const x = { num: 1n, den: 2n };
			const outOfRange = [0, -1, -100, 1.5, 0.1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1];
			for (const badTerms of outOfRange) {
				assert.throws(
					() => cosRationalSeries(x, badTerms),
					{ name: 'RangeError' },
					`expected RangeError for terms = ${String(badTerms)}`
				);
			}
		});
	});

	describe('independent cross-checks', () => {
		it('matches independent naive Maclaurin summation exactly', () => {
			const cases = [
				[{ num: 1n, den: 3n }, 7],
				[{ num: -4n, den: 5n }, 9],
				[{ num: 7n, den: 4n }, 8],
				[{ num: 11n, den: 6n }, 10],
				[{ num: 2n, den: -9n }, 6],
			];

			for (const [x, terms] of cases) {
				const actual = cosRationalSeries(x, terms);
				const expected = naiveCosSeries(x, terms);
				assertCanonicalRational(actual);
				assert.deepEqual(actual, expected);
			}
		});

		it('agrees with Math.cos across rational angles within 1e-14', () => {
			const angles = [
				{ num: -5n, den: 2n, terms: 16 },
				{ num: -1n, den: 1n, terms: 10 },
				{ num: -1n, den: 4n, terms: 10 },
				{ num: 0n, den: 1n, terms: 10 },
				{ num: 1n, den: 10n, terms: 10 },
				{ num: 1n, den: 3n, terms: 10 },
				{ num: 1n, den: 1n, terms: 10 },
				{ num: 3n, den: 2n, terms: 12 },
				{ num: 22n, den: 7n, terms: 16 },
				{ num: 6n, den: 1n, terms: 22 },
			];

			for (const { num, den, terms } of angles) {
				const res = cosRationalSeries({ num, den }, terms);
				assertCanonicalRational(res);
				const approx = rationalToNumber(res);
				const expected = Math.cos(Number(num) / Number(den));
				assert.ok(
					Math.abs(approx - expected) < 1e-14,
					`cos(${num}/${den}): got ${approx}, expected ${expected}`
				);
			}
		});

		it('satisfies Pythagorean identity sin^2(x) + cos^2(x) = 1 to < 10^-20 in exact rationals', () => {
			const samples = [
				{ num: 1n, den: 5n },
				{ num: -3n, den: 4n },
				{ num: 7n, den: 6n },
				{ num: 2n, den: 1n },
			];

			const one = { num: 1n, den: 1n };
			const tolDen = 10n ** 20n;

			for (const x of samples) {
				const c = cosRationalSeries(x, 16);
				const s = naiveSinSeries(x, 16);
				assertCanonicalRational(c);
				const sumSquares = addRat(mulRat(c, c), mulRat(s, s));
				const err = subRat(sumSquares, one);
				assert.ok(
					absRatLessThan(err, 1n, tolDen),
					`sin^2 + cos^2 - 1 too large for x=${x.num}/${x.den}: ${rationalToNumber(err)}`
				);
			}
		});

		it('satisfies double-angle identity cos(2x) = 2*cos^2(x) - 1 to < 10^-18 in exact rationals', () => {
			const samples = [
				{ num: 1n, den: 7n },
				{ num: 1n, den: 2n },
				{ num: -4n, den: 5n },
				{ num: 3n, den: 2n },
			];

			const one = { num: 1n, den: 1n };
			const two = { num: 2n, den: 1n };
			const tolDen = 10n ** 18n;

			for (const x of samples) {
				const twoX = { num: 2n * x.num, den: x.den };
				const cosX = cosRationalSeries(x, 16);
				const cos2X = cosRationalSeries(twoX, 20);
				assertCanonicalRational(cosX);
				assertCanonicalRational(cos2X);

				const rhs = subRat(mulRat(two, mulRat(cosX, cosX)), one);
				const diff = subRat(cos2X, rhs);
				assert.ok(
					absRatLessThan(diff, 1n, tolDen),
					`cos(2x) - (2cos^2(x) - 1) too large for x=${x.num}/${x.den}: ${rationalToNumber(diff)}`
				);
			}
		});
	});
});
