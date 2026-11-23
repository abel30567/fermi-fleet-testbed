import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { magnitudeDualRecursive } from './magnitudeDualRecursive.js';

function assertClose(actual, expected, tol = 1e-12, label = '') {
	const diff = Math.abs(actual - expected);
	const scale = Math.max(1, Math.abs(expected));
	assert.ok(
		diff <= tol * scale,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol * scale} of ${expected} (diff=${diff})`,
	);
}

describe('magnitudeDualRecursive', () => {
	describe('normal cases', () => {
		it('computes magnitude and derivative for 2D Pythagorean triple', () => {
			const res = magnitudeDualRecursive([
				{ v: 3, d: 1 },
				{ v: 4, d: 2 },
			]);
			assertClose(res.v, 5, 1e-15, 'value');
			// (3*1 + 4*2) / 5 = 11 / 5 = 2.2
			assertClose(res.d, 2.2, 1e-15, 'derivative');
		});

		it('computes magnitude and derivative for 3D vector', () => {
			const res = magnitudeDualRecursive([
				{ v: 1, d: 2 },
				{ v: -2, d: 3 },
				{ v: 2, d: -1 },
			]);
			assertClose(res.v, 3, 1e-15, 'value');
			// (1*2 + (-2)*3 + 2*(-1)) / 3 = (2 - 6 - 2) / 3 = -2
			assertClose(res.d, -2, 1e-15, 'derivative');
		});

		it('returns zero derivative for tangent orthogonal to the primal vector', () => {
			const res = magnitudeDualRecursive([
				{ v: 3, d: -4 },
				{ v: 4, d: 3 },
			]);
			assertClose(res.v, 5, 1e-15, 'value');
			assert.equal(Object.is(res.d, 0), true);
		});

		it('scales derivative proportionally when tangent is parallel to primal vector', () => {
			const k = 3.5;
			const primal = [2, -6, 3, 0, -4];
			const vec = primal.map((v) => ({ v, d: k * v }));
			const res = magnitudeDualRecursive(vec);
			const expectedNorm = Math.hypot(...primal);
			assertClose(res.v, expectedNorm, 1e-14, 'value');
			assertClose(res.d, k * expectedNorm, 1e-14, 'derivative');
		});

		it('handles odd and non-power-of-two vector lengths across asymmetric recursive splits', () => {
			for (const len of [1, 2, 3, 5, 7, 13, 31]) {
				const vec = Array.from({ length: len }, (_, i) => ({
					v: (i + 1) * (i % 2 === 0 ? 1 : -1),
					d: 0.5 * (i - 2),
				}));
				const res = magnitudeDualRecursive(vec);
				const expectedV = Math.hypot(...vec.map((x) => x.v));
				const expectedD = vec.reduce((acc, x) => acc + x.v * x.d, 0) / expectedV;
				assertClose(res.v, expectedV, 1e-13, `len=${len} value`);
				assertClose(res.d, expectedD, 1e-13, `len=${len} derivative`);
			}
		});
	});

	describe('edge cases', () => {
		it('returns { v: 0, d: 0 } for an empty vector', () => {
			const res = magnitudeDualRecursive([]);
			assert.deepEqual(res, { v: 0, d: 0 });
			assert.equal(Object.is(res.v, 0), true);
			assert.equal(Object.is(res.d, 0), true);
		});

		it('computes |x| and sign(x) * dx for single-element vectors', () => {
			const pos = magnitudeDualRecursive([{ v: 7, d: -3 }]);
			assert.deepEqual(pos, { v: 7, d: -3 });

			const neg = magnitudeDualRecursive([{ v: -7, d: -3 }]);
			assert.deepEqual(neg, { v: 7, d: 3 });
		});

		it('returns { v: 0, d: 0 } without NaN or -0 for zero primal vectors', () => {
			const z1 = magnitudeDualRecursive([
				{ v: 0, d: 0 },
				{ v: -0, d: 0 },
			]);
			assert.deepEqual(z1, { v: 0, d: 0 });
			assert.equal(Object.is(z1.v, 0), true);
			assert.equal(Object.is(z1.d, 0), true);

			const z2 = magnitudeDualRecursive([
				{ v: 0, d: 5 },
				{ v: 0, d: -2 },
			]);
			assert.deepEqual(z2, { v: 0, d: 0 });
			assert.equal(Object.is(z2.d, 0), true);
		});

		it('avoids negative zero in derivative', () => {
			const res = magnitudeDualRecursive([{ v: -5, d: 0 }]);
			assert.equal(res.v, 5);
			assert.equal(Object.is(res.d, 0), true);
		});

		it('avoids overflow for very large primal magnitudes', () => {
			const res = magnitudeDualRecursive([
				{ v: 3e200, d: 1 },
				{ v: 4e200, d: 2 },
			]);
			assertClose(res.v, 5e200, 1e-14, 'large value');
			assertClose(res.d, 2.2, 1e-14, 'large derivative');
		});

		it('avoids underflow for very small primal magnitudes', () => {
			const res = magnitudeDualRecursive([
				{ v: 3e-200, d: 1 },
				{ v: 4e-200, d: 2 },
			]);
			assertClose(res.v, 5e-200, 1e-14, 'small value');
			assertClose(res.d, 2.2, 1e-14, 'small derivative');
		});

		it('handles large vectors without stack overflow due to O(log n) divide-and-conquer depth', () => {
			const n = 20_000;
			const vec = Array.from({ length: n }, () => ({ v: 3, d: 2 }));
			const res = magnitudeDualRecursive(vec);
			// ||[3,...,3]|| = 3 * sqrt(n); d = (n * 6) / (3 * sqrt(n)) = 2 * sqrt(n)
			assertClose(res.v, 3 * Math.sqrt(n), 1e-12, 'large vector value');
			assertClose(res.d, 2 * Math.sqrt(n), 1e-12, 'large vector derivative');
		});

		it('does not mutate the input array or its element objects', () => {
			const e0 = Object.freeze({ v: 3, d: 1 });
			const e1 = Object.freeze({ v: 4, d: -2 });
			const vec = Object.freeze([e0, e1]);
			const res = magnitudeDualRecursive(vec);
			assertClose(res.v, 5, 1e-15);
			assertClose(res.d, -1, 1e-15);
		});
	});

	describe('input validation', () => {
		it('throws TypeError when input is not an array', () => {
			for (const bad of [null, undefined, 42, 'vec', { v: 1, d: 0 }, new Float64Array([1, 2])]) {
				assert.throws(() => magnitudeDualRecursive(bad), TypeError);
			}
		});

		it('throws TypeError for invalid or missing dual elements', () => {
			assert.throws(() => magnitudeDualRecursive([null]), TypeError);
			assert.throws(() => magnitudeDualRecursive([undefined]), TypeError);
			assert.throws(() => magnitudeDualRecursive([1]), TypeError);
			assert.throws(() => magnitudeDualRecursive([[1, 2]]), TypeError);
			assert.throws(() => magnitudeDualRecursive([{ v: 1 }]), TypeError);
			assert.throws(() => magnitudeDualRecursive([{ d: 1 }]), TypeError);
			assert.throws(() => magnitudeDualRecursive([{ v: '3', d: 1 }]), TypeError);
			assert.throws(() => magnitudeDualRecursive([{ v: 3, d: null }]), TypeError);

			// Sparse array hole
			const sparse = [{ v: 1, d: 0 }, , { v: 2, d: 0 }]; // eslint-disable-line no-sparse-arrays
			assert.throws(() => magnitudeDualRecursive(sparse), TypeError);
		});

		it('throws RangeError for non-finite v or d values (even on zero primal vectors)', () => {
			assert.throws(() => magnitudeDualRecursive([{ v: NaN, d: 0 }]), RangeError);
			assert.throws(() => magnitudeDualRecursive([{ v: 1, d: NaN }]), RangeError);
			assert.throws(() => magnitudeDualRecursive([{ v: Infinity, d: 0 }]), RangeError);
			assert.throws(() => magnitudeDualRecursive([{ v: 1, d: -Infinity }]), RangeError);
			assert.throws(
				() =>
					magnitudeDualRecursive([
						{ v: 0, d: 0 },
						{ v: 0, d: NaN },
					]),
				RangeError,
			);
		});
	});

	describe('independent cross-checks', () => {
		it('matches central finite-difference derivatives along parameterized trajectories', () => {
			const cases = [
				{
					v: [1.5, -2.3, 0.7, 4.1],
					d: [-0.4, 1.2, 3.3, -0.8],
				},
				{
					v: [0.01, -0.02, 0.05, -0.03, 0.04],
					d: [2.0, -1.5, 0.25, 4.0, -3.0],
				},
				{
					v: [-12.5, 8.25, -0.125],
					d: [0.75, 1.5, -2.25],
				},
			];
			const h = 1e-6;

			for (const { v, d } of cases) {
				const dualVec = v.map((vi, i) => ({ v: vi, d: d[i] }));
				const res = magnitudeDualRecursive(dualVec);

				const normPlus = Math.hypot(...v.map((vi, i) => vi + h * d[i]));
				const normMinus = Math.hypot(...v.map((vi, i) => vi - h * d[i]));
				const fdDeriv = (normPlus - normMinus) / (2 * h);

				assertClose(res.v, Math.hypot(...v), 1e-14, 'hypot cross-check');
				assertClose(res.d, fdDeriv, 1e-8, 'finite-difference derivative');
			}
		});

		it('matches analytical closed-form derivative of a nonlinear vector curve', () => {
			// r(t) = [cos(t), sin(t), t^2, exp(-t)]
			// ||r(t)|| = sqrt(1 + t^4 + exp(-2t))
			// d/dt ||r(t)|| = (2t^3 - exp(-2t)) / sqrt(1 + t^4 + exp(-2t))
			for (const t of [-1.2, 0.0, 0.7, 2.3]) {
				const dualVec = [
					{ v: Math.cos(t), d: -Math.sin(t) },
					{ v: Math.sin(t), d: Math.cos(t) },
					{ v: t * t, d: 2 * t },
					{ v: Math.exp(-t), d: -Math.exp(-t) },
				];
				const res = magnitudeDualRecursive(dualVec);

				const exactV = Math.sqrt(1 + t ** 4 + Math.exp(-2 * t));
				const exactD = (2 * t ** 3 - Math.exp(-2 * t)) / exactV;

				assertClose(res.v, exactV, 1e-14, `t=${t} exact value`);
				assertClose(res.d, exactD, 1e-14, `t=${t} exact derivative`);
			}
		});
	});
});
