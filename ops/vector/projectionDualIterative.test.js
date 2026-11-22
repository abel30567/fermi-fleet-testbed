import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { projectionDualIterative } from './projectionDualIterative.js';

function assertClose(actual, expected, tol = 1e-12, label = '') {
	const diff = Math.abs(actual - expected);
	assert.ok(
		diff <= tol,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`
	);
}

function assertDualVecClose(actual, expected, tol = 1e-12) {
	assert.equal(actual.length, expected.length);
	for (let i = 0; i < actual.length; i++) {
		assertClose(actual[i].v, expected[i].v, tol, `index ${i} primal v`);
		assertClose(actual[i].d, expected[i].d, tol, `index ${i} derivative d`);
	}
}

function dualDot(a, b) {
	let v = 0;
	let d = 0;
	for (let i = 0; i < a.length; i++) {
		v += a[i].v * b[i].v;
		d += a[i].v * b[i].d + a[i].d * b[i].v;
	}
	return { v, d };
}

function dualSubVec(a, b) {
	return a.map((ai, i) => ({ v: ai.v - b[i].v, d: ai.d - b[i].d }));
}

function dualScaleVec(scalar, vec) {
	return vec.map((x) => ({
		v: scalar.v * x.v,
		d: scalar.v * x.d + scalar.d * x.v,
	}));
}

function primalProjection(u, onto) {
	let num = 0;
	let den = 0;
	for (let i = 0; i < u.length; i++) {
		num += u[i] * onto[i];
		den += onto[i] * onto[i];
	}
	const s = num / den;
	return onto.map((bi) => s * bi);
}

describe('projectionDualIterative', () => {
	describe('normal cases', () => {
		it('computes exact 2D dual vector projection (primal and derivative)', () => {
			// u(t) = [3 + 2t, 4 - t], onto(t) = [1 + t, 0 + 2t] at t = 0
			// u·b = (3)(1) + (4)(0) = 3
			// (u·b)' = (2)(1) + (3)(1) + (-1)(0) + (4)(2) = 2 + 3 + 0 + 8 = 13
			// b·b = 1^2 + 0^2 = 1
			// (b·b)' = 2*(1*1 + 0*2) = 2
			// s = (3, 13) / (1, 2) = (3, (13 - 3*2)/1) = (3, 7)
			// proj[0] = (3, 7) * (1, 1) = (3, 3 + 7) = (3, 10)
			// proj[1] = (3, 7) * (0, 2) = (0, 6 + 0) = (0, 6)
			const u = [
				{ v: 3, d: 2 },
				{ v: 4, d: -1 },
			];
			const onto = [
				{ v: 1, d: 1 },
				{ v: 0, d: 2 },
			];
			const result = projectionDualIterative(u, onto);
			assertDualVecClose(result, [
				{ v: 3, d: 10 },
				{ v: 0, d: 6 },
			]);
		});

		it('computes exact 3D dual vector projection', () => {
			// u = [(1, 1), (2, -1), (3, 0.5)], onto = [(2, 0), (1, 1), (-2, 2)]
			// num = (2, 2) + (2, 1) + (-6, 5) = (-2, 8)
			// den = (4, 0) + (1, 2) + (4, -8) = (9, -6)
			// s = (-2/9, (8 - (-2/9)*(-6))/9) = (-2/9, (8 - 4/3)/9) = (-2/9, 20/27)
			const u = [
				{ v: 1, d: 1 },
				{ v: 2, d: -1 },
				{ v: 3, d: 0.5 },
			];
			const onto = [
				{ v: 2, d: 0 },
				{ v: 1, d: 1 },
				{ v: -2, d: 2 },
			];
			const sv = -2 / 9;
			const sd = 20 / 27;
			const expected = [
				{ v: sv * 2, d: sv * 0 + sd * 2 },
				{ v: sv * 1, d: sv * 1 + sd * 1 },
				{ v: sv * -2, d: sv * 2 + sd * -2 },
			];
			const result = projectionDualIterative(u, onto);
			assertDualVecClose(result, expected);
		});

		it('preserves zero derivatives when all input derivatives are zero', () => {
			const u = [
				{ v: 5, d: 0 },
				{ v: -3, d: 0 },
				{ v: 2, d: 0 },
			];
			const onto = [
				{ v: 1, d: 0 },
				{ v: 2, d: 0 },
				{ v: 2, d: 0 },
			];
			// u·onto = 5 - 6 + 4 = 3; onto·onto = 1 + 4 + 4 = 9; s = 1/3
			const result = projectionDualIterative(u, onto);
			assertDualVecClose(result, [
				{ v: 1 / 3, d: 0 },
				{ v: 2 / 3, d: 0 },
				{ v: 2 / 3, d: 0 },
			]);
		});

		it('does not mutate input arrays or dual elements', () => {
			const u = [
				{ v: 2, d: 1 },
				{ v: -1, d: 3 },
			];
			const onto = [
				{ v: 4, d: -2 },
				{ v: 2, d: 5 },
			];
			const uSnap = structuredClone(u);
			const ontoSnap = structuredClone(onto);

			const result = projectionDualIterative(u, onto);
			assert.deepEqual(u, uSnap);
			assert.deepEqual(onto, ontoSnap);
			assert.notEqual(result, u);
			assert.notEqual(result, onto);
		});
	});

	describe('edge cases', () => {
		it('returns u unchanged (primal and derivative) when u is parallel to onto', () => {
			const onto = [
				{ v: 2, d: -0.5 },
				{ v: -3, d: 1.2 },
				{ v: 4, d: 0.7 },
			];
			const k = { v: -2.5, d: 1.75 };
			const u = dualScaleVec(k, onto);

			const result = projectionDualIterative(u, onto);
			assertDualVecClose(result, u);
		});

		it('returns zero dual vector when u and onto are identically orthogonal', () => {
			// u(t) = [cos(t), sin(t)], onto(t) = [-sin(t), cos(t)] at t = 0.7
			const t = 0.7;
			const u = [
				{ v: Math.cos(t), d: -Math.sin(t) },
				{ v: Math.sin(t), d: Math.cos(t) },
			];
			const onto = [
				{ v: -Math.sin(t), d: -Math.cos(t) },
				{ v: Math.cos(t), d: -Math.sin(t) },
			];
			const result = projectionDualIterative(u, onto);
			assertDualVecClose(result, [
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
			]);
		});

		it('captures non-zero derivative when primal vectors are instantaneously orthogonal', () => {
			// u = [0, 1] with u' = [2, 0]; onto = [1, 0] with onto' = [0, 0]
			// primal projection is [0, 0], derivative is [2, 0]
			const u = [
				{ v: 0, d: 2 },
				{ v: 1, d: 0 },
			];
			const onto = [
				{ v: 1, d: 0 },
				{ v: 0, d: 0 },
			];
			const result = projectionDualIterative(u, onto);
			assertDualVecClose(result, [
				{ v: 0, d: 2 },
				{ v: 0, d: 0 },
			]);
		});

		it('is invariant to scaling onto by any non-zero dual scalar', () => {
			const u = [
				{ v: 1.5, d: -0.4 },
				{ v: -2.2, d: 3.1 },
				{ v: 4.0, d: 0.8 },
			];
			const onto = [
				{ v: -1.2, d: 0.9 },
				{ v: 0.7, d: -1.5 },
				{ v: 2.3, d: 0.3 },
			];
			const base = projectionDualIterative(u, onto);

			for (const k of [
				{ v: 3, d: 0 },
				{ v: -0.25, d: 0 },
				{ v: 2.5, d: -4.1 },
				{ v: -7.2, d: 1.8 },
			]) {
				const scaledOnto = dualScaleVec(k, onto);
				const scaledResult = projectionDualIterative(u, scaledOnto);
				assertDualVecClose(scaledResult, base, 1e-11);
			}
		});

		it('projects 1D dual vectors identically to u regardless of onto', () => {
			const u = [{ v: -3.5, d: 2.25 }];
			const onto = [{ v: 4.2, d: -1.7 }];
			const result = projectionDualIterative(u, onto);
			assertDualVecClose(result, u);
		});

		it('handles zero u vector with zero or non-zero derivative', () => {
			const onto = [
				{ v: 3, d: 1 },
				{ v: 4, d: -2 },
			];
			const zeroU = [
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
			];
			assertDualVecClose(projectionDualIterative(zeroU, onto), [
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
			]);

			// u = (0, [1, 2]), onto = ([3, 4], [1, -2])
			// num = (0, 1*3 + 2*4) = (0, 11); den = (25, ...); s = (0, 11/25)
			// proj = [(0, 33/25), (0, 44/25)]
			const movingZeroU = [
				{ v: 0, d: 1 },
				{ v: 0, d: 2 },
			];
			assertDualVecClose(projectionDualIterative(movingZeroU, onto), [
				{ v: 0, d: 33 / 25 },
				{ v: 0, d: 44 / 25 },
			]);
		});

		it('throws RangeError when onto has zero primal norm', () => {
			const u = [
				{ v: 1, d: 2 },
				{ v: 3, d: 4 },
			];
			assert.throws(
				() =>
					projectionDualIterative(u, [
						{ v: 0, d: 0 },
						{ v: 0, d: 0 },
					]),
				RangeError
			);
			// Non-zero derivative parts still have zero primal norm
			assert.throws(
				() =>
					projectionDualIterative(u, [
						{ v: 0, d: 5 },
						{ v: 0, d: -2 },
					]),
				RangeError
			);
		});

		it('throws RangeError for empty or mismatched-length arrays', () => {
			assert.throws(() => projectionDualIterative([], []), RangeError);
			assert.throws(
				() => projectionDualIterative([], [{ v: 1, d: 0 }]),
				RangeError
			);
			assert.throws(
				() => projectionDualIterative([{ v: 1, d: 0 }], []),
				RangeError
			);
			assert.throws(
				() =>
					projectionDualIterative(
						[{ v: 1, d: 0 }],
						[
							{ v: 1, d: 0 },
							{ v: 2, d: 0 },
						]
					),
				RangeError
			);
		});

		it('throws TypeError for non-array inputs or invalid dual elements', () => {
			const valid = [{ v: 1, d: 0 }];

			for (const bad of [null, undefined, 42, 'vec', { v: 1, d: 0 }]) {
				assert.throws(() => projectionDualIterative(bad, valid), TypeError);
				assert.throws(() => projectionDualIterative(valid, bad), TypeError);
			}

			for (const badEl of [
				null,
				undefined,
				5,
				'1',
				[1, 0],
				{},
				{ v: 1 },
				{ d: 0 },
				{ v: '1', d: 0 },
				{ v: 1, d: '0' },
				{ v: NaN, d: 0 },
				{ v: 1, d: NaN },
				{ v: Infinity, d: 0 },
				{ v: 1, d: -Infinity },
			]) {
				assert.throws(() => projectionDualIterative([badEl], valid), TypeError);
				assert.throws(() => projectionDualIterative(valid, [badEl]), TypeError);
			}

			// Sparse array hole
			const sparse = new Array(1);
			assert.throws(() => projectionDualIterative(sparse, valid), TypeError);
			assert.throws(() => projectionDualIterative(valid, sparse), TypeError);
		});
	});

	describe('mathematical and numerical cross-checks', () => {
		it('satisfies idempotence: proj(proj(u, b), b) == proj(u, b)', () => {
			const u = [
				{ v: 2.3, d: -1.1 },
				{ v: -0.7, d: 4.2 },
				{ v: 5.1, d: 0.6 },
				{ v: -3.4, d: -2.8 },
			];
			const b = [
				{ v: -1.5, d: 0.4 },
				{ v: 2.2, d: -1.3 },
				{ v: 0.8, d: 2.7 },
				{ v: 1.9, d: -0.5 },
			];

			const once = projectionDualIterative(u, b);
			const twice = projectionDualIterative(once, b);
			assertDualVecClose(twice, once, 1e-12);
		});

		it('satisfies dual orthogonality: (u - proj(u, b)) · b == { v: 0, d: 0 }', () => {
			const u = [
				{ v: 4.1, d: -2.3 },
				{ v: -1.7, d: 0.9 },
				{ v: 3.3, d: 5.2 },
				{ v: -0.6, d: 1.4 },
			];
			const b = [
				{ v: 1.2, d: 3.1 },
				{ v: -2.5, d: -0.8 },
				{ v: 0.4, d: 1.9 },
				{ v: 2.8, d: -2.2 },
			];

			const p = projectionDualIterative(u, b);
			const residual = dualSubVec(u, p);
			const dot = dualDot(residual, b);
			assertClose(dot.v, 0, 1e-12, 'orthogonality primal');
			assertClose(dot.d, 0, 1e-12, 'orthogonality derivative');
		});

		it('matches central finite-difference derivative of proj_{b(t)}(u(t))', () => {
			const uAt = (t) => [
				Math.sin(1.3 * t) + 0.5 * t * t,
				Math.exp(0.4 * t) - 2.0,
				Math.cos(0.9 * t) * (1 + t),
				t * t * t - 1.5 * t + 0.8,
			];
			const uPrimeAt = (t) => [
				1.3 * Math.cos(1.3 * t) + t,
				0.4 * Math.exp(0.4 * t),
				-0.9 * Math.sin(0.9 * t) * (1 + t) + Math.cos(0.9 * t),
				3 * t * t - 1.5,
			];
			const bAt = (t) => [
				Math.cos(0.7 * t) + 1.5,
				Math.sin(1.1 * t) - 0.3 * t,
				0.6 * t * t + 0.9,
				-Math.exp(-0.5 * t) + 0.2 * t,
			];
			const bPrimeAt = (t) => [
				-0.7 * Math.sin(0.7 * t),
				1.1 * Math.cos(1.1 * t) - 0.3,
				1.2 * t,
				0.5 * Math.exp(-0.5 * t) + 0.2,
			];

			const h = 1e-6;
			for (const t0 of [-0.8, 0.35, 1.4]) {
				const u0 = uAt(t0);
				const du0 = uPrimeAt(t0);
				const b0 = bAt(t0);
				const db0 = bPrimeAt(t0);

				const dualU = u0.map((v, i) => ({ v, d: du0[i] }));
				const dualB = b0.map((v, i) => ({ v, d: db0[i] }));

				const dualProj = projectionDualIterative(dualU, dualB);
				const primalProj0 = primalProjection(u0, b0);
				const projPlus = primalProjection(uAt(t0 + h), bAt(t0 + h));
				const projMinus = primalProjection(uAt(t0 - h), bAt(t0 - h));

				for (let i = 0; i < dualProj.length; i++) {
					const fd = (projPlus[i] - projMinus[i]) / (2 * h);
					assertClose(
						dualProj[i].v,
						primalProj0[i],
						1e-12,
						`t0=${t0} index ${i} primal`
					);
					assertClose(
						dualProj[i].d,
						fd,
						1e-8,
						`t0=${t0} index ${i} finite-difference derivative`
					);
				}
			}
		});
	});
});
