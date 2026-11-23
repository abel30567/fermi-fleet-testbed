import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tensorProductFloatRecursive } from './tensorProductFloatRecursive.js';

/**
 * Independent iterative flat-index reference implementation of tensor product
 * for cross-checking against the recursive divide-and-conquer implementation.
 */
function referenceTensorProductIterative(a, b) {
	const getShape = (t) => {
		const shape = [];
		let cur = t;
		while (Array.isArray(cur)) {
			shape.push(cur.length);
			if (cur.length === 0) break;
			cur = cur[0];
		}
		return shape;
	};

	const flatten = (t) => {
		const out = [];
		const stack = [t];
		while (stack.length > 0) {
			const cur = stack.pop();
			if (Array.isArray(cur)) {
				for (let i = cur.length - 1; i >= 0; i -= 1) {
					stack.push(cur[i]);
				}
			} else {
				out.push(cur);
			}
		}
		return out;
	};

	const reshape = (flat, shape) => {
		if (shape.length === 0) return flat[0];
		const total = shape.reduce((acc, d) => acc * d, 1);
		if (total === 0) {
			const buildEmpty = (dimIdx) => {
				const len = shape[dimIdx];
				if (len === 0) return [];
				const arr = new Array(len);
				for (let i = 0; i < len; i += 1) {
					arr[i] = buildEmpty(dimIdx + 1);
				}
				return arr;
			};
			return buildEmpty(0);
		}
		let current = flat.slice();
		for (let d = shape.length - 1; d >= 1; d -= 1) {
			const chunk = shape[d];
			const next = [];
			for (let i = 0; i < current.length; i += chunk) {
				next.push(current.slice(i, i + chunk));
			}
			current = next;
		}
		return current;
	};

	const shapeA = getShape(a);
	const shapeB = getShape(b);
	const flatA = flatten(a);
	const flatB = flatten(b);
	const flatOut = new Array(flatA.length * flatB.length);
	let k = 0;
	for (let i = 0; i < flatA.length; i += 1) {
		for (let j = 0; j < flatB.length; j += 1) {
			flatOut[k++] = flatA[i] * flatB[j];
		}
	}
	return reshape(flatOut, [...shapeA, ...shapeB]);
}

function flattenNumeric(tensor, out = []) {
	for (const el of tensor) {
		if (Array.isArray(el)) {
			flattenNumeric(el, out);
		} else {
			out.push(el);
		}
	}
	return out;
}

function addTensors(a, b) {
	if (typeof a === 'number') return a + b;
	return a.map((el, i) => addTensors(el, b[i]));
}

function scaleTensor(c, a) {
	if (typeof a === 'number') return c * a;
	return a.map((el) => scaleTensor(c, el));
}

function assertTensorsClose(actual, expected, eps = 1e-12) {
	if (typeof expected === 'number') {
		assert.equal(typeof actual, 'number');
		assert.ok(
			Math.abs(actual - expected) <= eps,
			`Expected ${actual} to be within ${eps} of ${expected}`
		);
		return;
	}
	assert.ok(Array.isArray(actual));
	assert.equal(actual.length, expected.length);
	for (let i = 0; i < expected.length; i += 1) {
		assertTensorsClose(actual[i], expected[i], eps);
	}
}

describe('tensorProductFloatRecursive', () => {
	describe('normal cases', () => {
		it('computes outer product of two 1D float64 vectors', () => {
			const a = [1.5, -2.0, 4.25];
			const b = [2.0, 0.5];
			const result = tensorProductFloatRecursive(a, b);
			assert.deepEqual(result, [
				[3.0, 0.75],
				[-4.0, -1.0],
				[8.5, 2.125],
			]);
		});

		it('computes tensor product of 2D matrix and 1D vector (rank 3)', () => {
			const a = [
				[1, 2],
				[3, 4],
			];
			const b = [0.5, -1, 2];
			const result = tensorProductFloatRecursive(a, b);
			assert.deepEqual(result, [
				[
					[0.5, -1, 2],
					[1, -2, 4],
				],
				[
					[1.5, -3, 6],
					[2, -4, 8],
				],
			]);
		});

		it('computes tensor product of 1D vector and 2D matrix (rank 3)', () => {
			const a = [2, -3];
			const b = [
				[1, 0.5],
				[-2, 4],
			];
			const result = tensorProductFloatRecursive(a, b);
			assert.deepEqual(result, [
				[
					[2, 1],
					[-4, 8],
				],
				[
					[-3, -1.5],
					[6, -12],
				],
			]);
		});

		it('computes tensor product of two 2D matrices (rank 4)', () => {
			const a = [
				[1, 2],
				[3, 4],
			];
			const b = [
				[0, 5],
				[6, 7],
			];
			const result = tensorProductFloatRecursive(a, b);
			assert.deepEqual(result, [
				[
					[
						[0, 5],
						[6, 7],
					],
					[
						[0, 10],
						[12, 14],
					],
				],
				[
					[
						[0, 15],
						[18, 21],
					],
					[
						[0, 20],
						[24, 28],
					],
				],
			]);
		});

		it('handles odd / non-power-of-two dimensions across divide-and-conquer splits', () => {
			const a = [1, 2, 3, 4, 5, 6, 7];
			const b = [0.25, -0.5, 1.0, 2.0, -4.0];
			const result = tensorProductFloatRecursive(a, b);
			assert.equal(result.length, 7);
			for (let i = 0; i < a.length; i += 1) {
				assert.equal(result[i].length, 5);
				for (let j = 0; j < b.length; j += 1) {
					assert.equal(result[i][j], a[i] * b[j]);
				}
			}
		});
	});

	describe('edge cases', () => {
		it('handles single-element tensors', () => {
			assert.deepEqual(tensorProductFloatRecursive([3.5], [2]), [[7]]);
			assert.deepEqual(tensorProductFloatRecursive([[2]], [[3]]), [[[[6]]]]);
		});

		it('handles empty tensors cleanly', () => {
			assert.deepEqual(tensorProductFloatRecursive([], [1, 2, 3]), []);
			assert.deepEqual(tensorProductFloatRecursive([1, 2], []), [[], []]);
			assert.deepEqual(tensorProductFloatRecursive([], []), []);
			assert.deepEqual(tensorProductFloatRecursive([[]], [1, 2]), [[]]);
			assert.deepEqual(tensorProductFloatRecursive([1, 2], [[]]), [[[]], [[]]]);
		});

		it('preserves IEEE-754 signed zero semantics', () => {
			const result = tensorProductFloatRecursive([-0, 0], [1, -1]);
			assert.ok(Object.is(result[0][0], -0));
			assert.ok(Object.is(result[0][1], 0));
			assert.ok(Object.is(result[1][0], 0));
			assert.ok(Object.is(result[1][1], -0));
		});

		it('handles IEEE-754 subnormals and overflow according to float64 rules', () => {
			const underflow = tensorProductFloatRecursive(
				[Number.MIN_VALUE],
				[0.25, 2]
			);
			assert.equal(underflow[0][0], 0);
			assert.equal(underflow[0][1], Number.MIN_VALUE * 2);

			const overflow = tensorProductFloatRecursive([Number.MAX_VALUE], [2, 0.5]);
			assert.equal(overflow[0][0], Infinity);
			assert.equal(overflow[0][1], Number.MAX_VALUE * 0.5);
		});

		it('returns independent newly allocated arrays without aliasing inputs or siblings', () => {
			const a = [1, 1];
			const b = [2, 3];
			const result = tensorProductFloatRecursive(a, b);
			result[0][0] = 999;
			assert.equal(result[1][0], 2);
			assert.deepEqual(a, [1, 1]);
			assert.deepEqual(b, [2, 3]);
		});
	});

	describe('invalid inputs', () => {
		it('throws TypeError when arguments are not arrays', () => {
			assert.throws(() => tensorProductFloatRecursive(null, [1]), TypeError);
			assert.throws(() => tensorProductFloatRecursive([1], undefined), TypeError);
			assert.throws(() => tensorProductFloatRecursive(5, [1]), TypeError);
			assert.throws(() => tensorProductFloatRecursive([1], '123'), TypeError);
			assert.throws(() => tensorProductFloatRecursive({}, [1]), TypeError);
			assert.throws(
				() => tensorProductFloatRecursive(new Float64Array([1, 2]), [1]),
				TypeError
			);
		});

		it('throws TypeError for non-number leaf values', () => {
			assert.throws(() => tensorProductFloatRecursive([1, '2'], [3]), TypeError);
			assert.throws(() => tensorProductFloatRecursive([1], [null]), TypeError);
			assert.throws(() => tensorProductFloatRecursive([[true]], [1]), TypeError);
			assert.throws(() => tensorProductFloatRecursive([1n], [1]), TypeError);
			assert.throws(() => tensorProductFloatRecursive([1], [{}]), TypeError);
		});

		it('throws RangeError for non-finite float64 leaf values', () => {
			assert.throws(() => tensorProductFloatRecursive([NaN], [1]), RangeError);
			assert.throws(() => tensorProductFloatRecursive([1], [Infinity]), RangeError);
			assert.throws(() => tensorProductFloatRecursive([[-Infinity]], [1]), RangeError);
		});

		it('throws RangeError for ragged or mixed-rank tensors', () => {
			assert.throws(
				() => tensorProductFloatRecursive([[1, 2], [3]], [1]),
				RangeError
			);
			assert.throws(
				() => tensorProductFloatRecursive([1], [[1], 2]),
				RangeError
			);
			assert.throws(
				() => tensorProductFloatRecursive([[1], [2, 3]], [1]),
				RangeError
			);
			assert.throws(
				() => tensorProductFloatRecursive([[], [1]], [1]),
				RangeError
			);
		});

		it('throws TypeError for sparse arrays', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1, , 3];
			assert.throws(() => tensorProductFloatRecursive(sparse, [1]), TypeError);
			assert.throws(
				() => tensorProductFloatRecursive([1], new Array(2)),
				TypeError
			);
		});
	});

	describe('independent cross-checks', () => {
		it('matches independent iterative flat-index reference across ranks and sizes', () => {
			const cases = [
				{
					a: Array.from({ length: 17 }, (_, i) => (i - 8) * 0.375),
					b: Array.from({ length: 19 }, (_, i) => (i - 9) * 0.125),
				},
				{
					a: [
						[1.1, -2.2, 3.3],
						[4.4, 5.5, -6.6],
					],
					b: [
						[0.1, 0.2],
						[-0.3, 0.4],
						[0.5, -0.6],
					],
				},
				{
					a: [
						[
							[1, 2],
							[3, 4],
						],
						[
							[5, 6],
							[7, 8],
						],
					],
					b: [
						[0.5, -1.5, 2.5],
						[3.5, 4.5, -5.5],
					],
				},
			];

			for (const { a, b } of cases) {
				const actual = tensorProductFloatRecursive(a, b);
				const expected = referenceTensorProductIterative(a, b);
				assert.deepEqual(actual, expected);
			}
		});

		it('satisfies algebraic identities (bilinearity, associativity, Frobenius norm, trace=dot)', () => {
			const u = [1.25, -2.5, 3.75];
			const v = [-0.5, 4.0, -1.25];
			const w = [2.0, -1.5, 0.75, 3.25];
			const c = -2.5;

			// Bilinearity in left argument: (u + v) ⊗ w === (u ⊗ w) + (v ⊗ w)
			assertTensorsClose(
				tensorProductFloatRecursive(addTensors(u, v), w),
				addTensors(
					tensorProductFloatRecursive(u, w),
					tensorProductFloatRecursive(v, w)
				)
			);

			// Scalar associativity: (c * u) ⊗ w === c * (u ⊗ w) === u ⊗ (c * w)
			const scaledLeft = tensorProductFloatRecursive(scaleTensor(c, u), w);
			const scaledOut = scaleTensor(c, tensorProductFloatRecursive(u, w));
			const scaledRight = tensorProductFloatRecursive(u, scaleTensor(c, w));
			assertTensorsClose(scaledLeft, scaledOut);
			assertTensorsClose(scaledLeft, scaledRight);

			// Associativity: (u ⊗ v) ⊗ w === u ⊗ (v ⊗ w)
			const leftAssoc = tensorProductFloatRecursive(
				tensorProductFloatRecursive(u, v),
				w
			);
			const rightAssoc = tensorProductFloatRecursive(
				u,
				tensorProductFloatRecursive(v, w)
			);
			assertTensorsClose(leftAssoc, rightAssoc);

			// Frobenius norm multiplicativity: ||u ⊗ w||_F === ||u||_F * ||w||_F
			const norm = (t) =>
				Math.hypot(...flattenNumeric(t));
			const prodNorm = norm(tensorProductFloatRecursive(u, w));
			assert.ok(Math.abs(prodNorm - norm(u) * norm(w)) < 1e-12);

			// Trace of outer product equals dot product: tr(u ⊗ v) === u · v
			const outer = tensorProductFloatRecursive(u, v);
			const trace = outer.reduce((acc, row, i) => acc + row[i], 0);
			const dot = u.reduce((acc, val, i) => acc + val * v[i], 0);
			assert.ok(Math.abs(trace - dot) < 1e-12);
		});
	});
});
