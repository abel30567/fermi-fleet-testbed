import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { vectorAddFloatSeries } from './vectorAddFloatSeries.js';

function normSquared(v) {
	let acc = 0;
	for (let i = 0; i < v.length; i++) {
		acc += v[i] * v[i];
	}
	return acc;
}

function dot(u, v) {
	let acc = 0;
	for (let i = 0; i < u.length; i++) {
		acc += u[i] * v[i];
	}
	return acc;
}

function scale(k, v) {
	return v.map((x) => k * x);
}

describe('vectorAddFloatSeries', () => {
	describe('normal cases', () => {
		it('adds 2D and 3D integer vectors component-wise', () => {
			assert.deepEqual(vectorAddFloatSeries([1, 2], [3, 4]), [4, 6]);
			assert.deepEqual(vectorAddFloatSeries([1, -2, 3], [-4, 5, -6]), [-3, 3, -3]);
		});

		it('adds fractional float64 vectors accurately', () => {
			const res = vectorAddFloatSeries([0.5, -1.25, 3.125], [1.5, 2.75, -0.125]);
			assert.deepEqual(res, [2, 1.5, 3]);

			const inexact = vectorAddFloatSeries([0.1, 0.2], [0.2, 0.4]);
			assert.ok(Math.abs(inexact[0] - 0.3) <= 1e-15);
			assert.ok(Math.abs(inexact[1] - 0.6) <= 1e-15);
		});

		it('handles subnormal and large finite float64 values', () => {
			const minSub = Number.MIN_VALUE;
			const bigA = 2 ** 500;
			const bigB = 2 ** 501;
			assert.deepEqual(vectorAddFloatSeries([minSub, bigA], [minSub, bigB]), [
				2 * minSub,
				3 * 2 ** 500,
			]);
		});

		it('does not mutate input vectors and returns a fresh array', () => {
			const a = [1, 2, 3];
			const b = [4, 5, 6];
			const out = vectorAddFloatSeries(a, b);
			assert.deepEqual(a, [1, 2, 3]);
			assert.deepEqual(b, [4, 5, 6]);
			assert.notEqual(out, a);
			assert.notEqual(out, b);
		});
	});

	describe('edge cases', () => {
		it('handles empty vectors (0D)', () => {
			assert.deepEqual(vectorAddFloatSeries([], []), []);
		});

		it('handles 1D vectors', () => {
			assert.deepEqual(vectorAddFloatSeries([42.5], [-12.5]), [30]);
		});

		it('handles high-dimensional vectors (1024D)', () => {
			const n = 1024;
			const a = Array.from({ length: n }, (_, i) => i * 0.25);
			const b = Array.from({ length: n }, (_, i) => (n - i) * 0.25);
			const out = vectorAddFloatSeries(a, b);
			assert.equal(out.length, n);
			for (let i = 0; i < n; i++) {
				assert.equal(out[i], n * 0.25);
			}
		});

		it('satisfies zero vector identity (a + 0 = a and 0 + a = a)', () => {
			const a = [-7.5, 0, 3.25, 1e-12];
			const zero = [0, 0, 0, 0];
			assert.deepEqual(vectorAddFloatSeries(a, zero), a);
			assert.deepEqual(vectorAddFloatSeries(zero, a), a);
		});

		it('satisfies additive inverse property (a + (-a) = 0)', () => {
			const a = [1.5, -2.75, 0, 999.125, -1e-9];
			const negA = a.map((x) => -x);
			const sum = vectorAddFloatSeries(a, negA);
			for (const c of sum) {
				assert.equal(c, 0);
			}
		});

		it('preserves IEEE-754 signed-zero addition semantics', () => {
			assert.ok(Object.is(vectorAddFloatSeries([-0], [-0])[0], -0));
			assert.ok(Object.is(vectorAddFloatSeries([-0], [0])[0], 0));
		});
	});

	describe('input validation', () => {
		it('rejects non-array inputs with TypeError', () => {
			assert.throws(() => vectorAddFloatSeries(null, [1]), TypeError);
			assert.throws(() => vectorAddFloatSeries([1], undefined), TypeError);
			assert.throws(() => vectorAddFloatSeries(123, [1]), TypeError);
			assert.throws(() => vectorAddFloatSeries([1], '1'), TypeError);
			assert.throws(() => vectorAddFloatSeries({ length: 1, 0: 1 }, [1]), TypeError);
			assert.throws(() => vectorAddFloatSeries(new Float64Array([1]), [1]), TypeError);
		});

		it('rejects mismatched vector lengths with RangeError', () => {
			assert.throws(() => vectorAddFloatSeries([1, 2], [1]), RangeError);
			assert.throws(() => vectorAddFloatSeries([], [0]), RangeError);
			assert.throws(() => vectorAddFloatSeries([1], [1, 2, 3]), RangeError);
		});

		it('rejects non-number elements and sparse array holes with TypeError', () => {
			assert.throws(() => vectorAddFloatSeries(['1'], [1]), TypeError);
			assert.throws(() => vectorAddFloatSeries([1], [null]), TypeError);
			assert.throws(() => vectorAddFloatSeries([undefined], [1]), TypeError);
			assert.throws(() => vectorAddFloatSeries([1, true], [1, 2]), TypeError);

			const sparse = new Array(2);
			sparse[0] = 1;
			assert.throws(() => vectorAddFloatSeries(sparse, [1, 2]), TypeError);
		});

		it('rejects non-finite numbers (NaN, Infinity, -Infinity) with RangeError', () => {
			assert.throws(() => vectorAddFloatSeries([NaN], [1]), RangeError);
			assert.throws(() => vectorAddFloatSeries([1], [NaN]), RangeError);
			assert.throws(() => vectorAddFloatSeries([Infinity], [1]), RangeError);
			assert.throws(() => vectorAddFloatSeries([1], [-Infinity]), RangeError);
		});
	});

	describe('algebraic & geometric cross-checks', () => {
		const a = [1.25, -3.5, 4.75, -0.5, 2.125];
		const b = [-2.5, 1.75, -0.25, 6.25, -4.5];
		const c = [0.75, 2.25, -3.125, 1.5, 0.875];

		it('satisfies commutativity: a + b = b + a', () => {
			assert.deepEqual(vectorAddFloatSeries(a, b), vectorAddFloatSeries(b, a));
		});

		it('satisfies associativity: (a + b) + c ≈ a + (b + c)', () => {
			const lhs = vectorAddFloatSeries(vectorAddFloatSeries(a, b), c);
			const rhs = vectorAddFloatSeries(a, vectorAddFloatSeries(b, c));
			assert.equal(lhs.length, rhs.length);
			for (let i = 0; i < lhs.length; i++) {
				assert.ok(Math.abs(lhs[i] - rhs[i]) <= 1e-14);
			}
		});

		it('satisfies the parallelogram law: ||a + b||² + ||a - b||² = 2(||a||² + ||b||²)', () => {
			const sum = vectorAddFloatSeries(a, b);
			const diff = vectorAddFloatSeries(a, scale(-1, b));
			const lhs = normSquared(sum) + normSquared(diff);
			const rhs = 2 * (normSquared(a) + normSquared(b));
			assert.ok(Math.abs(lhs - rhs) <= 1e-12 * Math.max(1, rhs));
		});

		it('satisfies scalar linearity and dot-product distributivity', () => {
			const k = -2.5;
			const lhsLinear = scale(k, vectorAddFloatSeries(a, b));
			const rhsLinear = vectorAddFloatSeries(scale(k, a), scale(k, b));
			for (let i = 0; i < lhsLinear.length; i++) {
				assert.ok(Math.abs(lhsLinear[i] - rhsLinear[i]) <= 1e-13);
			}

			const lhsDot = dot(vectorAddFloatSeries(a, b), c);
			const rhsDot = dot(a, c) + dot(b, c);
			assert.ok(Math.abs(lhsDot - rhsDot) <= 1e-13);
		});
	});
});
