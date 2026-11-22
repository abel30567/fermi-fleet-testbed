import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { arctanDualIterative } from './arctanDualIterative.js';

function assertClose(actual, expected, tol = 1e-14, message = '') {
	assert.ok(
		Number.isFinite(actual),
		`${message ? `${message}: ` : ''}expected finite number, got ${actual}`
	);
	const diff = Math.abs(actual - expected);
	const scale = Math.max(1, Math.abs(expected));
	assert.ok(
		diff <= tol * scale,
		`${message ? `${message}: ` : ''}expected ${actual} to be within ${tol * scale} of ${expected} (diff=${diff})`
	);
}

describe('arctanDualIterative', () => {
	describe('normal cases', () => {
		it('computes exact known angles and derivatives', () => {
			const cases = [
				{ v: 0, d: 1, expectedV: 0, expectedD: 1 },
				{ v: 1, d: 1, expectedV: Math.PI / 4, expectedD: 0.5 },
				{ v: -1, d: 1, expectedV: -Math.PI / 4, expectedD: 0.5 },
				{ v: Math.sqrt(3), d: 1, expectedV: Math.PI / 3, expectedD: 0.25 },
				{ v: -Math.sqrt(3), d: 1, expectedV: -Math.PI / 3, expectedD: 0.25 },
				{ v: 1 / Math.sqrt(3), d: 1, expectedV: Math.PI / 6, expectedD: 0.75 },
				{ v: 0.5, d: 1, expectedV: Math.atan(0.5), expectedD: 1 / 1.25 },
				{ v: -0.5, d: 1, expectedV: Math.atan(-0.5), expectedD: 1 / 1.25 },
			];

			for (const { v, d, expectedV, expectedD } of cases) {
				const res = arctanDualIterative({ v, d });
				assertClose(res.v, expectedV, 1e-14, `primal at v=${v}`);
				assertClose(res.d, expectedD, 1e-14, `derivative at v=${v}`);
			}
		});

		it('scales derivative linearly with arbitrary seed d (chain rule)', () => {
			// Evaluate d/dt arctan(t^2 + 1) at t = 2:
			// g(2) = 5, g'(2) = 4 => derivative = 4 / (1 + 25) = 4 / 26
			const res = arctanDualIterative({ v: 5, d: 4 });
			assertClose(res.v, Math.atan(5), 1e-14, 'primal');
			assertClose(res.d, 4 / 26, 1e-14, 'chain-rule derivative');

			const negSeed = arctanDualIterative({ v: -0.75, d: -2.5 });
			assertClose(negSeed.v, Math.atan(-0.75), 1e-14, 'negative seed primal');
			assertClose(negSeed.d, -2.5 / (1 + 0.5625), 1e-14, 'negative seed derivative');
		});

		it('does not mutate the input object', () => {
			const input = { v: 1.5, d: 2.5 };
			const snapshot = { ...input };
			arctanDualIterative(input);
			assert.deepEqual(input, snapshot);
		});
	});

	describe('edge cases', () => {
		it('handles zero primal and zero derivative', () => {
			const zeroAll = arctanDualIterative({ v: 0, d: 0 });
			assert.equal(zeroAll.v, 0);
			assert.equal(zeroAll.d, 0);

			const negZero = arctanDualIterative({ v: -0, d: 3 });
			assert.ok(Object.is(negZero.v, -0));
			assert.equal(negZero.d, 3);

			const zeroDeriv = arctanDualIterative({ v: 2.5, d: 0 });
			assertClose(zeroDeriv.v, Math.atan(2.5), 1e-14);
			assert.equal(zeroDeriv.d, 0);
		});

		it('handles range-reduction boundaries around ±1 smoothly', () => {
			const boundaryValues = [
				-1 - 1e-12,
				-1,
				-1 + 1e-12,
				1 - 1e-12,
				1,
				1 + 1e-12,
			];

			for (const v of boundaryValues) {
				const res = arctanDualIterative({ v, d: 1 });
				assertClose(res.v, Math.atan(v), 1e-14, `primal at v=${v}`);
				assertClose(res.d, 1 / (1 + v * v), 1e-14, `derivative at v=${v}`);
			}
		});

		it('handles very large inputs without overflow or NaN', () => {
			for (const v of [1e6, -1e6, 1e12, -1e12]) {
				const res = arctanDualIterative({ v, d: 1 });
				assertClose(res.v, Math.atan(v), 1e-14, `primal at v=${v}`);
				assertClose(res.d, 1 / (1 + v * v), 1e-14, `derivative at v=${v}`);
			}

			// Extreme |v| > 1e150 where naive v*v overflows to Infinity
			const huge = arctanDualIterative({ v: 1e200, d: 1e300 });
			assertClose(huge.v, Math.PI / 2, 1e-14, 'primal at 1e200');
			assertClose(huge.d, 1e-100, 1e-14, 'overflow-safe derivative at 1e200');

			const negHuge = arctanDualIterative({ v: -1e200, d: 1 });
			assertClose(negHuge.v, -Math.PI / 2, 1e-14, 'primal at -1e200');
			assert.equal(negHuge.d, 0);
		});

		it('handles very small inputs accurately', () => {
			for (const v of [1e-8, -1e-8, 1e-15, -1e-15, 1e-100, -1e-100]) {
				const res = arctanDualIterative({ v, d: 1 });
				assertClose(res.v, Math.atan(v), 1e-14, `primal at v=${v}`);
				assertClose(res.d, 1 / (1 + v * v), 1e-14, `derivative at v=${v}`);
			}
		});

		it('throws TypeError on invalid dual objects and non-finite components', () => {
			const invalidInputs = [
				undefined,
				null,
				42,
				'0.5',
				true,
				[0.5, 1],
				() => ({ v: 0, d: 1 }),
				{},
				{ v: 1 },
				{ d: 1 },
				{ v: '1', d: 1 },
				{ v: 1, d: '1' },
				{ v: null, d: 1 },
				{ v: 1, d: undefined },
				{ v: Number.NaN, d: 1 },
				{ v: 1, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 1 },
				{ v: Number.NEGATIVE_INFINITY, d: 1 },
				{ v: 1, d: Number.POSITIVE_INFINITY },
				{ v: 1, d: Number.NEGATIVE_INFINITY },
			];

			for (const bad of invalidInputs) {
				assert.throws(
					() => arctanDualIterative(bad),
					{ name: 'TypeError' },
					`expected TypeError for input ${String(bad)}`
				);
			}
		});
	});

	describe('independent cross-checks', () => {
		it('matches Math.atan across a broad grid of positive and negative values', () => {
			const grid = [
				-1e6, -100, -10, -3.14159, -2, -1.0001, -0.9999, -0.5, -0.1, -0.05, -0.01, -1e-8,
				0,
				1e-8, 0.01, 0.05, 0.1, 0.5, 0.9999, 1.0001, 2, 3.14159, 10, 100, 1e6,
			];

			for (const v of grid) {
				const res = arctanDualIterative({ v, d: 1 });
				assertClose(res.v, Math.atan(v), 1e-14, `Math.atan cross-check at v=${v}`);
			}
		});

		it('matches central finite-difference numerical derivatives', () => {
			const points = [-10, -2.5, -1, -0.5, -0.05, 0, 0.05, 0.5, 1, 2.5, 10];
			const h = 1e-6;

			for (const x of points) {
				const dual = arctanDualIterative({ v: x, d: 1 });
				const fdMath = (Math.atan(x + h) - Math.atan(x - h)) / (2 * h);
				const fdSelf = (
					arctanDualIterative({ v: x + h, d: 0 }).v -
					arctanDualIterative({ v: x - h, d: 0 }).v
				) / (2 * h);

				assertClose(dual.d, fdMath, 1e-9, `central FD (Math.atan) at x=${x}`);
				assertClose(dual.d, fdSelf, 1e-9, `central FD (self) at x=${x}`);
			}

			// Composite function f(t) = arctan(sin(t) + 0.5 * t^2)
			const g = (t) => Math.sin(t) + 0.5 * t * t;
			const gPrime = (t) => Math.cos(t) + t;
			for (const t of [-1.7, -0.3, 0.8, 2.1]) {
				const dual = arctanDualIterative({ v: g(t), d: gPrime(t) });
				const fdComposite = (Math.atan(g(t + h)) - Math.atan(g(t - h))) / (2 * h);
				assertClose(dual.d, fdComposite, 1e-8, `composite central FD at t=${t}`);
			}
		});

		it('satisfies algebraic identities (odd symmetry and reciprocal complement)', () => {
			for (const v of [0.02, 0.37, 0.99, 1.5, 7.25, 1e4]) {
				const pos = arctanDualIterative({ v, d: 1 });
				const neg = arctanDualIterative({ v: -v, d: 1 });
				const inv = arctanDualIterative({ v: 1 / v, d: 1 });

				// Odd function: arctan(-v) = -arctan(v), derivative is even
				assertClose(pos.v + neg.v, 0, 1e-14, `odd symmetry at v=${v}`);
				assertClose(pos.d, neg.d, 1e-14, `even derivative at v=${v}`);

				// Reciprocal identity for v > 0: arctan(v) + arctan(1/v) = pi/2
				assertClose(pos.v + inv.v, Math.PI / 2, 1e-14, `reciprocal identity at v=${v}`);
			}
		});
	});
});
