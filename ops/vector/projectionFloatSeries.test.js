import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { projectionFloatSeries } from './projectionFloatSeries.js';

function assertVectorClose(actual, expected, tol = 1e-12, msg = '') {
	assert.equal(actual.length, expected.length, `${msg} length mismatch`);
	for (let i = 0; i < expected.length; i++) {
		const diff = Math.abs(actual[i] - expected[i]);
		const scale = Math.max(1, Math.abs(expected[i]));
		assert.ok(
			diff <= tol * scale,
			`${msg} index ${i}: expected ${expected[i]}, got ${actual[i]} (diff=${diff})`,
		);
	}
}

function dotNaive(x, y) {
	let s = 0;
	for (let i = 0; i < x.length; i++) s += x[i] * y[i];
	return s;
}

function normSqNaive(x) {
	return dotNaive(x, x);
}

describe('projectionFloatSeries', () => {
	it('computes basic 2D and 3D vector projections', () => {
		// proj_{[1, 0]}([3, 4]) = [3, 0]
		assertVectorClose(projectionFloatSeries([3, 4], [1, 0]), [3, 0], 1e-15);

		// proj_{[1, 1]}([3, 4]) = (7/2) * [1, 1] = [3.5, 3.5]
		assertVectorClose(projectionFloatSeries([3, 4], [1, 1]), [3.5, 3.5], 1e-15);

		// 3D: a = [2, -1, 3], b = [1, 2, -2], a·b = 2 - 2 - 6 = -6, b·b = 9 => -2/3 * b
		assertVectorClose(
			projectionFloatSeries([2, -1, 3], [1, 2, -2]),
			[-2 / 3, -4 / 3, 4 / 3],
			1e-15,
		);
	});

	it('handles 1D vectors', () => {
		assertVectorClose(projectionFloatSeries([7.25], [-3]), [7.25], 1e-15);
		assertVectorClose(projectionFloatSeries([-0.5], [100]), [-0.5], 1e-15);
	});

	it('returns zero vector for orthogonal vectors and avoids -0', () => {
		const res = projectionFloatSeries([1, -2, 1], [3, 1, -1]);
		assert.deepEqual(res, [0, 0, 0]);
		for (const x of res) {
			assert.ok(!Object.is(x, -0), 'result must not contain -0');
		}
	});

	it('returns the original vector for parallel and anti-parallel vectors', () => {
		const a = [2.5, -7.25, 4.125, 0.5];
		const bPos = a.map((x) => x * 3.7);
		const bNeg = a.map((x) => x * -0.125);

		assertVectorClose(projectionFloatSeries(a, bPos), a, 1e-14, 'parallel');
		assertVectorClose(projectionFloatSeries(a, bNeg), a, 1e-14, 'anti-parallel');
	});

	it('returns zero vector when projecting the zero vector onto non-zero b', () => {
		const res = projectionFloatSeries([0, 0, 0], [-4, 5, -6]);
		assert.deepEqual(res, [0, 0, 0]);
		for (const x of res) {
			assert.ok(!Object.is(x, -0));
		}
	});

	it('is invariant under positive, negative, huge, and tiny scaling of b', () => {
		const a = [3, -4, 5, 2];
		const b = [1, 2, -1, 3];
		const base = projectionFloatSeries(a, b);

		const scales = [1, -1, 7.5, -0.003, 1e200, -1e200, 1e-200, -1e-200, 2 ** 1000, 2 ** -1000];
		for (const s of scales) {
			const scaledB = b.map((x) => x * s);
			const proj = projectionFloatSeries(a, scaledB);
			assertVectorClose(proj, base, 1e-14, `scale=${s}`);
		}
	});

	it('handles extreme magnitudes in both a and b without overflow or underflow', () => {
		// Huge b (naive b·b overflows to Infinity)
		assertVectorClose(
			projectionFloatSeries([3, 4], [1e200, 1e200]),
			[3.5, 3.5],
			1e-15,
			'huge b',
		);

		// Tiny b (naive b·b underflows to 0)
		assertVectorClose(
			projectionFloatSeries([3, 4], [1e-200, 1e-200]),
			[3.5, 3.5],
			1e-15,
			'tiny b',
		);

		// Subnormal b
		assertVectorClose(
			projectionFloatSeries([6, 2], [5e-324, 5e-324]),
			[4, 4],
			1e-15,
			'subnormal b',
		);

		// Both a and b huge
		assertVectorClose(
			projectionFloatSeries([3e250, 4e250], [1e250, 0]),
			[3e250, 0],
			1e-15,
			'both huge',
		);

		// Both a and b tiny
		assertVectorClose(
			projectionFloatSeries([3e-250, 4e-250], [1e-250, 1e-250]),
			[3.5e-250, 3.5e-250],
			1e-15,
			'both tiny',
		);
	});

	it('preserves accuracy under catastrophic cancellation in a · b', () => {
		// Naive a·b = 1e16 + 1 - 1e16 = 0; true a·b = 1, b·b = 3 => [1/3, 1/3, 1/3]
		const a = [1e16, 1, -1e16];
		const b = [1, 1, 1];
		assertVectorClose(
			projectionFloatSeries(a, b),
			[1 / 3, 1 / 3, 1 / 3],
			1e-14,
			'1e16 cancellation',
		);

		// Extreme cancellation across 100 orders of magnitude
		const a2 = [1e100, 3, -1e100];
		const b2 = [1, 1, 1];
		assertVectorClose(projectionFloatSeries(a2, b2), [1, 1, 1], 1e-14, '1e100 cancellation');
	});

	it('satisfies algebraic cross-checks: idempotence, orthogonality of rejection, Pythagorean theorem, and linearity', () => {
		const vectors = [
			[
				[1.5, -2.3, 4.7, -0.8, 3.1],
				[0.4, 1.9, -2.2, 3.5, -1.1],
			],
			[
				[-10.25, 0.125, 7.5, -3.75],
				[2.5, -6.0, 1.25, 4.5],
			],
			[
				[1e8, -3e7, 2e8, 5e6, -1e8, 4e7],
				[-2e-4, 5e-4, 1e-4, -3e-4, 7e-4, 2e-4],
			],
		];

		for (const [a, b] of vectors) {
			const p = projectionFloatSeries(a, b);

			// 1. Idempotence: proj_b(proj_b(a)) = proj_b(a)
			const pp = projectionFloatSeries(p, b);
			assertVectorClose(pp, p, 1e-13, 'idempotence');

			// 2. Orthogonality of rejection: (a - proj_b(a)) · b = 0
			const rej = a.map((ai, i) => ai - p[i]);
			const rejDotB = dotNaive(rej, b);
			const normProd = Math.sqrt(normSqNaive(a) * normSqNaive(b));
			assert.ok(
				Math.abs(rejDotB) <= 1e-13 * normProd,
				`rejection not orthogonal: |rej·b|=${Math.abs(rejDotB)}, scale=${normProd}`,
			);

			// 3. Pythagorean theorem: ||a||^2 = ||proj_b(a)||^2 + ||a - proj_b(a)||^2
			const normA2 = normSqNaive(a);
			const normP2 = normSqNaive(p);
			const normRej2 = normSqNaive(rej);
			assert.ok(
				Math.abs(normA2 - (normP2 + normRej2)) <= 1e-13 * normA2,
				`Pythagorean mismatch: ${normA2} vs ${normP2 + normRej2}`,
			);
		}

		// 4. Linearity in first argument: proj_b(α*x + β*y) = α*proj_b(x) + β*proj_b(y)
		const x = [2, -5, 3, 1];
		const y = [-4, 1, 7, -2];
		const b = [1, -3, 2, 4];
		const alpha = 2.5;
		const beta = -1.75;
		const combined = x.map((xi, i) => alpha * xi + beta * y[i]);
		const lhs = projectionFloatSeries(combined, b);
		const px = projectionFloatSeries(x, b);
		const py = projectionFloatSeries(y, b);
		const rhs = px.map((pxi, i) => alpha * pxi + beta * py[i]);
		assertVectorClose(lhs, rhs, 1e-13, 'linearity');
	});

	it('throws RangeError for zero vector b, empty vectors, mismatched lengths, and non-finite entries', () => {
		// Zero vector b
		assert.throws(() => projectionFloatSeries([1, 2, 3], [0, 0, 0]), RangeError);
		assert.throws(() => projectionFloatSeries([0, 0], [-0, 0]), RangeError);
		assert.throws(() => projectionFloatSeries([1], [0]), RangeError);

		// Empty vectors
		assert.throws(() => projectionFloatSeries([], []), RangeError);
		assert.throws(() => projectionFloatSeries([1], []), RangeError);
		assert.throws(() => projectionFloatSeries([], [1]), RangeError);

		// Mismatched lengths
		assert.throws(() => projectionFloatSeries([1, 2], [1, 2, 3]), RangeError);
		assert.throws(() => projectionFloatSeries([1, 2, 3], [1, 2]), RangeError);

		// Non-finite numbers
		assert.throws(() => projectionFloatSeries([NaN, 1], [1, 2]), RangeError);
		assert.throws(() => projectionFloatSeries([1, Infinity], [1, 2]), RangeError);
		assert.throws(() => projectionFloatSeries([1, 2], [1, -Infinity]), RangeError);
		assert.throws(() => projectionFloatSeries([1, 2], [NaN, 0]), RangeError);
	});

	it('throws TypeError for non-array inputs or non-number elements', () => {
		assert.throws(() => projectionFloatSeries(null, [1, 2]), TypeError);
		assert.throws(() => projectionFloatSeries([1, 2], undefined), TypeError);
		assert.throws(() => projectionFloatSeries('12', [1, 2]), TypeError);
		assert.throws(() => projectionFloatSeries([1, 2], { 0: 1, 1: 2, length: 2 }), TypeError);
		assert.throws(() => projectionFloatSeries([1, '2'], [1, 2]), TypeError);
		assert.throws(() => projectionFloatSeries([1, 2], [1, null]), TypeError);
		assert.throws(() => projectionFloatSeries([1n, 2n], [1, 2]), TypeError);
	});

	it('does not mutate input arrays', () => {
		const a = [3, -4, 5];
		const b = [1, 2, -2];
		const aCopy = [...a];
		const bCopy = [...b];

		projectionFloatSeries(a, b);
		assert.deepEqual(a, aCopy);
		assert.deepEqual(b, bCopy);
	});
});
