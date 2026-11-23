import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dotProductTypedIterative } from './dotProductTypedIterative.js';

describe('dotProductTypedIterative', () => {
	it('computes dot product for standard positive integer vectors', () => {
		const a = new Float64Array([1, 2, 3]);
		const b = new Float64Array([4, 5, 6]);
		assert.equal(dotProductTypedIterative(a, b), 32);
	});

	it('handles negative and mixed-sign floating-point values', () => {
		const a = new Float64Array([-1.5, 2.25, -3.5, 4]);
		const b = new Float64Array([2, -4, -2, 0.5]);
		// -3 - 9 + 7 + 2 = -3
		assert.equal(dotProductTypedIterative(a, b), -3);
	});

	it('returns 0 for orthogonal vectors and zero vectors', () => {
		const x = new Float64Array([1, 0, 0]);
		const y = new Float64Array([0, 1, 0]);
		assert.equal(dotProductTypedIterative(x, y), 0);

		const z = new Float64Array([0, 0, 0]);
		assert.equal(dotProductTypedIterative(new Float64Array([7, -8, 9]), z), 0);
	});

	it('handles single-element and empty Float64Array inputs', () => {
		assert.equal(
			dotProductTypedIterative(new Float64Array([6]), new Float64Array([-7])),
			-42
		);
		assert.equal(
			dotProductTypedIterative(new Float64Array(0), new Float64Array(0)),
			0
		);
	});

	it('works correctly on Float64Array subarrays with non-zero byteOffset', () => {
		const bufA = new Float64Array([99, 2, 3, 4, 88]);
		const bufB = new Float64Array([77, 66, 5, 6, 7]);
		const subA = bufA.subarray(1, 4); // [2, 3, 4]
		const subB = bufB.subarray(2, 5); // [5, 6, 7]
		assert.equal(dotProductTypedIterative(subA, subB), 2 * 5 + 3 * 6 + 4 * 7);
	});

	it('propagates IEEE 754 NaN and Infinity values', () => {
		assert.ok(
			Number.isNaN(
				dotProductTypedIterative(
					new Float64Array([1, Number.NaN]),
					new Float64Array([2, 3])
				)
			)
		);
		assert.equal(
			dotProductTypedIterative(
				new Float64Array([1, Number.POSITIVE_INFINITY]),
				new Float64Array([2, 3])
			),
			Number.POSITIVE_INFINITY
		);
	});

	it('does not mutate input Float64Arrays', () => {
		const a = new Float64Array([1.5, -2.5, 3.5]);
		const b = new Float64Array([4, 5, -6]);
		const aCopy = new Float64Array(a);
		const bCopy = new Float64Array(b);
		dotProductTypedIterative(a, b);
		assert.deepEqual(a, aCopy);
		assert.deepEqual(b, bCopy);
	});

	it('throws TypeError when inputs are not Float64Array instances', () => {
		const valid = new Float64Array([1, 2]);
		const invalidInputs = [
			[1, 2],
			new Float32Array([1, 2]),
			new Int32Array([1, 2]),
			null,
			undefined,
			42,
			'12',
			{ 0: 1, 1: 2, length: 2 }
		];

		for (const bad of invalidInputs) {
			assert.throws(() => dotProductTypedIterative(bad, valid), TypeError);
			assert.throws(() => dotProductTypedIterative(valid, bad), TypeError);
		}
	});

	it('throws RangeError when vector lengths differ', () => {
		assert.throws(
			() =>
				dotProductTypedIterative(
					new Float64Array([1, 2, 3]),
					new Float64Array([1, 2])
				),
			RangeError
		);
		assert.throws(
			() =>
				dotProductTypedIterative(
					new Float64Array(0),
					new Float64Array([1])
				),
			RangeError
		);
	});

	it('matches closed-form sum of squares identity for n = 1000', () => {
		const n = 1000;
		const v = new Float64Array(n);
		for (let i = 0; i < n; i++) {
			v[i] = i + 1;
		}
		const expected = (n * (n + 1) * (2 * n + 1)) / 6;
		assert.equal(dotProductTypedIterative(v, v), expected);
	});

	it('cross-checks against an independent reduce reference and algebraic laws', () => {
		// Deterministic LCG PRNG for reproducible tests
		let seed = 123456789;
		const nextFloat = () => {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
			return (seed / 0xffffffff) * 20 - 10;
		};

		const referenceDot = (x, y) =>
			Array.from(x).reduce((acc, xi, idx) => acc + xi * y[idx], 0);

		const n = 256;
		const a = new Float64Array(n);
		const b = new Float64Array(n);
		const c = new Float64Array(n);
		const bPlusC = new Float64Array(n);
		const scaledA = new Float64Array(n);
		const k = 2.75;

		for (let i = 0; i < n; i++) {
			a[i] = nextFloat();
			b[i] = nextFloat();
			c[i] = nextFloat();
			bPlusC[i] = b[i] + c[i];
			scaledA[i] = k * a[i];
		}

		const ab = dotProductTypedIterative(a, b);
		const ba = dotProductTypedIterative(b, a);
		const refAB = referenceDot(a, b);

		// Reference agreement and commutativity
		assert.equal(ab, refAB);
		assert.equal(ab, ba);

		// Bilinearity (within floating-point tolerance)
		const lhsDist = dotProductTypedIterative(a, bPlusC);
		const rhsDist = ab + dotProductTypedIterative(a, c);
		assert.ok(Math.abs(lhsDist - rhsDist) < 1e-9);

		const lhsScale = dotProductTypedIterative(scaledA, b);
		const rhsScale = k * ab;
		assert.ok(Math.abs(lhsScale - rhsScale) < 1e-9);

		// Cauchy-Schwarz inequality: |a . b| <= ||a|| * ||b||
		const normA = Math.sqrt(dotProductTypedIterative(a, a));
		const normB = Math.sqrt(dotProductTypedIterative(b, b));
		assert.ok(Math.abs(ab) <= normA * normB + 1e-9);
	});
});
