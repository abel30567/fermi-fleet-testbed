import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crossProductDualIterative } from './crossProductDualIterative.js';

/**
 * Independent plain real 3D cross product for cross-checking identities and finite differences.
 * @param {[number, number, number]} u
 * @param {[number, number, number]} w
 * @returns {[number, number, number]}
 */
function realCross(u, w) {
	return [
		u[1] * w[2] - u[2] * w[1],
		u[2] * w[0] - u[0] * w[2],
		u[0] * w[1] - u[1] * w[0],
	];
}

/**
 * Dual number dot product for verifying orthogonality in dual algebra.
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

function assertDualVecClose(actual, expected, tol = 1e-12) {
	assert.equal(actual.length, 3);
	for (let i = 0; i < 3; i++) {
		assert.ok(
			Math.abs(actual[i].v - expected[i].v) <= tol,
			`component ${i}.v: expected ${expected[i].v}, got ${actual[i].v}`,
		);
		assert.ok(
			Math.abs(actual[i].d - expected[i].d) <= tol,
			`component ${i}.d: expected ${expected[i].d}, got ${actual[i].d}`,
		);
	}
}

describe('crossProductDualIterative', () => {
	describe('normal cases', () => {
		it('computes standard basis vector cross products with zero derivatives', () => {
			const e1 = [{ v: 1, d: 0 }, { v: 0, d: 0 }, { v: 0, d: 0 }];
			const e2 = [{ v: 0, d: 0 }, { v: 1, d: 0 }, { v: 0, d: 0 }];
			const e3 = [{ v: 0, d: 0 }, { v: 0, d: 0 }, { v: 1, d: 0 }];

			assert.deepStrictEqual(crossProductDualIterative(e1, e2), e3);
			assert.deepStrictEqual(crossProductDualIterative(e2, e3), e1);
			assert.deepStrictEqual(crossProductDualIterative(e3, e1), e2);
			assert.deepStrictEqual(crossProductDualIterative(e2, e1), [
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: -1, d: 0 },
			]);
		});

		it('computes exact primal values and derivatives for general dual vectors', () => {
			const a = [
				{ v: 2, d: 1 },
				{ v: 3, d: -2 },
				{ v: 4, d: 0.5 },
			];
			const b = [
				{ v: 5, d: -1 },
				{ v: 6, d: 3 },
				{ v: 7, d: 2 },
			];

			// c0: a1*b2 - a2*b1 = (3*7 - 4*6) = -3
			//     d0 = (3*2 + (-2)*7) - (4*3 + 0.5*6) = (6 - 14) - (12 + 3) = -23
			// c1: a2*b0 - a0*b2 = (4*5 - 2*7) = 6
			//     d1 = (4*(-1) + 0.5*5) - (2*2 + 1*7) = (-4 + 2.5) - (4 + 7) = -12.5
			// c2: a0*b1 - a1*b0 = (2*6 - 3*5) = -3
			//     d2 = (2*3 + 1*6) - (3*(-1) + (-2)*5) = 12 - (-13) = 25
			const expected = [
				{ v: -3, d: -23 },
				{ v: 6, d: -12.5 },
				{ v: -3, d: 25 },
			];

			assert.deepStrictEqual(crossProductDualIterative(a, b), expected);
		});

		it('does not mutate input vectors or dual elements', () => {
			const a = [{ v: 1, d: 2 }, { v: 3, d: 4 }, { v: 5, d: 6 }];
			const b = [{ v: 7, d: 8 }, { v: 9, d: 10 }, { v: 11, d: 12 }];
			const aSnapshot = structuredClone(a);
			const bSnapshot = structuredClone(b);

			const out = crossProductDualIterative(a, b);
			assert.deepStrictEqual(a, aSnapshot);
			assert.deepStrictEqual(b, bSnapshot);
			assert.notEqual(out, a);
			assert.notEqual(out, b);
		});
	});

	describe('edge cases', () => {
		it('handles zero vectors with zero and non-zero derivatives', () => {
			const zero = [{ v: 0, d: 0 }, { v: 0, d: 0 }, { v: 0, d: 0 }];
			const v = [{ v: 1, d: 2 }, { v: -3, d: 4 }, { v: 5, d: -6 }];
			assert.deepStrictEqual(crossProductDualIterative(zero, v), zero);
			assert.deepStrictEqual(crossProductDualIterative(v, zero), zero);

			// Zero primal with non-zero derivative: (0 + ε a') × (b + ε b') = 0 + ε (a' × b)
			const zeroPrimal = [{ v: 0, d: 1 }, { v: 0, d: 2 }, { v: 0, d: 3 }];
			const b = [{ v: 4, d: 10 }, { v: 5, d: 20 }, { v: 6, d: 30 }];
			const res = crossProductDualIterative(zeroPrimal, b);
			assert.deepStrictEqual(res, [
				{ v: 0, d: -3 },
				{ v: 0, d: 6 },
				{ v: 0, d: -3 },
			]);
		});

		it('returns zero primal and zero derivative for identical dual vectors (a × a = 0)', () => {
			const a = [{ v: -2.5, d: 3.1 }, { v: 4.2, d: -1.7 }, { v: 0.8, d: 2.9 }];
			const res = crossProductDualIterative(a, a);
			assertDualVecClose(res, [
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
			]);
		});

		it('handles parallel primal vectors with non-zero derivative', () => {
			// a(t) = [1, t, 0], b(t) = [-2, 0, 0] evaluated at t = 0
			// a(0) × b(0) = [0, 0, 0], d/dt(a × b)|_{t=0} = [0, 1, 0] × [-2, 0, 0] = [0, 0, 2]
			const a = [{ v: 1, d: 0 }, { v: 0, d: 1 }, { v: 0, d: 0 }];
			const b = [{ v: -2, d: 0 }, { v: 0, d: 0 }, { v: 0, d: 0 }];
			assert.deepStrictEqual(crossProductDualIterative(a, b), [
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 0, d: 2 },
			]);
		});

		it('normalizes negative zero to positive zero', () => {
			const a = [{ v: -0, d: -0 }, { v: -1, d: 0 }, { v: 0, d: -0 }];
			const b = [{ v: 0, d: 0 }, { v: 0, d: -0 }, { v: 0, d: 0 }];
			const res = crossProductDualIterative(a, b);
			for (const comp of res) {
				assert.ok(Object.is(comp.v, 0));
				assert.ok(Object.is(comp.d, 0));
			}
		});
	});

	describe('independent cross-checks', () => {
		it('matches central finite-difference derivative for smooth vector functions', () => {
			const evalA = (t) => [Math.sin(t), Math.cos(2 * t), t * t + 1];
			const evalADot = (t) => [Math.cos(t), -2 * Math.sin(2 * t), 2 * t];
			const evalB = (t) => [Math.exp(0.3 * t), t * t * t - t, Math.sin(3 * t + 0.5)];
			const evalBDot = (t) => [0.3 * Math.exp(0.3 * t), 3 * t * t - 1, 3 * Math.cos(3 * t + 0.5)];

			const h = 1e-6;
			for (const t of [-1.2, 0, 0.75, 2.3]) {
				const aVal = evalA(t);
				const aDot = evalADot(t);
				const bVal = evalB(t);
				const bDot = evalBDot(t);

				const aDual = [0, 1, 2].map((i) => ({ v: aVal[i], d: aDot[i] }));
				const bDual = [0, 1, 2].map((i) => ({ v: bVal[i], d: bDot[i] }));

				const actual = crossProductDualIterative(aDual, bDual);

				const expectedV = realCross(aVal, bVal);
				const plus = realCross(evalA(t + h), evalB(t + h));
				const minus = realCross(evalA(t - h), evalB(t - h));
				const fd = [0, 1, 2].map((i) => (plus[i] - minus[i]) / (2 * h));

				for (let i = 0; i < 3; i++) {
					assert.ok(Math.abs(actual[i].v - expectedV[i]) < 1e-12);
					assert.ok(
						Math.abs(actual[i].d - fd[i]) < 1e-7,
						`t=${t}, i=${i}: dual d=${actual[i].d}, finite diff=${fd[i]}`,
					);
				}
			}
		});

		it('satisfies Leibniz product rule: d(a × b) = (da × b) + (a × db)', () => {
			const a = [{ v: 1.5, d: -0.7 }, { v: -2.3, d: 4.1 }, { v: 0.9, d: -1.2 }];
			const b = [{ v: -3.4, d: 2.2 }, { v: 1.1, d: -0.5 }, { v: 2.8, d: 3.6 }];

			const res = crossProductDualIterative(a, b);
			const av = a.map((x) => x.v);
			const ad = a.map((x) => x.d);
			const bv = b.map((x) => x.v);
			const bd = b.map((x) => x.d);

			const vCross = realCross(av, bv);
			const term1 = realCross(ad, bv);
			const term2 = realCross(av, bd);
			const expected = [0, 1, 2].map((i) => ({ v: vCross[i], d: term1[i] + term2[i] }));

			assertDualVecClose(res, expected, 1e-12);
		});

		it('satisfies anti-commutativity, dual orthogonality, and the Jacobi identity', () => {
			const a = [{ v: 1.2, d: 0.5 }, { v: -0.8, d: 1.4 }, { v: 2.1, d: -0.3 }];
			const b = [{ v: -1.5, d: 2.0 }, { v: 0.4, d: -1.1 }, { v: 1.7, d: 0.9 }];
			const c = [{ v: 0.6, d: -1.3 }, { v: 2.5, d: 0.7 }, { v: -1.9, d: 1.6 }];

			// Anti-commutativity: a × b = -(b × a)
			const ab = crossProductDualIterative(a, b);
			const ba = crossProductDualIterative(b, a);
			assertDualVecClose(
				ab,
				ba.map((x) => ({ v: -x.v, d: -x.d })),
			);

			// Dual orthogonality: (a × b) · a = 0 and (a × b) · b = 0
			const dotA = dualDot(ab, a);
			const dotB = dualDot(ab, b);
			assert.ok(Math.abs(dotA.v) < 1e-12 && Math.abs(dotA.d) < 1e-12);
			assert.ok(Math.abs(dotB.v) < 1e-12 && Math.abs(dotB.d) < 1e-12);

			// Jacobi identity: a × (b × c) + b × (c × a) + c × (a × b) = 0
			const t1 = crossProductDualIterative(a, crossProductDualIterative(b, c));
			const t2 = crossProductDualIterative(b, crossProductDualIterative(c, a));
			const t3 = crossProductDualIterative(c, ab);
			for (let i = 0; i < 3; i++) {
				assert.ok(Math.abs(t1[i].v + t2[i].v + t3[i].v) < 1e-11);
				assert.ok(Math.abs(t1[i].d + t2[i].d + t3[i].d) < 1e-11);
			}
		});
	});

	describe('invalid inputs', () => {
		const valid = [{ v: 1, d: 0 }, { v: 0, d: 1 }, { v: 0, d: 0 }];

		it('throws TypeError when a or b is not an array', () => {
			for (const bad of [null, undefined, 42, 'vec', { 0: { v: 1, d: 0 } }]) {
				assert.throws(() => crossProductDualIterative(bad, valid), TypeError);
				assert.throws(() => crossProductDualIterative(valid, bad), TypeError);
			}
		});

		it('throws RangeError when vector length is not 3', () => {
			assert.throws(() => crossProductDualIterative([], valid), RangeError);
			assert.throws(() => crossProductDualIterative(valid.slice(0, 2), valid), RangeError);
			assert.throws(
				() => crossProductDualIterative(valid, [...valid, { v: 0, d: 0 }]),
				RangeError,
			);
		});

		it('throws TypeError for sparse arrays or non-object dual elements', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [{ v: 1, d: 0 }, , { v: 0, d: 0 }];
			assert.throws(() => crossProductDualIterative(sparse, valid), TypeError);
			assert.throws(() => crossProductDualIterative([null, { v: 0, d: 0 }, { v: 0, d: 0 }], valid), TypeError);
			assert.throws(() => crossProductDualIterative([1, 2, 3], valid), TypeError);
			assert.throws(() => crossProductDualIterative(valid, [[1, 0], { v: 0, d: 0 }, { v: 0, d: 0 }]), TypeError);
		});

		it('throws TypeError when v or d is missing or non-numeric', () => {
			assert.throws(() => crossProductDualIterative([{ v: 1 }, { v: 0, d: 0 }, { v: 0, d: 0 }], valid), TypeError);
			assert.throws(() => crossProductDualIterative([{ d: 1 }, { v: 0, d: 0 }, { v: 0, d: 0 }], valid), TypeError);
			assert.throws(() => crossProductDualIterative(valid, [{ v: '1', d: 0 }, { v: 0, d: 0 }, { v: 0, d: 0 }]), TypeError);
			assert.throws(() => crossProductDualIterative(valid, [{ v: 1, d: null }, { v: 0, d: 0 }, { v: 0, d: 0 }]), TypeError);
		});

		it('throws RangeError when v or d is NaN or Infinity', () => {
			for (const badNum of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
				assert.throws(
					() => crossProductDualIterative([{ v: badNum, d: 0 }, { v: 0, d: 0 }, { v: 0, d: 0 }], valid),
					RangeError,
				);
				assert.throws(
					() => crossProductDualIterative(valid, [{ v: 0, d: badNum }, { v: 0, d: 0 }, { v: 0, d: 0 }]),
					RangeError,
				);
			}
		});
	});
});
