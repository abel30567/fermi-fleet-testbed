import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cbrtDualIterative } from './cbrtDualIterative.js';

/**
 * Asserts two finite numbers are close within relative + absolute tolerance.
 * @param {number} actual
 * @param {number} expected
 * @param {number} [relTol=1e-14]
 * @param {number} [absTol=0]
 * @param {string} [label='']
 */
function assertClose(actual, expected, relTol = 1e-14, absTol = 0, label = '') {
	assert.equal(typeof actual, 'number', `${label}: actual must be a number`);
	assert.ok(Number.isFinite(actual), `${label}: actual must be finite, got ${actual}`);
	const diff = Math.abs(actual - expected);
	const tol = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)));
	assert.ok(
		diff <= tol,
		`${label}: expected ${actual} to be within ${tol} of ${expected} (diff = ${diff})`,
	);
}

describe('cbrtDualIterative', () => {
	describe('perfect cubes and simple values', () => {
		it('computes exact/accurate primal and derivative for positive perfect cubes', () => {
			const cases = [
				{ x: { v: 1, d: 1 }, expected: { v: 1, d: 1 / 3 } },
				{ x: { v: 8, d: 1 }, expected: { v: 2, d: 1 / 12 } },
				{ x: { v: 27, d: 1 }, expected: { v: 3, d: 1 / 27 } },
				{ x: { v: 64, d: 6 }, expected: { v: 4, d: 6 / 48 } },
				{ x: { v: 1000, d: -30 }, expected: { v: 10, d: -30 / 300 } },
				{ x: { v: 0.125, d: 3 }, expected: { v: 0.5, d: 4 } },
			];

			for (const { x, expected } of cases) {
				const res = cbrtDualIterative(x);
				assertClose(res.v, expected.v, 1e-15, 0, `v for (${x.v}, ${x.d})`);
				assertClose(res.d, expected.d, 1e-14, 0, `d for (${x.v}, ${x.d})`);
			}
		});

		it('computes accurate primal and derivative for negative perfect cubes', () => {
			const cases = [
				{ x: { v: -1, d: 1 }, expected: { v: -1, d: 1 / 3 } },
				{ x: { v: -8, d: 1 }, expected: { v: -2, d: 1 / 12 } },
				{ x: { v: -27, d: 1 }, expected: { v: -3, d: 1 / 27 } },
				{ x: { v: -64, d: -6 }, expected: { v: -4, d: -6 / 48 } },
				{ x: { v: -1000, d: 30 }, expected: { v: -10, d: 30 / 300 } },
				{ x: { v: -0.125, d: -3 }, expected: { v: -0.5, d: -4 } },
			];

			for (const { x, expected } of cases) {
				const res = cbrtDualIterative(x);
				assertClose(res.v, expected.v, 1e-15, 0, `v for (${x.v}, ${x.d})`);
				assertClose(res.d, expected.d, 1e-14, 0, `d for (${x.v}, ${x.d})`);
			}
		});

		it('handles zero derivative d === 0 without producing -0', () => {
			for (const v of [1, -1, 8, -8, 2.5, -2.5, 1e-12, -1e-12]) {
				const res = cbrtDualIterative({ v, d: 0 });
				assertClose(res.v, Math.cbrt(v), 1e-14, 0, `v for (${v}, 0)`);
				assert.ok(Object.is(res.d, 0), `expected +0 derivative for (${v}, 0), got ${res.d}`);
			}
		});
	});

	describe('zero primal value handling', () => {
		it('returns { v: 0, d: 0 } when v === 0 and d === 0 (including -0 variants)', () => {
			const zeroInputs = [
				{ v: 0, d: 0 },
				{ v: -0, d: 0 },
				{ v: 0, d: -0 },
				{ v: -0, d: -0 },
			];
			for (const x of zeroInputs) {
				const res = cbrtDualIterative(x);
				assert.deepStrictEqual(res, { v: 0, d: 0 });
				assert.ok(Object.is(res.v, 0), 'v must be +0');
				assert.ok(Object.is(res.d, 0), 'd must be +0');
			}
		});

		it('throws RangeError when v === 0 and d !== 0 (infinite derivative)', () => {
			const badInputs = [
				{ v: 0, d: 1 },
				{ v: 0, d: -1 },
				{ v: -0, d: 1e-300 },
				{ v: 0, d: -1e-300 },
				{ v: -0, d: 42 },
			];
			for (const x of badInputs) {
				assert.throws(
					() => cbrtDualIterative(x),
					{ name: 'RangeError' },
					`expected RangeError for (${x.v}, ${x.d})`,
				);
			}
		});
	});

	describe('cross-check against Math.cbrt and analytic derivative', () => {
		it('matches Math.cbrt(v) and d / (3 * cbrt(v)^2) for positive and negative inputs', () => {
			const values = [
				0.001, 0.01, 0.25, 0.5, 0.9, 1.5, 2, 3, Math.PI, Math.E, 7.77, 10, 42, 12345.6789,
				1e9, 1e-9,
				-0.001, -0.01, -0.25, -0.5, -0.9, -1.5, -2, -3, -Math.PI, -Math.E, -7.77, -10, -42,
				-12345.6789, -1e9, -1e-9,
			];
			const tangents = [-5.25, -1, 0, 0.5, 1, 3.75];

			for (const v of values) {
				const expectedV = Math.cbrt(v);
				for (const d of tangents) {
					const expectedD = d === 0 ? 0 : d / (3 * expectedV * expectedV);
					const res = cbrtDualIterative({ v, d });
					assertClose(res.v, expectedV, 1e-14, 0, `v at (${v}, ${d})`);
					assertClose(res.d, expectedD, 1e-14, 0, `d at (${v}, ${d})`);
				}
			}
		});
	});

	describe('cross-check against central finite differences', () => {
		it('matches central difference approximation for both positive and negative inputs', () => {
			const samples = [
				{ v: 0.05, d: 1 },
				{ v: 0.5, d: -2.3 },
				{ v: 2, d: 1 },
				{ v: 7.5, d: 4.2 },
				{ v: 100, d: -0.75 },
				{ v: 1234.5, d: 10 },
				{ v: -0.05, d: 1 },
				{ v: -0.5, d: 2.3 },
				{ v: -2, d: -1 },
				{ v: -7.5, d: -4.2 },
				{ v: -100, d: 0.75 },
				{ v: -1234.5, d: -10 },
			];

			for (const { v, d } of samples) {
				const h = 1e-6 * Math.abs(v);
				const approxDeriv = ((Math.cbrt(v + h) - Math.cbrt(v - h)) / (2 * h)) * d;
				const res = cbrtDualIterative({ v, d });
				assertClose(res.d, approxDeriv, 1e-9, 0, `central diff at (${v}, ${d})`);
			}
		});
	});

	describe('algebraic and calculus properties', () => {
		it('satisfies dual cube inverse identity: cbrt(x)^3 === x', () => {
			const inputs = [
				{ v: 2, d: 1 },
				{ v: -2, d: 1 },
				{ v: 17.3, d: -4.1 },
				{ v: -17.3, d: 4.1 },
				{ v: 1e-20, d: 3e-15 },
				{ v: -1e20, d: -7e15 },
			];

			for (const x of inputs) {
				const y = cbrtDualIterative(x);
				// Dual cube: (y.v + y.d*ε)^3 = y.v^3 + 3*y.v^2*y.d*ε
				const cubeV = y.v * y.v * y.v;
				const cubeD = 3 * y.v * y.v * y.d;
				assertClose(cubeV, x.v, 1e-13, 0, `cube v at (${x.v}, ${x.d})`);
				assertClose(cubeD, x.d, 1e-13, 0, `cube d at (${x.v}, ${x.d})`);
			}
		});

		it('satisfies odd symmetry: cbrt(-v, d) has negated value and identical derivative', () => {
			for (const [v, d] of [[3.14, 2.71], [0.007, -1.5], [999, 0.25]]) {
				const pos = cbrtDualIterative({ v, d });
				const neg = cbrtDualIterative({ v: -v, d });
				assertClose(neg.v, -pos.v, 1e-15, 0, `odd v at ${v}`);
				assertClose(neg.d, pos.d, 1e-14, 0, `even d at ${v}`);
			}
		});

		it('satisfies chain rule for composite function g(t) = cbrt(t^3 - 2*t + 5)', () => {
			// Evaluate at t where f(t) = t^3 - 2*t + 5 takes both positive and negative values
			const points = [-3, -2, -1, 0, 1.5, 4];
			const h = 1e-6;
			const f = (t) => t * t * t - 2 * t + 5;
			const df = (t) => 3 * t * t - 2;

			for (const t of points) {
				const dualInner = { v: f(t), d: df(t) };
				const res = cbrtDualIterative(dualInner);
				const expectedV = Math.cbrt(f(t));
				const expectedD = df(t) / (3 * expectedV * expectedV);
				const finiteDiff = (Math.cbrt(f(t + h)) - Math.cbrt(f(t - h))) / (2 * h);

				assertClose(res.v, expectedV, 1e-14, 0, `chain v at t=${t}`);
				assertClose(res.d, expectedD, 1e-14, 0, `chain d analytic at t=${t}`);
				assertClose(res.d, finiteDiff, 1e-8, 0, `chain d finite-diff at t=${t}`);
			}
		});

		it('satisfies scaling homogeneity: cbrt(8 * x) = 2 * cbrt(x)', () => {
			for (const x of [{ v: 5, d: 3 }, { v: -0.3, d: -1.7 }]) {
				const scaled = cbrtDualIterative({ v: 8 * x.v, d: 8 * x.d });
				const base = cbrtDualIterative(x);
				assertClose(scaled.v, 2 * base.v, 1e-14);
				assertClose(scaled.d, 2 * base.d, 1e-14);
			}
		});
	});

	describe('extreme magnitudes and immutability', () => {
		it('handles very large and very small finite inputs without overflow/underflow', () => {
			const extremeCases = [
				{ v: Number.MAX_VALUE, d: 1 },
				{ v: -Number.MAX_VALUE, d: 1 },
				{ v: Number.MIN_VALUE, d: 1 },
				{ v: -Number.MIN_VALUE, d: 1 },
				{ v: 1e150, d: 1e50 },
				{ v: -1e150, d: -1e50 },
				{ v: 1e-150, d: 1e-50 },
				{ v: -1e-150, d: -1e-50 },
			];

			for (const x of extremeCases) {
				const res = cbrtDualIterative(x);
				const expectedV = Math.cbrt(x.v);
				const expectedD = x.d / (3 * expectedV * expectedV);
				assertClose(res.v, expectedV, 1e-14, 0, `extreme v at (${x.v}, ${x.d})`);
				assertClose(res.d, expectedD, 1e-13, 0, `extreme d at (${x.v}, ${x.d})`);
			}
		});

		it('throws RangeError when derivative overflows finite float64 range', () => {
			assert.throws(
				() => cbrtDualIterative({ v: 1e-300, d: 1e200 }),
				{ name: 'RangeError' },
			);
		});

		it('does not mutate the input object', () => {
			const input = Object.freeze({ v: -27, d: 5 });
			const res = cbrtDualIterative(input);
			assert.notEqual(res, input);
			assert.deepStrictEqual(input, { v: -27, d: 5 });
			assertClose(res.v, -3, 1e-15);
			assertClose(res.d, 5 / 27, 1e-14);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-object or malformed inputs', () => {
			const badInputs = [
				null,
				undefined,
				8,
				'8',
				true,
				[8, 1],
				() => {},
				{},
				{ v: 8 },
				{ d: 1 },
				{ v: '8', d: 1 },
				{ v: 8, d: '1' },
				{ v: null, d: 0 },
				{ v: 8, d: undefined },
				{ v: 8n, d: 1 },
				{ v: true, d: 1 },
			];

			for (const bad of badInputs) {
				assert.throws(
					() => cbrtDualIterative(bad),
					{ name: 'TypeError' },
					`expected TypeError for input ${String(bad)}`,
				);
			}
		});

		it('throws RangeError for NaN or Infinity in v or d', () => {
			const badInputs = [
				{ v: Number.NaN, d: 1 },
				{ v: 8, d: Number.NaN },
				{ v: Number.NaN, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 1 },
				{ v: Number.NEGATIVE_INFINITY, d: 1 },
				{ v: 8, d: Number.POSITIVE_INFINITY },
				{ v: 8, d: Number.NEGATIVE_INFINITY },
				{ v: 0, d: Number.NaN },
				{ v: 0, d: Number.POSITIVE_INFINITY },
			];

			for (const bad of badInputs) {
				assert.throws(
					() => cbrtDualIterative(bad),
					{ name: 'RangeError' },
					`expected RangeError for (${bad.v}, ${bad.d})`,
				);
			}
		});
	});
});
