import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { arctanRationalIterative } from './arctanRationalIterative.js';

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

function assertReduced(r) {
	assert.equal(typeof r.num, 'bigint', 'num must be a BigInt');
	assert.equal(typeof r.den, 'bigint', 'den must be a BigInt');
	assert.ok(r.den > 0n, `den must be positive, got ${r.den}`);
	assert.equal(gcd(r.num, r.den), 1n, `rational ${r.num}/${r.den} is not in lowest terms`);
}

function addRat(a, b) {
	const num = a.num * b.den + b.num * a.den;
	const den = a.den * b.den;
	const g = gcd(num, den);
	return { num: num / g, den: den / g };
}

function subRat(a, b) {
	return addRat(a, { num: -b.num, den: b.den });
}

function mulRatInt(a, k) {
	const num = a.num * k;
	const g = gcd(num, a.den);
	return { num: num / g, den: a.den / g };
}

function absRat(a) {
	return { num: a.num < 0n ? -a.num : a.num, den: a.den };
}

function ltRat(a, b) {
	return a.num * b.den < b.num * a.den;
}

/**
 * Convert a rational { num, den } to a JS Number safely even when num/den
 * exceed IEEE 754 float64 max (~1.8e308).
 */
function ratToNumber({ num, den }) {
	if (num === 0n) return 0;
	const sign = num < 0n ? -1 : 1;
	const absNum = num < 0n ? -num : num;
	const numBits = absNum.toString(2).length;
	const denBits = den.toString(2).length;
	const shift = numBits - denBits;
	// Scale so the quotient sits around 2^60, then rescale by 2^(shift - 60)
	const targetBits = 60;
	let scaled;
	if (targetBits - shift >= 0) {
		scaled = (absNum << BigInt(targetBits - shift)) / den;
	} else {
		scaled = absNum / (den << BigInt(shift - targetBits));
	}
	return sign * Number(scaled) * 2 ** (shift - targetBits);
}

/**
 * Assert `|a - b| < 10^-digits`.
 */
function assertCloseRat(a, b, digits = 40) {
	const diff = absRat(subRat(a, b));
	const tol = { num: 1n, den: 10n ** BigInt(digits) };
	assert.ok(
		ltRat(diff, tol),
		`Expected |a - b| < 1e-${digits}, got approx ${ratToNumber(diff)}`,
	);
}

/**
 * Assert `|a - b| / |b| < 10^-digits`.
 */
function assertRelCloseRat(a, b, digits = 40) {
	const diff = absRat(subRat(a, b));
	const ref = absRat(b);
	// diff / ref < 1 / 10^digits  <=>  diff.num * ref.den * 10^digits < ref.num * diff.den
	const scale = 10n ** BigInt(digits);
	assert.ok(
		diff.num * ref.den * scale < ref.num * diff.den,
		`Expected relative error < 1e-${digits}`,
	);
}

// Reference constants to 50 decimal digits (independent of the implementation)
const PI_50 = 314159265358979323846264338327950288419716939937510n;
const SCALE_50 = 10n ** 50n;
const PI_OVER_4_REF = { num: PI_50, den: 4n * SCALE_50 };
const PI_OVER_2_REF = { num: PI_50, den: 2n * SCALE_50 };
// arctan(1/2) to 50 decimal digits: 0.46364760900080611621425623146121440202853705428612...
const ATAN_HALF_REF = {
	num: 46364760900080611621425623146121440202853705428612n,
	den: SCALE_50,
};

describe('arctanRationalIterative', () => {
	test('exact zero for 0 (including unreduced and negative denominators)', () => {
		for (const zero of [
			{ num: 0n, den: 1n },
			{ num: 0n, den: 7n },
			{ num: 0n, den: -13n },
			{ num: -0n, den: 999n },
		]) {
			const res = arctanRationalIterative(zero);
			assert.deepEqual(res, { num: 0n, den: 1n });
			assertReduced(res);
		}
	});

	test('edge cases: 1 and -1 equal +/- pi/4 to >45 decimal digits', () => {
		const pos1 = arctanRationalIterative({ num: 1n, den: 1n });
		const neg1 = arctanRationalIterative({ num: -1n, den: 1n });
		assertReduced(pos1);
		assertReduced(neg1);

		assertCloseRat(pos1, PI_OVER_4_REF, 45);
		assert.deepEqual(neg1, { num: -pos1.num, den: pos1.den });
	});

	test('normal cases across small, moderate, near-1, and large values match Math.atan', () => {
		const inputs = [
			{ num: 1n, den: 100n },
			{ num: 1n, den: 10n },
			{ num: 1n, den: 8n },
			{ num: 1n, den: 5n },
			{ num: 1n, den: 3n },
			{ num: 1n, den: 2n },
			{ num: 3n, den: 4n },
			{ num: 99n, den: 100n },
			{ num: 101n, den: 100n },
			{ num: 2n, den: 1n },
			{ num: 5n, den: 2n },
			{ num: 10n, den: 1n },
			{ num: 1000n, den: 1n },
			{ num: -7n, den: 13n },
			{ num: -999n, den: 1000n },
			{ num: -50n, den: 3n },
		];

		for (const x of inputs) {
			const res = arctanRationalIterative(x);
			assertReduced(res);

			const expected = Math.atan(Number(x.num) / Number(x.den));
			const actual = ratToNumber(res);
			assert.ok(
				Math.abs(actual - expected) < 1e-15,
				`Mismatch for ${x.num}/${x.den}: actual=${actual}, expected=${expected}`,
			);
		}
	});

	test('normalizes unreduced inputs and negative denominators identically', () => {
		const canonical = arctanRationalIterative({ num: -3n, den: 4n });
		const unreduced = arctanRationalIterative({ num: -15n, den: 20n });
		const negDen = arctanRationalIterative({ num: 3n, den: -4n });
		const bothNeg = arctanRationalIterative({ num: -6n, den: -8n });
		const posCanonical = arctanRationalIterative({ num: 3n, den: 4n });

		assertReduced(canonical);
		assertReduced(unreduced);
		assertReduced(negDen);
		assertReduced(bothNeg);

		assert.deepEqual(unreduced, canonical);
		assert.deepEqual(negDen, canonical);
		assert.deepEqual(bothNeg, posCanonical);
	});

	test('high-precision reference check for arctan(1/2) to >45 decimal digits', () => {
		const res = arctanRationalIterative({ num: 1n, den: 2n });
		assertReduced(res);
		assertCloseRat(res, ATAN_HALF_REF, 45);
	});

	test('very small |x| retains full relative accuracy and satisfies 0 < arctan(x) < x', () => {
		const tinyCases = [
			{ num: 1n, den: 10n ** 20n },
			{ num: 1n, den: 10n ** 60n },
			{ num: 3n, den: 2n ** 200n },
			{ num: -7n, den: 10n ** 80n },
		];

		for (const x of tinyCases) {
			const res = arctanRationalIterative(x);
			assertReduced(res);

			// For tiny x, arctan(x) = x - x^3 / 3 + O(x^5)
			const x3 = { num: x.num ** 3n, den: 3n * x.den ** 3n };
			const approxTaylor = subRat(x, x3);
			assertRelCloseRat(res, approxTaylor, 45);

			if (x.num > 0n) {
				assert.ok(res.num > 0n, 'arctan(x) must be strictly positive for x > 0');
				assert.ok(ltRat(res, x), 'arctan(x) must be strictly less than x for x > 0');
			} else {
				assert.ok(res.num < 0n, 'arctan(x) must be strictly negative for x < 0');
			}
		}
	});

	test('very large |x| approaches +/- pi/2 accurately', () => {
		const large1 = arctanRationalIterative({ num: 10n ** 12n, den: 1n });
		assertReduced(large1);
		// arctan(10^12) = pi/2 - 10^-12 + 10^-36 / 3 - ...
		const expectedLarge1 = subRat(PI_OVER_2_REF, { num: 1n, den: 10n ** 12n });
		assertCloseRat(large1, expectedLarge1, 35);

		const hugePos = arctanRationalIterative({ num: 10n ** 60n, den: 1n });
		const hugeNeg = arctanRationalIterative({ num: -(10n ** 60n), den: 1n });
		assertReduced(hugePos);
		assertReduced(hugeNeg);

		assertCloseRat(hugePos, PI_OVER_2_REF, 45);
		assert.deepEqual(hugeNeg, { num: -hugePos.num, den: hugePos.den });
		assert.ok(ltRat(hugePos, PI_OVER_2_REF), 'arctan(huge) must remain < pi/2');
	});

	test('cross-check: Machin, Euler, Hermann, and Stormer identities for pi/4', () => {
		const atan1 = arctanRationalIterative({ num: 1n, den: 1n });
		const atan1_2 = arctanRationalIterative({ num: 1n, den: 2n });
		const atan1_3 = arctanRationalIterative({ num: 1n, den: 3n });
		const atan1_5 = arctanRationalIterative({ num: 1n, den: 5n });
		const atan1_7 = arctanRationalIterative({ num: 1n, den: 7n });
		const atan1_8 = arctanRationalIterative({ num: 1n, den: 8n });
		const atan1_57 = arctanRationalIterative({ num: 1n, den: 57n });
		const atan1_239 = arctanRationalIterative({ num: 1n, den: 239n });

		// Machin: 4*atan(1/5) - atan(1/239) = pi/4
		const machin = subRat(mulRatInt(atan1_5, 4n), atan1_239);
		assertCloseRat(machin, PI_OVER_4_REF, 45);
		assertCloseRat(machin, atan1, 45);

		// Euler: atan(1/2) + atan(1/3) = pi/4
		const euler = addRat(atan1_2, atan1_3);
		assertCloseRat(euler, PI_OVER_4_REF, 45);

		// Hermann: 2*atan(1/2) - atan(1/7) = pi/4
		const hermann = subRat(mulRatInt(atan1_2, 2n), atan1_7);
		assertCloseRat(hermann, PI_OVER_4_REF, 45);

		// Stormer: 6*atan(1/8) + 2*atan(1/57) + atan(1/239) = pi/4
		const stormer = addRat(addRat(mulRatInt(atan1_8, 6n), mulRatInt(atan1_57, 2n)), atan1_239);
		assertCloseRat(stormer, PI_OVER_4_REF, 45);
	});

	test('cross-check: reciprocal identity arctan(x) + arctan(1/x) = pi/2', () => {
		const values = [
			{ num: 1n, den: 1n },
			{ num: 2n, den: 3n },
			{ num: 7n, den: 5n },
			{ num: 13n, den: 97n },
			{ num: 999n, den: 1000n },
			{ num: 123456n, den: 7n },
		];

		for (const x of values) {
			const inv = { num: x.den, den: x.num };
			const sum = addRat(arctanRationalIterative(x), arctanRationalIterative(inv));
			assertCloseRat(sum, PI_OVER_2_REF, 45);
		}
	});

	test('cross-check: addition identity arctan(a) + arctan(b) = arctan((a + b)/(1 - ab)) for ab < 1', () => {
		const pairs = [
			[
				{ num: 1n, den: 4n },
				{ num: 1n, den: 5n },
			],
			[
				{ num: 2n, den: 5n },
				{ num: 3n, den: 7n },
			],
			[
				{ num: 5n, den: 6n },
				{ num: 1n, den: 2n },
			],
			[
				{ num: -1n, den: 3n },
				{ num: 4n, den: 5n },
			],
		];

		for (const [a, b] of pairs) {
			const lhs = addRat(arctanRationalIterative(a), arctanRationalIterative(b));
			const combined = {
				num: a.num * b.den + b.num * a.den,
				den: a.den * b.den - a.num * b.num,
			};
			const rhs = arctanRationalIterative(combined);
			assertCloseRat(lhs, rhs, 45);
		}
	});

	test('supports custom precisionBits option', () => {
		const res256 = arctanRationalIterative({ num: 1n, den: 1n }, { precisionBits: 256 });
		assertReduced(res256);
		assertCloseRat(res256, PI_OVER_4_REF, 49);

		const res16 = arctanRationalIterative({ num: 1n, den: 2n }, { precisionBits: 16 });
		assertReduced(res16);
		assert.ok(Math.abs(ratToNumber(res16) - Math.atan(0.5)) < 1e-4);
	});

	test('odd symmetry holds exactly: arctan(-x) === -arctan(x)', () => {
		const samples = [
			{ num: 1n, den: 1000n },
			{ num: 1n, den: 7n },
			{ num: 3n, den: 5n },
			{ num: 999n, den: 1000n },
			{ num: 17n, den: 3n },
		];
		for (const x of samples) {
			const pos = arctanRationalIterative(x);
			const neg = arctanRationalIterative({ num: -x.num, den: x.den });
			assert.deepEqual(neg, { num: -pos.num, den: pos.den });
		}
	});

	test('input validation rejects invalid rationals and options', () => {
		// Invalid x types
		for (const bad of [null, undefined, 0, 1, '1/2', true, 5n, [], [1n, 2n]]) {
			assert.throws(() => arctanRationalIterative(bad), TypeError);
		}

		// Missing or non-BigInt num/den
		for (const bad of [
			{},
			{ num: 1, den: 2n },
			{ num: 1n, den: 2 },
			{ num: '1', den: '2' },
			{ num: 1n },
			{ den: 2n },
			{ num: NaN, den: 1n },
			{ num: 1n, den: Infinity },
		]) {
			assert.throws(() => arctanRationalIterative(bad), TypeError);
		}

		// Zero denominator
		assert.throws(() => arctanRationalIterative({ num: 1n, den: 0n }), RangeError);
		assert.throws(() => arctanRationalIterative({ num: 0n, den: 0n }), RangeError);

		// Invalid options
		assert.throws(() => arctanRationalIterative({ num: 1n, den: 2n }, null), TypeError);
		assert.throws(() => arctanRationalIterative({ num: 1n, den: 2n }, []), TypeError);
		assert.throws(
			() => arctanRationalIterative({ num: 1n, den: 2n }, { precisionBits: '160' }),
			TypeError,
		);
		assert.throws(
			() => arctanRationalIterative({ num: 1n, den: 2n }, { precisionBits: NaN }),
			TypeError,
		);
		assert.throws(
			() => arctanRationalIterative({ num: 1n, den: 2n }, { precisionBits: 0 }),
			RangeError,
		);
		assert.throws(
			() => arctanRationalIterative({ num: 1n, den: 2n }, { precisionBits: -10 }),
			RangeError,
		);
		assert.throws(
			() => arctanRationalIterative({ num: 1n, den: 2n }, { precisionBits: 12.5 }),
			RangeError,
		);
		assert.throws(
			() => arctanRationalIterative({ num: 1n, den: 2n }, { precisionBits: 1_000_000 }),
			RangeError,
		);
	});
});
