import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crossProductRationalMemo } from './crossProductRationalMemo.js';

/**
 * Helper to construct a rational `{ num, den }` from BigInts.
 * @param {bigint} num
 * @param {bigint} [den=1n]
 */
const q = (num, den = 1n) => ({ num, den });

/** Independent GCD helper for algebraic cross-checks. */
function gcd(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		[x, y] = [y, x % y];
	}
	return x;
}

/** Independent rational reduction helper. */
function norm(r) {
	if (r.num === 0n) return { num: 0n, den: 1n };
	let n = r.num;
	let d = r.den;
	if (d < 0n) {
		n = -n;
		d = -d;
	}
	const g = gcd(n, d);
	return { num: n / g, den: d / g };
}

/** Independent rational arithmetic helpers. */
const qAdd = (x, y) => norm({ num: x.num * y.den + y.num * x.den, den: x.den * y.den });
const qSub = (x, y) => norm({ num: x.num * y.den - y.num * x.den, den: x.den * y.den });
const qMul = (x, y) => norm({ num: x.num * y.num, den: x.den * y.den });
const qNeg = (x) => norm({ num: -x.num, den: x.den });

/** Independent 3D vector dot product and vector sum over rationals. */
const vDot = (u, v) => qAdd(qAdd(qMul(u[0], v[0]), qMul(u[1], v[1])), qMul(u[2], v[2]));
const vAdd = (u, v) => [qAdd(u[0], v[0]), qAdd(u[1], v[1]), qAdd(u[2], v[2])];
const vNeg = (u) => [qNeg(u[0]), qNeg(u[1]), qNeg(u[2])];

describe('crossProductRationalMemo', () => {
	describe('standard basis vectors', () => {
		const i = [q(1n), q(0n), q(0n)];
		const j = [q(0n), q(1n), q(0n)];
		const k = [q(0n), q(0n), q(1n)];

		it('computes cyclic products i×j=k, j×k=i, k×i=j', () => {
			assert.deepStrictEqual(crossProductRationalMemo(i, j), k);
			assert.deepStrictEqual(crossProductRationalMemo(j, k), i);
			assert.deepStrictEqual(crossProductRationalMemo(k, i), j);
		});

		it('computes anti-cyclic products j×i=-k, k×j=-i, i×k=-j', () => {
			assert.deepStrictEqual(crossProductRationalMemo(j, i), [q(0n), q(0n), q(-1n)]);
			assert.deepStrictEqual(crossProductRationalMemo(k, j), [q(-1n), q(0n), q(0n)]);
			assert.deepStrictEqual(crossProductRationalMemo(i, k), [q(0n), q(-1n), q(0n)]);
		});
	});

	describe('normal rational vectors', () => {
		it('computes cross product of integer-valued rational vectors', () => {
			const a = [q(2n), q(3n), q(4n)];
			const b = [q(5n), q(6n), q(7n)];
			// (3*7 - 4*6, 4*5 - 2*7, 2*6 - 3*5) = (-3, 6, -3)
			assert.deepStrictEqual(crossProductRationalMemo(a, b), [q(-3n), q(6n), q(-3n)]);
		});

		it('computes and reduces fractional rational cross products to lowest terms', () => {
			const a = [q(1n, 2n), q(2n, 3n), q(3n, 4n)];
			const b = [q(4n, 5n), q(5n, 6n), q(6n, 7n)];
			// c0 = (2/3)*(6/7) - (3/4)*(5/6) = 4/7 - 5/8 = (32 - 35)/56 = -3/56
			// c1 = (3/4)*(4/5) - (1/2)*(6/7) = 3/5 - 3/7 = (21 - 15)/35 = 6/35
			// c2 = (1/2)*(5/6) - (2/3)*(4/5) = 5/12 - 8/15 = (25 - 32)/60 = -7/60
			assert.deepStrictEqual(crossProductRationalMemo(a, b), [
				q(-3n, 56n),
				q(6n, 35n),
				q(-7n, 60n),
			]);
		});

		it('handles exact large BigInt fractions without precision loss', () => {
			const big = 10n ** 30n;
			const a = [q(big + 1n, 3n), q(big + 2n, 5n), q(1n, 7n)];
			const b = [q(1n, 11n), q(big + 3n, 13n), q(big + 4n, 17n)];
			const res = crossProductRationalMemo(a, b);
			for (const comp of res) {
				assert.ok(comp.den > 0n);
				assert.equal(gcd(comp.num, comp.den), 1n);
			}
			// Independently verify component 0: a[1]*b[2] - a[2]*b[1]
			const expected0 = qSub(qMul(a[1], b[2]), qMul(a[2], b[1]));
			assert.deepStrictEqual(res[0], expected0);
		});
	});

	describe('edge cases', () => {
		const zero = [q(0n), q(0n), q(0n)];

		it('returns the canonical zero vector for parallel and anti-parallel vectors', () => {
			const a = [q(3n, 4n), q(-5n, 6n), q(7n, 8n)];
			const scaled = [q(9n, 8n), q(-5n, 4n), q(21n, 16n)]; // (3/2) * a
			const antiParallel = [q(-6n, 4n), q(10n, 6n), q(-14n, 8n)]; // -2 * a
			assert.deepStrictEqual(crossProductRationalMemo(a, scaled), zero);
			assert.deepStrictEqual(crossProductRationalMemo(a, antiParallel), zero);
			assert.deepStrictEqual(crossProductRationalMemo(a, a), zero);
		});

		it('returns the canonical zero vector when either operand is zero', () => {
			const v = [q(1n, 3n), q(-2n, 5n), q(7n, 11n)];
			assert.deepStrictEqual(crossProductRationalMemo(zero, v), zero);
			assert.deepStrictEqual(crossProductRationalMemo(v, zero), zero);
			assert.deepStrictEqual(crossProductRationalMemo(zero, zero), zero);
		});

		it('normalizes negative denominators and unreduced inputs', () => {
			const a = [q(-6n, -12n), q(4n, -6n), q(0n, -99n)]; // [1/2, -2/3, 0]
			const b = [q(-9n, 12n), q(0n, -7n), q(-10n, -15n)]; // [-3/4, 0, 2/3]
			// c0 = (-2/3)*(2/3) - 0 = -4/9
			// c1 = 0 - (1/2)*(2/3) = -1/3
			// c2 = 0 - (-2/3)*(-3/4) = -1/2
			assert.deepStrictEqual(crossProductRationalMemo(a, b), [
				q(-4n, 9n),
				q(-1n, 3n),
				q(-1n, 2n),
			]);
		});
	});

	describe('input validation', () => {
		const valid = [q(1n), q(2n), q(3n)];

		it('throws TypeError when inputs are not arrays', () => {
			for (const bad of [null, undefined, 42, 'abc', { 0: q(1n), 1: q(2n), 2: q(3n) }]) {
				assert.throws(() => crossProductRationalMemo(bad, valid), TypeError);
				assert.throws(() => crossProductRationalMemo(valid, bad), TypeError);
			}
		});

		it('throws RangeError when vector dimension is not 3', () => {
			for (const bad of [[], [q(1n)], [q(1n), q(2n)], [q(1n), q(2n), q(3n), q(4n)]]) {
				assert.throws(() => crossProductRationalMemo(bad, valid), RangeError);
				assert.throws(() => crossProductRationalMemo(valid, bad), RangeError);
			}
		});

		it('throws TypeError for sparse arrays or invalid rational elements', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [q(1n), , q(3n)];
			assert.throws(() => crossProductRationalMemo(sparse, valid), TypeError);

			const invalidEntries = [
				null,
				undefined,
				1n,
				[1n, 2n],
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: 1n },
				{ den: 2n },
			];
			for (const badEntry of invalidEntries) {
				assert.throws(() => crossProductRationalMemo([badEntry, q(1n), q(1n)], valid), TypeError);
				assert.throws(() => crossProductRationalMemo(valid, [q(1n), badEntry, q(1n)]), TypeError);
			}
		});

		it('throws RangeError for zero denominators', () => {
			assert.throws(() => crossProductRationalMemo([q(1n, 0n), q(1n), q(1n)], valid), RangeError);
			assert.throws(() => crossProductRationalMemo(valid, [q(1n), q(0n, 0n), q(1n)]), RangeError);
		});
	});

	describe('memoization consistency and isolation', () => {
		it('returns identical results across repeated and equivalent unreduced calls', () => {
			const a1 = [q(1n, 2n), q(-3n, 4n), q(5n, 6n)];
			const b1 = [q(-7n, 8n), q(9n, 10n), q(-11n, 12n)];
			const a2 = [q(-5n, -10n), q(9n, -12n), q(15n, 18n)];
			const b2 = [q(14n, -16n), q(-18n, -20n), q(22n, -24n)];

			const r1 = crossProductRationalMemo(a1, b1);
			const r2 = crossProductRationalMemo(a1, b1);
			const r3 = crossProductRationalMemo(a2, b2);

			assert.deepStrictEqual(r1, r2);
			assert.deepStrictEqual(r1, r3);
			assert.notEqual(r1, r2);
			assert.notEqual(r1[0], r2[0]);
		});

		it('does not allow caller mutations to corrupt cached values', () => {
			const a = [q(13n, 7n), q(-5n, 11n), q(2n, 3n)];
			const b = [q(4n, 9n), q(8n, 5n), q(-7n, 2n)];

			const first = crossProductRationalMemo(a, b);
			const snapshot = first.map(({ num, den }) => ({ num, den }));

			// Mutate returned vector and its elements
			first[0].num = 999999n;
			first[0].den = 1n;
			first.push(q(42n));

			const second = crossProductRationalMemo(a, b);
			assert.deepStrictEqual(second, snapshot);

			// Reverse lookup (anti-symmetry cache path) should also stay uncorrupted
			const reversed = crossProductRationalMemo(b, a);
			assert.deepStrictEqual(reversed, vNeg(snapshot));
		});
	});

	describe('algebraic cross-checks', () => {
		const samples = [
			[
				[q(3n, 5n), q(-7n, 2n), q(11n, 6n)],
				[q(-2n, 9n), q(4n, 7n), q(5n, 3n)],
				[q(1n, 4n), q(13n, 8n), q(-9n, 10n)],
			],
			[
				[q(-17n, 13n), q(0n, 1n), q(23n, 19n)],
				[q(29n, 31n), q(-37n, 41n), q(43n, 47n)],
				[q(-53n, 59n), q(61n, 67n), q(0n, 1n)],
			],
		];

		it('satisfies anti-commutativity: a × b === -(b × a)', () => {
			for (const [a, b] of samples) {
				const ab = crossProductRationalMemo(a, b);
				const ba = crossProductRationalMemo(b, a);
				assert.deepStrictEqual(ab, vNeg(ba));
			}
		});

		it('satisfies orthogonality: (a × b)·a === 0 and (a × b)·b === 0', () => {
			for (const [a, b] of samples) {
				const ab = crossProductRationalMemo(a, b);
				assert.deepStrictEqual(vDot(ab, a), q(0n, 1n));
				assert.deepStrictEqual(vDot(ab, b), q(0n, 1n));
			}
		});

		it("satisfies Lagrange's identity: |a × b|² === |a|²|b|² - (a·b)²", () => {
			for (const [a, b] of samples) {
				const ab = crossProductRationalMemo(a, b);
				const lhs = vDot(ab, ab);
				const aDotB = vDot(a, b);
				const rhs = qSub(qMul(vDot(a, a), vDot(b, b)), qMul(aDotB, aDotB));
				assert.deepStrictEqual(lhs, rhs);
			}
		});

		it('satisfies the Jacobi identity: a×(b×c) + b×(c×a) + c×(a×b) === 0', () => {
			for (const [a, b, c] of samples) {
				const t1 = crossProductRationalMemo(a, crossProductRationalMemo(b, c));
				const t2 = crossProductRationalMemo(b, crossProductRationalMemo(c, a));
				const t3 = crossProductRationalMemo(c, crossProductRationalMemo(a, b));
				assert.deepStrictEqual(vAdd(vAdd(t1, t2), t3), [q(0n), q(0n), q(0n)]);
			}
		});

		it('satisfies right distributivity: a × (b + c) === (a × b) + (a × c)', () => {
			for (const [a, b, c] of samples) {
				const lhs = crossProductRationalMemo(a, vAdd(b, c));
				const rhs = vAdd(crossProductRationalMemo(a, b), crossProductRationalMemo(a, c));
				assert.deepStrictEqual(lhs, rhs);
			}
		});
	});
});
