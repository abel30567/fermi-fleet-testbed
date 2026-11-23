import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { moduloRationalIterative } from './moduloRationalIterative.js';

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

function assertInvariants(a, b, r) {
	assert.equal(typeof r.num, 'bigint');
	assert.equal(typeof r.den, 'bigint');
	assert.ok(r.den > 0n, `expected positive denominator, got ${r.den}`);

	if (r.num === 0n) {
		assert.equal(r.den, 1n, 'zero must be canonically represented as 0n/1n');
	} else {
		assert.equal(gcd(r.num, r.den), 1n, `result ${r.num}/${r.den} must be in lowest terms`);
	}

	// Normalize b to positive denominator for exact comparisons
	const bSign = b.den < 0n ? -1n : 1n;
	const bNum = b.num * bSign;
	const bDen = b.den * bSign;

	// Cross-check 1: (a - r) / b is an exact integer
	// a - r = (a.num * r.den - r.num * a.den) / (a.den * r.den)
	const diffNum = a.num * r.den - r.num * a.den;
	const diffDen = a.den * r.den;
	// (a - r) / b = (diffNum * bDen) / (diffDen * bNum)
	const quotNum = diffNum * bDen;
	const quotDen = diffDen * bNum;
	assert.equal(
		quotNum % quotDen,
		0n,
		`(a - r) / b must be an exact integer for a=${a.num}/${a.den}, b=${b.num}/${b.den}, r=${r.num}/${r.den}`
	);

	// Cross-check 2: remainder r is in floored-modulo range
	if (bNum > 0n) {
		// 0 <= r < b
		assert.ok(r.num >= 0n, `expected r >= 0 for b > 0, got ${r.num}/${r.den}`);
		assert.ok(
			r.num * bDen < bNum * r.den,
			`expected r < b for b > 0, got r=${r.num}/${r.den}, b=${bNum}/${bDen}`
		);
	} else {
		// b < r <= 0
		assert.ok(r.num <= 0n, `expected r <= 0 for b < 0, got ${r.num}/${r.den}`);
		assert.ok(
			bNum * r.den < r.num * bDen,
			`expected b < r for b < 0, got r=${r.num}/${r.den}, b=${bNum}/${bDen}`
		);
	}
}

describe('moduloRationalIterative', () => {
	it('computes exact modulo for normal positive rationals', () => {
		assert.deepEqual(
			moduloRationalIterative({ num: 7n, den: 4n }, { num: 1n, den: 2n }),
			{ num: 1n, den: 4n }
		);
		assert.deepEqual(
			moduloRationalIterative({ num: 5n, den: 3n }, { num: 2n, den: 5n }),
			{ num: 1n, den: 15n }
		);
		assert.deepEqual(
			moduloRationalIterative({ num: 1n, den: 3n }, { num: 1n, den: 2n }),
			{ num: 1n, den: 3n }
		);
		assert.deepEqual(
			moduloRationalIterative({ num: 17n, den: 1n }, { num: 5n, den: 1n }),
			{ num: 2n, den: 1n }
		);
	});

	it('handles negative dividend with positive divisor (floored convention: 0 <= r < b)', () => {
		assert.deepEqual(
			moduloRationalIterative({ num: -7n, den: 4n }, { num: 1n, den: 2n }),
			{ num: 1n, den: 4n }
		);
		assert.deepEqual(
			moduloRationalIterative({ num: -1n, den: 3n }, { num: 1n, den: 2n }),
			{ num: 1n, den: 6n }
		);
		assert.deepEqual(
			moduloRationalIterative({ num: -5n, den: 3n }, { num: 2n, den: 5n }),
			{ num: 1n, den: 3n }
		);
	});

	it('handles positive dividend with negative divisor (floored convention: b < r <= 0)', () => {
		assert.deepEqual(
			moduloRationalIterative({ num: 7n, den: 4n }, { num: -1n, den: 2n }),
			{ num: -1n, den: 4n }
		);
		assert.deepEqual(
			moduloRationalIterative({ num: 1n, den: 3n }, { num: -1n, den: 2n }),
			{ num: -1n, den: 6n }
		);
		assert.deepEqual(
			moduloRationalIterative({ num: 5n, den: 3n }, { num: -2n, den: 5n }),
			{ num: -1n, den: 3n }
		);
	});

	it('handles negative dividend with negative divisor (floored convention: b < r <= 0)', () => {
		assert.deepEqual(
			moduloRationalIterative({ num: -7n, den: 4n }, { num: -1n, den: 2n }),
			{ num: -1n, den: 4n }
		);
		assert.deepEqual(
			moduloRationalIterative({ num: -1n, den: 3n }, { num: -1n, den: 2n }),
			{ num: -1n, den: 3n }
		);
		assert.deepEqual(
			moduloRationalIterative({ num: -5n, den: 3n }, { num: -2n, den: 5n }),
			{ num: -1n, den: 15n }
		);
	});

	it('returns canonical 0n/1n for exact multiples and zero dividend', () => {
		assert.deepEqual(
			moduloRationalIterative({ num: 0n, den: 7n }, { num: 3n, den: 5n }),
			{ num: 0n, den: 1n }
		);
		assert.deepEqual(
			moduloRationalIterative({ num: 0n, den: -7n }, { num: -3n, den: 5n }),
			{ num: 0n, den: 1n }
		);
		assert.deepEqual(
			moduloRationalIterative({ num: 3n, den: 2n }, { num: 1n, den: 2n }),
			{ num: 0n, den: 1n }
		);
		assert.deepEqual(
			moduloRationalIterative({ num: -3n, den: 2n }, { num: 1n, den: 2n }),
			{ num: 0n, den: 1n }
		);
		assert.deepEqual(
			moduloRationalIterative({ num: 3n, den: 2n }, { num: -1n, den: 2n }),
			{ num: 0n, den: 1n }
		);
		assert.deepEqual(
			moduloRationalIterative({ num: -3n, den: 2n }, { num: -1n, den: 2n }),
			{ num: 0n, den: 1n }
		);
	});

	it('normalizes unreduced inputs and negative denominators', () => {
		assert.deepEqual(
			moduloRationalIterative({ num: 21n, den: -12n }, { num: -3n, den: -6n }),
			{ num: 1n, den: 4n }
		);
		assert.deepEqual(
			moduloRationalIterative({ num: 14n, den: 8n }, { num: 3n, den: -6n }),
			{ num: -1n, den: 4n }
		);
		assert.deepEqual(
			moduloRationalIterative({ num: 6n, den: -4n }, { num: -9n, den: -6n }),
			{ num: 0n, den: 1n }
		);
	});

	it('handles very large rationals accurately and without performance issues', () => {
		const bigQ = 10n ** 60n + 123456789012345678901n;
		const b = { num: 10n ** 40n + 7n, den: 10n ** 30n + 9n };
		const expectedRem = { num: 10n ** 25n + 3n, den: 10n ** 30n + 9n };
		// Construct a = bigQ * b + expectedRem
		const a = {
			num: bigQ * b.num + expectedRem.num,
			den: b.den,
		};
		const result = moduloRationalIterative(a, b);
		const g = gcd(expectedRem.num, expectedRem.den);
		assert.deepEqual(result, { num: expectedRem.num / g, den: expectedRem.den / g });
		assertInvariants(a, b, result);

		// Negative large dividend with different large prime-like denominators
		const aNeg = { num: -(10n ** 80n + 13n), den: 10n ** 35n + 17n };
		const bLarge = { num: 10n ** 30n + 19n, den: 10n ** 25n + 23n };
		const rNeg = moduloRationalIterative(aNeg, bLarge);
		assertInvariants(aNeg, bLarge, rNeg);
	});

	it('throws RangeError on zero divisor or zero denominator', () => {
		assert.throws(
			() => moduloRationalIterative({ num: 1n, den: 2n }, { num: 0n, den: 1n }),
			RangeError
		);
		assert.throws(
			() => moduloRationalIterative({ num: 0n, den: 1n }, { num: 0n, den: -3n }),
			RangeError
		);
		assert.throws(
			() => moduloRationalIterative({ num: 1n, den: 0n }, { num: 1n, den: 2n }),
			RangeError
		);
		assert.throws(
			() => moduloRationalIterative({ num: 1n, den: 2n }, { num: 1n, den: 0n }),
			RangeError
		);
	});

	it('throws TypeError on invalid input types', () => {
		assert.throws(() => moduloRationalIterative(null, { num: 1n, den: 2n }), TypeError);
		assert.throws(() => moduloRationalIterative({ num: 1n, den: 2n }, undefined), TypeError);
		assert.throws(() => moduloRationalIterative(3, { num: 1n, den: 2n }), TypeError);
		assert.throws(() => moduloRationalIterative({ num: 1, den: 2n }, { num: 1n, den: 2n }), TypeError);
		assert.throws(() => moduloRationalIterative({ num: 1n, den: '2' }, { num: 1n, den: 2n }), TypeError);
		assert.throws(() => moduloRationalIterative({ num: 1n, den: 2n }, { num: 1n, den: 2 }), TypeError);
		assert.throws(() => moduloRationalIterative({}, { num: 1n, den: 2n }), TypeError);
	});

	it('satisfies algebraic and range invariants across a comprehensive grid', () => {
		const numerators = [-17n, -7n, -3n, -1n, 0n, 1n, 3n, 7n, 17n];
		const denominators = [-6n, -4n, -1n, 1n, 2n, 3n, 5n, 6n];

		const rationals = [];
		for (const num of numerators) {
			for (const den of denominators) {
				rationals.push({ num, den });
			}
		}

		for (const a of rationals) {
			for (const b of rationals) {
				if (b.num === 0n) continue;
				const r = moduloRationalIterative(a, b);
				assertInvariants(a, b, r);
			}
		}
	});

	it('cross-checks against exact binary floating-point floored modulo', () => {
		const dyadicNums = [-15n, -9n, -4n, -1n, 0n, 1n, 4n, 9n, 15n];
		const dyadicDens = [1n, 2n, 4n, 8n, 16n];

		for (const an of dyadicNums) {
			for (const ad of dyadicDens) {
				for (const bn of dyadicNums) {
					if (bn === 0n) continue;
					for (const bd of dyadicDens) {
						const a = { num: an, den: ad };
						const b = { num: bn, den: bd };
						const r = moduloRationalIterative(a, b);
						const aFloat = Number(an) / Number(ad);
						const bFloat = Number(bn) / Number(bd);
						const expectedFloat = aFloat - Math.floor(aFloat / bFloat) * bFloat;
						const actualFloat = Number(r.num) / Number(r.den);
						assert.equal(actualFloat, expectedFloat);
					}
				}
			}
		}
	});
});
