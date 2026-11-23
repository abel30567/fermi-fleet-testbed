import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crossProductDualMemo } from './crossProductDualMemo.js';

/**
 * Helper to construct a dual number `{ v, d }`.
 * @param {number} v
 * @param {number} [d=0]
 * @returns {{ v: number, d: number }}
 */
function dual(v, d = 0) {
	return { v, d };
}

/**
 * Plain real 3D cross product for independent verification.
 * @param {[number, number, number]} a
 * @param {[number, number, number]} b
 * @returns {[number, number, number]}
 */
function realCross(a, b) {
	return [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0],
	];
}

/**
 * Dual dot product `Σ a[i] * b[i]` for orthogonality checks.
 * @param {Array<{ v: number, d: number }>} a
 * @param {Array<{ v: number, d: number }>} b
 * @returns {{ v: number, d: number }}
 */
function dualDot(a, b) {
	let v = 0;
	let d = 0;
	for (let i = 0; i < 3; i++) {
		v += a[i].v * b[i].v;
		d += a[i].v * b[i].d + a[i].d * b[i].v;
	}
	return { v, d };
}

/**
 * Asserts two dual 3D vectors are equal within tolerance `eps`.
 */
function assertDualVecClose(actual, expected, eps = 1e-12) {
	assert.equal(actual.length, 3);
	for (let i = 0; i < 3; i++) {
		assert.ok(
			Math.abs(actual[i].v - expected[i].v) <= eps,
			`component ${i}.v: expected ${expected[i].v}, got ${actual[i].v}`,
		);
		assert.ok(
			Math.abs(actual[i].d - expected[i].d) <= eps,
			`component ${i}.d: expected ${expected[i].d}, got ${actual[i].d}`,
		);
	}
}

describe('crossProductDualMemo', () => {
	describe('normal cases', () => {
		it('computes primal and derivative components for general dual vectors', () => {
			const a = [dual(1, 2), dual(3, -1), dual(4, 0.5)];
			const b = [dual(2, -3), dual(-5, 4), dual(1, 2)];

			// Manual calculation:
			// a_v × b_v = [3*1 - 4*(-5), 4*2 - 1*1, 1*(-5) - 3*2] = [23, 7, -11]
			// a_d × b_v = [(-1)*1 - 0.5*(-5), 0.5*2 - 2*1, 2*(-5) - (-1)*2] = [1.5, -1, -8]
			// a_v × b_d = [3*2 - 4*4, 4*(-3) - 1*2, 1*4 - 3*(-3)] = [-10, -14, 13]
			// total d   = [-8.5, -15, 5]
			const res = crossProductDualMemo(a, b);
			assert.deepStrictEqual(res, [
				{ v: 23, d: -8.5 },
				{ v: 7, d: -15 },
				{ v: -11, d: 5 },
			]);
		});

		it('handles fractional and negative values accurately', () => {
			const a = [dual(-1.5, 0.25), dual(2.25, -0.75), dual(-0.5, 1.5)];
			const b = [dual(0.5, 1.25), dual(-3.5, 0.5), dual(4.0, -2.0)];

			const av = a.map((x) => x.v);
			const ad = a.map((x) => x.d);
			const bv = b.map((x) => x.v);
			const bd = b.map((x) => x.d);

			const expectedV = realCross(av, bv);
			const d1 = realCross(ad, bv);
			const d2 = realCross(av, bd);
			const expected = [0, 1, 2].map((i) => ({
				v: expectedV[i],
				d: d1[i] + d2[i],
			}));

			assertDualVecClose(crossProductDualMemo(a, b), expected, 1e-14);
		});
	});

	describe('basis vectors', () => {
		const e1 = [dual(1, 0), dual(0, 0), dual(0, 0)];
		const e2 = [dual(0, 0), dual(1, 0), dual(0, 0)];
		const e3 = [dual(0, 0), dual(0, 0), dual(1, 0)];

		it('satisfies right-hand rule for standard basis vectors', () => {
			assert.deepStrictEqual(crossProductDualMemo(e1, e2), e3);
			assert.deepStrictEqual(crossProductDualMemo(e2, e3), e1);
			assert.deepStrictEqual(crossProductDualMemo(e3, e1), e2);

			assert.deepStrictEqual(crossProductDualMemo(e2, e1), [
				dual(0, 0),
				dual(0, 0),
				dual(-1, 0),
			]);
			assert.deepStrictEqual(crossProductDualMemo(e3, e2), [
				dual(-1, 0),
				dual(0, 0),
				dual(0, 0),
			]);
			assert.deepStrictEqual(crossProductDualMemo(e1, e3), [
				dual(0, 0),
				dual(-1, 0),
				dual(0, 0),
			]);
		});

		it('propagates derivatives when basis vectors are perturbed', () => {
			// a(t) = (1, t, 0), b(t) = (0, 1, 2t) at t = 0
			// a(t) × b(t) = (2t², -2t, 1) -> at t=0: v=(0,0,1), d=(0,-2,0)
			const a = [dual(1, 0), dual(0, 1), dual(0, 0)];
			const b = [dual(0, 0), dual(1, 0), dual(0, 2)];
			assert.deepStrictEqual(crossProductDualMemo(a, b), [
				dual(0, 0),
				dual(0, -2),
				dual(1, 0),
			]);
		});
	});

	describe('parallel, zero, and anti-commutative cases', () => {
		it('returns zero primal and derivative for self cross product a × a', () => {
			const a = [dual(3.5, -1.2), dual(-2.1, 4.3), dual(7.8, 0.9)];
			assert.deepStrictEqual(crossProductDualMemo(a, a), [
				dual(0, 0),
				dual(0, 0),
				dual(0, 0),
			]);
		});

		it('handles parallel primal vectors with non-parallel derivatives', () => {
			// a = (1, 2, 3) + ε(1, 0, 0), b = 2*(1, 2, 3) + ε(0, 1, 0)
			// primal is 0, derivative is (1,0,0)×(2,4,6) + (1,2,3)×(0,1,0)
			// = (0, -6, 4) + (-3, 0, 1) = (-3, -6, 5)
			const a = [dual(1, 1), dual(2, 0), dual(3, 0)];
			const b = [dual(2, 0), dual(4, 1), dual(6, 0)];
			assert.deepStrictEqual(crossProductDualMemo(a, b), [
				dual(0, -3),
				dual(0, -6),
				dual(0, 5),
			]);
		});

		it('returns zero for cross product with zero dual vector', () => {
			const zero = [dual(0, 0), dual(0, 0), dual(0, 0)];
			const a = [dual(5, -2), dual(3, 4), dual(-1, 7)];
			assert.deepStrictEqual(crossProductDualMemo(a, zero), zero);
			assert.deepStrictEqual(crossProductDualMemo(zero, a), zero);
		});

		it('is anti-commutative: a × b === -(b × a) in both primal and derivative', () => {
			const a = [dual(2.5, -1.5), dual(-4.0, 3.25), dual(1.75, 0.5)];
			const b = [dual(-3.0, 2.0), dual(0.75, -1.25), dual(5.5, -0.75)];
			const ab = crossProductDualMemo(a, b);
			const ba = crossProductDualMemo(b, a);

			for (let i = 0; i < 3; i++) {
				assert.equal(ab[i].v, -ba[i].v);
				assert.equal(ab[i].d, -ba[i].d);
			}
		});
	});

	describe('invalid inputs', () => {
		const valid = [dual(1, 0), dual(2, 0), dual(3, 0)];

		it('rejects non-array arguments with TypeError', () => {
			for (const bad of [null, undefined, 42, 'abc', { 0: dual(1), 1: dual(2), 2: dual(3) }]) {
				assert.throws(() => crossProductDualMemo(bad, valid), TypeError);
				assert.throws(() => crossProductDualMemo(valid, bad), TypeError);
			}
		});

		it('rejects arrays with length !== 3 with RangeError', () => {
			assert.throws(() => crossProductDualMemo([], valid), RangeError);
			assert.throws(() => crossProductDualMemo([dual(1), dual(2)], valid), RangeError);
			assert.throws(
				() => crossProductDualMemo(valid, [dual(1), dual(2), dual(3), dual(4)]),
				RangeError,
			);
		});

		it('rejects non-dual elements with TypeError', () => {
			const badVectors = [
				[null, dual(2), dual(3)],
				[1, 2, 3],
				[[1, 0], dual(2), dual(3)],
				[{ v: 1 }, dual(2), dual(3)],
				[{ d: 1 }, dual(2), dual(3)],
				[{ v: '1', d: 0 }, dual(2), dual(3)],
				[{ v: 1, d: null }, dual(2), dual(3)],
			];
			for (const bad of badVectors) {
				assert.throws(() => crossProductDualMemo(bad, valid), TypeError);
				assert.throws(() => crossProductDualMemo(valid, bad), TypeError);
			}
		});

		it('rejects non-finite v or d components with RangeError', () => {
			const nonFiniteValues = [NaN, Infinity, -Infinity];
			for (const val of nonFiniteValues) {
				assert.throws(
					() => crossProductDualMemo([dual(val, 0), dual(2), dual(3)], valid),
					RangeError,
				);
				assert.throws(
					() => crossProductDualMemo(valid, [dual(1, 0), dual(2, val), dual(3, 0)]),
					RangeError,
				);
			}
		});
	});

	describe('memoization behavior', () => {
		it('returns deep-cloned fresh arrays and objects on cache hits', () => {
			const a = [dual(7, 1), dual(8, 2), dual(9, 3)];
			const b = [dual(4, -1), dual(5, -2), dual(6, -3)];

			const first = crossProductDualMemo(a, b);
			const second = crossProductDualMemo(a, b);

			assert.deepStrictEqual(first, second);
			assert.notEqual(first, second);
			for (let i = 0; i < 3; i++) {
				assert.notEqual(first[i], second[i]);
			}

			// Mutating returned values must not poison cached entries
			first[0].v = 999999;
			first[0].d = -999999;
			first.push(dual(42, 42));

			const third = crossProductDualMemo(a, b);
			assert.deepStrictEqual(third, second);
			assert.equal(third.length, 3);
		});

		it('normalizes -0 and +0 consistently in cache keys and outputs', () => {
			const aPos = [dual(0, 0), dual(1, 0), dual(0, 0)];
			const aNeg = [dual(-0, -0), dual(1, -0), dual(-0, 0)];
			const b = [dual(0, 0), dual(0, 0), dual(1, 0)];

			const r1 = crossProductDualMemo(aPos, b);
			const r2 = crossProductDualMemo(aNeg, b);
			assert.deepStrictEqual(r1, r2);
			for (const c of r2) {
				assert.ok(!Object.is(c.v, -0));
				assert.ok(!Object.is(c.d, -0));
			}
		});

		it('evicts old entries gracefully beyond bounded cache capacity', () => {
			// Exercise more than MAX_CACHE_SIZE (1024) unique pairs
			const total = 1200;
			const savedFirstA = [dual(1, 0.1), dual(2, 0.2), dual(3, 0.3)];
			const savedFirstB = [dual(0, 1), dual(-1, 0.5), dual(4, -0.5)];
			const expectedFirst = crossProductDualMemo(savedFirstA, savedFirstB);

			for (let k = 1; k <= total; k++) {
				const a = [dual(k, 1), dual(k + 1, -1), dual(k + 2, 0.5)];
				const b = [dual(1, 0), dual(2, 1), dual(3, -1)];
				const out = crossProductDualMemo(a, b);
				// Verify formula: a_v × (1,2,3) = (k+1)*3-(k+2)*2, (k+2)*1-k*3, k*2-(k+1)*1
				// = (k-1, 2-2k, k-1)
				assert.equal(out[0].v, k - 1);
				assert.equal(out[1].v, 2 - 2 * k);
				assert.equal(out[2].v, k - 1);
			}

			// Re-computing evicted entry still yields exact result
			const recomputedFirst = crossProductDualMemo(savedFirstA, savedFirstB);
			assert.deepStrictEqual(recomputedFirst, expectedFirst);
			assert.notEqual(recomputedFirst, expectedFirst);
		});
	});

	describe('independent cross-checks', () => {
		it('matches central finite-difference derivatives on smooth vector curves', () => {
			// Curve a(t) = [sin(t), t^2 + 1, exp(0.5*t)]
			// Curve b(t) = [cos(2t), ln(t + 2), t^3 - t]
			const aCurve = (t) => [Math.sin(t), t * t + 1, Math.exp(0.5 * t)];
			const aDeriv = (t) => [Math.cos(t), 2 * t, 0.5 * Math.exp(0.5 * t)];
			const bCurve = (t) => [Math.cos(2 * t), Math.log(t + 2), t * t * t - t];
			const bDeriv = (t) => [-2 * Math.sin(2 * t), 1 / (t + 2), 3 * t * t - 1];

			const t0 = 0.7;
			const h = 1e-6;

			const av = aCurve(t0);
			const ad = aDeriv(t0);
			const bv = bCurve(t0);
			const bd = bDeriv(t0);

			const aDual = [0, 1, 2].map((i) => dual(av[i], ad[i]));
			const bDual = [0, 1, 2].map((i) => dual(bv[i], bd[i]));

			const result = crossProductDualMemo(aDual, bDual);

			const fPlus = realCross(aCurve(t0 + h), bCurve(t0 + h));
			const fMinus = realCross(aCurve(t0 - h), bCurve(t0 - h));
			const fVal = realCross(av, bv);

			for (let i = 0; i < 3; i++) {
				const fdDeriv = (fPlus[i] - fMinus[i]) / (2 * h);
				assert.ok(
					Math.abs(result[i].v - fVal[i]) < 1e-14,
					`primal mismatch at ${i}`,
				);
				assert.ok(
					Math.abs(result[i].d - fdDeriv) < 1e-8,
					`derivative mismatch at ${i}: dual=${result[i].d}, fd=${fdDeriv}`,
				);
			}
		});

		it('satisfies dual orthogonality: a · (a × b) = 0 and b · (a × b) = 0', () => {
			const pairs = [
				[
					[dual(1.3, -0.7), dual(-2.4, 1.1), dual(3.5, 0.4)],
					[dual(-0.9, 2.2), dual(4.1, -1.5), dual(-1.8, 0.6)],
				],
				[
					[dual(10, 3), dual(-5, 7), dual(2, -4)],
					[dual(6, -1), dual(8, 2), dual(-3, 9)],
				],
			];

			for (const [a, b] of pairs) {
				const c = crossProductDualMemo(a, b);
				const dotA = dualDot(a, c);
				const dotB = dualDot(b, c);

				assert.ok(Math.abs(dotA.v) < 1e-12, `a·(a×b).v = ${dotA.v}`);
				assert.ok(Math.abs(dotA.d) < 1e-12, `a·(a×b).d = ${dotA.d}`);
				assert.ok(Math.abs(dotB.v) < 1e-12, `b·(a×b).v = ${dotB.v}`);
				assert.ok(Math.abs(dotB.d) < 1e-12, `b·(a×b).d = ${dotB.d}`);
			}
		});

		it('satisfies the Jacobi identity in dual algebra', () => {
			const a = [dual(1.2, 0.5), dual(-0.8, 1.3), dual(2.1, -0.4)];
			const b = [dual(-1.5, 0.9), dual(2.4, -0.7), dual(0.6, 1.1)];
			const c = [dual(0.3, -1.2), dual(1.7, 0.8), dual(-2.2, 0.3)];

			const t1 = crossProductDualMemo(a, crossProductDualMemo(b, c));
			const t2 = crossProductDualMemo(b, crossProductDualMemo(c, a));
			const t3 = crossProductDualMemo(c, crossProductDualMemo(a, b));

			for (let i = 0; i < 3; i++) {
				assert.ok(Math.abs(t1[i].v + t2[i].v + t3[i].v) < 1e-12);
				assert.ok(Math.abs(t1[i].d + t2[i].d + t3[i].d) < 1e-12);
			}
		});
	});
});
