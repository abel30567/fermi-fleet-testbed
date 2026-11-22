import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { arctanRationalRecursive } from './arctanRationalRecursive.js';

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

function assertLowestTerms(r) {
	assert.equal(typeof r, 'object');
	assert.notEqual(r, null);
	assert.equal(typeof r.num, 'bigint');
	assert.equal(typeof r.den, 'bigint');
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`);
	if (r.num === 0n) {
		assert.equal(r.den, 1n, `expected zero as 0n/1n, got 0n/${r.den}`);
	} else {
		assert.equal(gcd(r.num, r.den), 1n, `expected lowest terms for ${r.num}/${r.den}`);
	}
}

/**
 * Convert an arbitrarily large exact rational to a JS Number accurately by
 * scaling into a fixed-point BigInt before converting.
 */
function rationalToNumber(r) {
	const scale = 10n ** 18n;
	const scaled = (r.num * scale) / r.den;
	return Number(scaled) / 1e18;
}

function addRat(a, b) {
	const num = a.num * b.den + b.num * a.den;
	const den = a.den * b.den;
	const g = gcd(num, den);
	return { num: num / g, den: den / g };
}

function subRat(a, b) {
	const num = a.num * b.den - b.num * a.den;
	const den = a.den * b.den;
	const g = gcd(num, den);
	return { num: num / g, den: den / g };
}

function mulInt(r, k) {
	const num = r.num * k;
	const g = gcd(num, r.den);
	return { num: num / g, den: r.den / g };
}

function assertRatClose(actual, expected, maxErrorRat, label = '') {
	const diff = subRat(actual, expected);
	const absNum = absBigInt(diff.num);
	assert.ok(
		absNum * maxErrorRat.den <= maxErrorRat.num * diff.den,
		`${label}: |${rationalToNumber(diff)}| exceeded ${rationalToNumber(maxErrorRat)}`
	);
}

/**
 * Independent iterative BigInt Taylor series reference for |x| <= 1/2.
 */
function iterativeArctanReference(x, termCount) {
	let sumNum = 0n;
	let sumDen = 1n;
	let pPow = x.num;
	let qPow = x.den;
	const p2 = x.num * x.num;
	const q2 = x.den * x.den;

	for (let k = 0; k < termCount; k += 1) {
		const denomFactor = BigInt(2 * k + 1);
		const termNum = k % 2 === 0 ? pPow : -pPow;
		const termDen = qPow * denomFactor;

		const nextNum = sumNum * termDen + termNum * sumDen;
		const nextDen = sumDen * termDen;
		const g = gcd(nextNum, nextDen);
		sumNum = nextNum / g;
		sumDen = nextDen / g;

		pPow *= p2;
		qPow *= q2;
	}

	return { num: sumNum, den: sumDen };
}

describe('arctanRationalRecursive', () => {
	test('exact zero cases return { num: 0n, den: 1n }', () => {
		for (const zeroInput of [
			{ num: 0n, den: 1n },
			{ num: 0n, den: 42n },
			{ num: 0n, den: -1000n },
		]) {
			const res = arctanRationalRecursive(zeroInput);
			assertLowestTerms(res);
			assert.deepEqual(res, { num: 0n, den: 1n });
		}
	});

	test('cross-checks against Math.atan across small, moderate, unit, and large inputs', () => {
		const inputs = [
			{ num: 1n, den: 1000n },
			{ num: 1n, den: 100n },
			{ num: 1n, den: 10n },
			{ num: 1n, den: 8n },
			{ num: 1n, den: 5n },
			{ num: 1n, den: 4n },
			{ num: 1n, den: 3n },
			{ num: 1n, den: 2n },
			{ num: 16n, den: 63n }, // tan(2 * arctan(1/8))
			{ num: 3n, den: 4n },
			{ num: 99n, den: 100n },
			{ num: 1n, den: 1n },
			{ num: 101n, den: 100n },
			{ num: 2n, den: 1n },
			{ num: 3n, den: 1n },
			{ num: 10n, den: 1n },
			{ num: 1000n, den: 1n },
			{ num: -1n, den: 10n },
			{ num: -1n, den: 2n },
			{ num: -1n, den: 1n },
			{ num: -2n, den: 1n },
			{ num: -500n, den: 1n },
		];

		for (const x of inputs) {
			const res = arctanRationalRecursive(x);
			assertLowestTerms(res);
			const approx = rationalToNumber(res);
			const expected = Math.atan(Number(x.num) / Number(x.den));
			assert.ok(
				Math.abs(approx - expected) <= 1e-12,
				`x=${x.num}/${x.den}: got ${approx}, expected ${expected}`
			);

			// Inverse check: tan(arctan(x)) ~= x for moderate x
			if (absBigInt(x.num) <= 10n * x.den) {
				const tanBack = Math.tan(approx);
				const xFloat = Number(x.num) / Number(x.den);
				assert.ok(
					Math.abs(tanBack - xFloat) <= 1e-10,
					`tan(arctan(${x.num}/${x.den})) = ${tanBack}, expected ${xFloat}`
				);
			}
		}
	});

	test('handles unreduced inputs and negative denominators identically', () => {
		const a = arctanRationalRecursive({ num: 1n, den: 2n });
		const b = arctanRationalRecursive({ num: 15n, den: 30n });
		const c = arctanRationalRecursive({ num: -7n, den: -14n });
		assertLowestTerms(a);
		assertLowestTerms(b);
		assertLowestTerms(c);
		assert.deepEqual(b, a);
		assert.deepEqual(c, a);

		const negA = arctanRationalRecursive({ num: -1n, den: 2n });
		const negB = arctanRationalRecursive({ num: 3n, den: -6n });
		assertLowestTerms(negA);
		assertLowestTerms(negB);
		assert.deepEqual(negB, negA);
		assert.deepEqual(negA, { num: -a.num, den: a.den });
	});

	test('exact odd symmetry arctan(-x) === -arctan(x)', () => {
		const samples = [
			{ num: 1n, den: 9n },
			{ num: 2n, den: 3n },
			{ num: 1n, den: 1n },
			{ num: 7n, den: 3n },
			{ num: 10n ** 25n, den: 1n },
		];
		for (const x of samples) {
			const pos = arctanRationalRecursive(x);
			const neg = arctanRationalRecursive({ num: -x.num, den: x.den });
			assertLowestTerms(pos);
			assertLowestTerms(neg);
			assert.deepEqual(neg, { num: -pos.num, den: pos.den });
		}
	});

	test('algebraic identities: Euler, Machin, angle addition, and reciprocal', () => {
		const eps = { num: 1n, den: 10n ** 14n };
		const piOver4 = arctanRationalRecursive({ num: 1n, den: 1n });
		const piOver2 = mulInt(piOver4, 2n);

		// Euler: arctan(1/2) + arctan(1/3) = pi/4
		const aHalf = arctanRationalRecursive({ num: 1n, den: 2n });
		const aThird = arctanRationalRecursive({ num: 1n, den: 3n });
		assertRatClose(addRat(aHalf, aThird), piOver4, eps, 'Euler identity');

		// Machin: 4*arctan(1/5) - arctan(1/239) = pi/4
		const aFifth = arctanRationalRecursive({ num: 1n, den: 5n });
		const a239 = arctanRationalRecursive({ num: 1n, den: 239n });
		assertRatClose(subRat(mulInt(aFifth, 4n), a239), piOver4, eps, 'Machin identity');

		// Angle addition: arctan(1/3) + arctan(1/7) = arctan(1/2)
		const aSeventh = arctanRationalRecursive({ num: 1n, den: 7n });
		assertRatClose(addRat(aThird, aSeventh), aHalf, eps, 'Angle addition identity');

		// Reciprocal: arctan(x) + arctan(1/x) = pi/2 for x > 0
		for (const x of [
			{ num: 2n, den: 5n },
			{ num: 7n, den: 3n },
			{ num: 100n, den: 1n },
		]) {
			const ax = arctanRationalRecursive(x);
			const aInv = arctanRationalRecursive({ num: x.den, den: x.num });
			assertRatClose(addRat(ax, aInv), piOver2, eps, `Reciprocal identity for ${x.num}/${x.den}`);
		}
	});

	test('cross-checks against independent iterative Taylor series reference', () => {
		const samples = [
			{ num: 1n, den: 20n },
			{ num: 1n, den: 8n },
			{ num: 3n, den: 10n },
			{ num: -2n, den: 5n },
		];
		const tol = { num: 1n, den: 10n ** 15n };

		for (const x of samples) {
			const recursive = arctanRationalRecursive(x, { tolerance: tol });
			const iterative = iterativeArctanReference(x, 30);
			assertLowestTerms(recursive);
			assertRatClose(recursive, iterative, { num: 1n, den: 10n ** 14n }, `Iterative cross-check ${x.num}/${x.den}`);
		}
	});

	test('high-precision and custom tolerance / precision / terms options', () => {
		// Known 35 decimal digits of pi/4 = 0.78539816339744830961566084581987572...
		const piOver4Ref35 = {
			num: 78539816339744830961566084581987572n,
			den: 10n ** 35n,
		};

		const highPrec = arctanRationalRecursive({ num: 1n, den: 1n }, { precision: 30 });
		assertLowestTerms(highPrec);
		assertRatClose(highPrec, piOver4Ref35, { num: 1n, den: 10n ** 30n }, 'pi/4 precision 30');

		// Rational passed directly as 2nd argument
		const directTol = arctanRationalRecursive(
			{ num: 1n, den: 1n },
			{ num: 1n, den: 10n ** 25n }
		);
		assertLowestTerms(directTol);
		assertRatClose(directTol, piOver4Ref35, { num: 1n, den: 10n ** 25n }, 'pi/4 direct tolerance');

		// Exact Taylor partial sums via `terms` for x = 1/10 (already <= 1/8, no reduction)
		const t1 = arctanRationalRecursive({ num: 1n, den: 10n }, { terms: 1 });
		assertLowestTerms(t1);
		assert.deepEqual(t1, { num: 1n, den: 10n });

		const t2 = arctanRationalRecursive({ num: 1n, den: 10n }, { terms: 2 });
		assertLowestTerms(t2);
		// 1/10 - 1/3000 = 299/3000
		assert.deepEqual(t2, { num: 299n, den: 3000n });

		const t3 = arctanRationalRecursive({ num: 1n, den: 10n }, { terms: 3 });
		assertLowestTerms(t3);
		// 299/3000 + 1/500000 = (299*500 + 3) / 1500000 = 149503 / 1500000
		assert.deepEqual(t3, { num: 149503n, den: 1500000n });

		// Empty options object uses default tolerance
		const emptyOpt = arctanRationalRecursive({ num: 1n, den: 2n }, {});
		assertLowestTerms(emptyOpt);
		assert.ok(Math.abs(rationalToNumber(emptyOpt) - Math.atan(0.5)) <= 1e-12);
	});

	test('handles very small, very large, and large-numerator/denominator BigInt rationals', () => {
		// Very small: x = 1 / 10^30 -> arctan(x) ~= 1/10^30 to 90 digits
		const tiny = { num: 1n, den: 10n ** 30n };
		const resTiny = arctanRationalRecursive(tiny);
		assertLowestTerms(resTiny);
		assert.ok(resTiny.num > 0n);
		assertRatClose(resTiny, tiny, { num: 1n, den: 10n ** 80n }, 'tiny input');

		// Very large: x = 10^30 -> arctan(x) ~= pi/2 - 10^-30
		const huge = { num: 10n ** 30n, den: 1n };
		const resHuge = arctanRationalRecursive(huge, { precision: 25 });
		assertLowestTerms(resHuge);
		const piOver2 = mulInt(arctanRationalRecursive({ num: 1n, den: 1n }, { precision: 26 }), 2n);
		assertRatClose(resHuge, piOver2, { num: 2n, den: 10n ** 25n }, 'huge positive input');

		// Very large negative: x = -10^30
		const resNegHuge = arctanRationalRecursive({ num: -(10n ** 30n), den: 1n }, { precision: 25 });
		assertLowestTerms(resNegHuge);
		assert.deepEqual(resNegHuge, { num: -resHuge.num, den: resHuge.den });

		// Large 40-digit BigInt rational near 1 (both < 1 and > 1)
		const nearOneBelow = { num: 10n ** 40n + 1n, den: 10n ** 40n + 2n };
		const nearOneAbove = { num: 10n ** 40n + 2n, den: 10n ** 40n + 1n };
		const resBelow = arctanRationalRecursive(nearOneBelow);
		const resAbove = arctanRationalRecursive(nearOneAbove);
		assertLowestTerms(resBelow);
		assertLowestTerms(resAbove);
		assert.ok(Math.abs(rationalToNumber(resBelow) - Math.PI / 4) <= 1e-12);
		assert.ok(Math.abs(rationalToNumber(resAbove) - Math.PI / 4) <= 1e-12);
		// Monotonicity: arctan(nearOneBelow) < arctan(1) < arctan(nearOneAbove)
		const atOne = arctanRationalRecursive({ num: 1n, den: 1n }, { precision: 45 });
		const resBelowHi = arctanRationalRecursive(nearOneBelow, { precision: 45 });
		const resAboveHi = arctanRationalRecursive(nearOneAbove, { precision: 45 });
		assert.ok(resBelowHi.num * atOne.den < atOne.num * resBelowHi.den);
		assert.ok(atOne.num * resAboveHi.den < resAboveHi.num * atOne.den);
	});

	test('throws TypeError and RangeError on invalid inputs and options', () => {
		// Invalid x types
		for (const badX of [
			null,
			undefined,
			0,
			0.5,
			'1/2',
			1n,
			[1n, 2n],
			{},
			{ num: 1, den: 2 },
			{ num: 1n, den: 2 },
			{ num: 1, den: 2n },
			{ num: '1', den: '2' },
		]) {
			assert.throws(() => arctanRationalRecursive(badX), TypeError);
		}

		// Zero denominator
		assert.throws(() => arctanRationalRecursive({ num: 1n, den: 0n }), RangeError);
		assert.throws(() => arctanRationalRecursive({ num: 0n, den: 0n }), RangeError);

		// Invalid options container
		for (const badOpt of [null, 12, 'high', [1], 1n]) {
			assert.throws(() => arctanRationalRecursive({ num: 1n, den: 2n }, badOpt), TypeError);
		}

		// Invalid tolerance
		assert.throws(
			() => arctanRationalRecursive({ num: 1n, den: 2n }, { tolerance: 1e-12 }),
			TypeError
		);
		assert.throws(
			() => arctanRationalRecursive({ num: 1n, den: 2n }, { tolerance: { num: 0n, den: 1n } }),
			RangeError
		);
		assert.throws(
			() => arctanRationalRecursive({ num: 1n, den: 2n }, { tolerance: { num: -1n, den: 10n } }),
			RangeError
		);
		assert.throws(
			() => arctanRationalRecursive({ num: 1n, den: 2n }, { tolerance: { num: 1n, den: 0n } }),
			RangeError
		);
		assert.throws(
			() => arctanRationalRecursive({ num: 1n, den: 2n }, { num: -1n, den: 10n }),
			RangeError
		);

		// Invalid precision
		assert.throws(
			() => arctanRationalRecursive({ num: 1n, den: 2n }, { precision: '12' }),
			TypeError
		);
		for (const badPrec of [0, -5, 1.5, NaN, Infinity]) {
			assert.throws(
				() => arctanRationalRecursive({ num: 1n, den: 2n }, { precision: badPrec }),
				RangeError
			);
		}

		// Invalid terms
		assert.throws(
			() => arctanRationalRecursive({ num: 1n, den: 2n }, { terms: 5n }),
			TypeError
		);
		for (const badTerms of [0, -1, 2.5, NaN, Infinity]) {
			assert.throws(
				() => arctanRationalRecursive({ num: 1n, den: 2n }, { terms: badTerms }),
				RangeError
			);
		}
	});
});
