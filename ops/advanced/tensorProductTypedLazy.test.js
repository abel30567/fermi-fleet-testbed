import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tensorProductTypedLazy } from './tensorProductTypedLazy.js';

/**
 * Helper: flattens yielded Float64Array fibers into a single Float64Array.
 * @param {Iterable<Float64Array>} fibers
 * @returns {Float64Array}
 */
function flattenFibers(fibers) {
	const list = [...fibers];
	const total = list.reduce((sum, arr) => sum + arr.length, 0);
	const out = new Float64Array(total);
	let offset = 0;
	for (const arr of list) {
		out.set(arr, offset);
		offset += arr.length;
	}
	return out;
}

/**
 * Helper: asserts two Float64Arrays are element-wise close within tolerance.
 * @param {Float64Array} actual
 * @param {Float64Array} expected
 * @param {number} [tol=1e-12]
 */
function assertCloseArray(actual, expected, tol = 1e-12) {
	assert.ok(actual instanceof Float64Array, 'actual must be a Float64Array');
	assert.equal(actual.length, expected.length, 'length mismatch');
	for (let i = 0; i < actual.length; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= tol,
			`index ${i}: expected ${expected[i]}, got ${actual[i]}`,
		);
	}
}

describe('tensorProductTypedLazy', () => {
	describe('normal cases', () => {
		it('computes 2D outer product of Float64Array inputs as streamed Float64Array rows', () => {
			const a = new Float64Array([1, 2, 3]);
			const b = new Float64Array([4, 5]);

			const rows = [...tensorProductTypedLazy(a, b)];
			assert.equal(rows.length, 3);
			for (const row of rows) {
				assert.ok(row instanceof Float64Array);
			}
			assert.deepEqual(rows[0], new Float64Array([4, 5]));
			assert.deepEqual(rows[1], new Float64Array([8, 10]));
			assert.deepEqual(rows[2], new Float64Array([12, 15]));
		});

		it('handles negative values, decimals, and zeros accurately', () => {
			const a = new Float64Array([-2, 0, 1.5]);
			const b = new Float64Array([0.5, -4, 2]);

			const rows = [...tensorProductTypedLazy(a, b)];
			assert.equal(rows.length, 3);
			assertCloseArray(rows[0], new Float64Array([-1, 8, -4]));
			assertCloseArray(rows[1], new Float64Array([0, 0, 0]));
			assertCloseArray(rows[2], new Float64Array([0.75, -6, 3]));
		});

		it('computes 3rd-order tensor product over three Float64Array inputs', () => {
			const a = new Float64Array([1, 2]);
			const b = new Float64Array([3, 4]);
			const c = new Float64Array([5, 6, 7]);

			const fibers = [...tensorProductTypedLazy(a, b, c)];
			assert.equal(fibers.length, 4);
			assert.deepEqual(fibers[0], new Float64Array([15, 18, 21]));
			assert.deepEqual(fibers[1], new Float64Array([20, 24, 28]));
			assert.deepEqual(fibers[2], new Float64Array([30, 36, 42]));
			assert.deepEqual(fibers[3], new Float64Array([40, 48, 56]));
		});

		it('accepts mixed Float64Array and generic iterable inputs (generators, arrays, Sets)', () => {
			function* genA() {
				yield 2;
				yield -3;
			}
			const setB = new Set([10, 20]);
			const arrC = new Float64Array([0.5, 1]);

			const fibers = [...tensorProductTypedLazy(genA(), setB, arrC)];
			assert.equal(fibers.length, 4);
			assertCloseArray(fibers[0], new Float64Array([10, 20]));
			assertCloseArray(fibers[1], new Float64Array([20, 40]));
			assertCloseArray(fibers[2], new Float64Array([-15, -30]));
			assertCloseArray(fibers[3], new Float64Array([-30, -60]));
		});

		it('yields freshly allocated Float64Array fibers isolated from consumer mutation', () => {
			const a = new Float64Array([1, 1]);
			const b = new Float64Array([2, 3]);
			const gen = tensorProductTypedLazy(a, b);

			const first = gen.next().value;
			first[0] = 999;
			first[1] = 888;

			const second = gen.next().value;
			assert.deepEqual(second, new Float64Array([2, 3]));
			assert.deepEqual(b, new Float64Array([2, 3]));
		});
	});

	describe('edge cases', () => {
		it('handles single-element Float64Array inputs', () => {
			const rows = [...tensorProductTypedLazy(new Float64Array([7]), new Float64Array([-3]))];
			assert.equal(rows.length, 1);
			assert.deepEqual(rows[0], new Float64Array([-21]));
		});

		it('yields nothing when first Float64Array is empty', () => {
			let bIterated = false;
			function* genB() {
				bIterated = true;
				yield 1;
			}
			const rows = [...tensorProductTypedLazy(new Float64Array([]), genB())];
			assert.deepEqual(rows, []);
			assert.equal(bIterated, false);
		});

		it('yields nothing when second Float64Array is empty without consuming first', () => {
			let aIterated = false;
			function* genA() {
				aIterated = true;
				yield 1;
			}
			const rows = [...tensorProductTypedLazy(genA(), new Float64Array([]))];
			assert.deepEqual(rows, []);
			assert.equal(aIterated, false);
		});

		it('yields nothing when an iterable factor is empty and stops early', () => {
			let aCount = 0;
			let cIterated = false;
			function* genA() {
				aCount++;
				yield 1;
				aCount++;
				yield 2;
			}
			function* emptyB() {}
			function* genC() {
				cIterated = true;
				yield 10;
			}

			const rows = [...tensorProductTypedLazy(genA(), emptyB(), genC())];
			assert.deepEqual(rows, []);
			assert.equal(aCount, 1);
			assert.equal(cIterated, false);
		});

		it('validates argument count and non-iterable / string arguments synchronously', () => {
			assert.throws(() => tensorProductTypedLazy(), TypeError);
			assert.throws(() => tensorProductTypedLazy(new Float64Array([1])), TypeError);
			assert.throws(() => tensorProductTypedLazy(null, new Float64Array([1])), TypeError);
			assert.throws(() => tensorProductTypedLazy(new Float64Array([1]), undefined), TypeError);
			assert.throws(() => tensorProductTypedLazy('123', new Float64Array([1])), TypeError);
			assert.throws(() => tensorProductTypedLazy(new Float64Array([1]), '456'), TypeError);
			assert.throws(() => tensorProductTypedLazy(42, new Float64Array([1])), TypeError);
			assert.throws(() => tensorProductTypedLazy({}, new Float64Array([1])), TypeError);
		});

		it('throws TypeError on non-number elements and RangeError on NaN/Infinity', () => {
			assert.throws(
				() => [...tensorProductTypedLazy(['1'], new Float64Array([2]))],
				TypeError,
			);
			assert.throws(
				() => [...tensorProductTypedLazy(new Float64Array([1]), [null])],
				TypeError,
			);
			assert.throws(
				() => [...tensorProductTypedLazy(new Float64Array([NaN]), new Float64Array([2]))],
				RangeError,
			);
			assert.throws(
				() => [...tensorProductTypedLazy(new Float64Array([1]), new Float64Array([Infinity]))],
				RangeError,
			);
			assert.throws(
				() => [...tensorProductTypedLazy(new Float64Array([1]), new Float64Array([-Infinity]))],
				RangeError,
			);
		});
	});

	describe('lazy consumption verification', () => {
		it('does not pull from any input iterable before .next() is called', () => {
			let aPulls = 0;
			let bPulls = 0;
			function* genA() {
				aPulls++;
				yield 1;
				aPulls++;
				yield 2;
			}
			function* genB() {
				bPulls++;
				yield 10;
				bPulls++;
				yield 20;
			}

			const gen = tensorProductTypedLazy(genA(), genB());
			assert.equal(aPulls, 0);
			assert.equal(bPulls, 0);

			const r1 = gen.next();
			assert.equal(r1.done, false);
			assert.deepEqual(r1.value, new Float64Array([10, 20]));
			assert.equal(aPulls, 1);
			assert.equal(bPulls, 2);

			const r2 = gen.next();
			assert.equal(r2.done, false);
			assert.deepEqual(r2.value, new Float64Array([20, 40]));
			assert.equal(aPulls, 2);
			// b must be cached and NOT re-iterated
			assert.equal(bPulls, 2);
		});

		it('supports infinite leading generator and closes iterators on early break', () => {
			let pulled = 0;
			let closedA = false;
			function* naturals() {
				try {
					let n = 1;
					while (true) {
						pulled++;
						yield n++;
					}
				} finally {
					closedA = true;
				}
			}

			const b = new Float64Array([2, 3]);
			const collected = [];
			for (const row of tensorProductTypedLazy(naturals(), b)) {
				collected.push(row);
				if (collected.length === 4) {
					break;
				}
			}

			assert.equal(pulled, 4);
			assert.equal(closedA, true);
			assert.deepEqual(collected, [
				new Float64Array([2, 3]),
				new Float64Array([4, 6]),
				new Float64Array([6, 9]),
				new Float64Array([8, 12]),
			]);
		});

		it('consumes intermediate factors lazily and closes them on early termination', () => {
			let aPulls = 0;
			let bPulls = 0;
			let closedA = false;
			let closedB = false;

			function* genA() {
				try {
					for (const v of [2, 3, 5]) {
						aPulls++;
						yield v;
					}
				} finally {
					closedA = true;
				}
			}

			function* genB() {
				try {
					for (const v of [7, 11, 13, 17]) {
						bPulls++;
						yield v;
					}
				} finally {
					closedB = true;
				}
			}

			const c = new Float64Array([1, 10]);
			const gen = tensorProductTypedLazy(genA(), genB(), c);

			const first = gen.next().value;
			assert.deepEqual(first, new Float64Array([14, 140]));
			assert.equal(aPulls, 1);
			assert.equal(bPulls, 1);

			const second = gen.next().value;
			assert.deepEqual(second, new Float64Array([22, 220]));
			assert.equal(aPulls, 1);
			assert.equal(bPulls, 2);

			gen.return();
			assert.equal(closedA, true);
			assert.equal(closedB, true);
		});

		it('validates elements lazily so an invalid tail element is never reached if stopped early', () => {
			const a = new Float64Array([2, 3, NaN]);
			const b = new Float64Array([5, 7]);
			const gen = tensorProductTypedLazy(a, b);

			assert.deepEqual(gen.next().value, new Float64Array([10, 14]));
			assert.deepEqual(gen.next().value, new Float64Array([15, 21]));
			assert.throws(() => gen.next(), RangeError);
		});
	});

	describe('independent mathematical cross-checks', () => {
		it('matches explicit nested-loop outer product, bilinearity, Frobenius norm, inner product, and rank-1 action', () => {
			const a = new Float64Array([1.25, -3.5, 2.0, 0.75]);
			const a2 = new Float64Array([-0.5, 4.0, 1.5, -2.25]);
			const b = new Float64Array([2.5, -1.0, 3.25]);
			const d = new Float64Array([0.5, 2.0, -1.5]);
			const alpha = 1.75;
			const beta = -0.6;

			// 1. Direct nested-loop reference
			const rows = [...tensorProductTypedLazy(a, b)];
			const expectedFlat = new Float64Array(a.length * b.length);
			for (let i = 0; i < a.length; i++) {
				for (let j = 0; j < b.length; j++) {
					expectedFlat[i * b.length + j] = a[i] * b[j];
				}
			}
			const actualFlat = flattenFibers(rows);
			assertCloseArray(actualFlat, expectedFlat);

			// 2. Bilinearity: (alpha * a + beta * a2) ⊗ b == alpha * (a ⊗ b) + beta * (a2 ⊗ b)
			const combA = Float64Array.from(a, (v, i) => alpha * v + beta * a2[i]);
			const lhs = flattenFibers(tensorProductTypedLazy(combA, b));
			const ab = flattenFibers(tensorProductTypedLazy(a, b));
			const a2b = flattenFibers(tensorProductTypedLazy(a2, b));
			const rhs = Float64Array.from(ab, (v, i) => alpha * v + beta * a2b[i]);
			assertCloseArray(lhs, rhs, 1e-11);

			// 3. Frobenius norm multiplicativity: ||a ⊗ b||_F == ||a||_2 * ||b||_2
			const norm2 = (arr) => Math.hypot(...arr);
			const frobNorm = Math.hypot(...actualFlat);
			assert.ok(Math.abs(frobNorm - norm2(a) * norm2(b)) < 1e-11);

			// 4. Inner product identity: <a ⊗ b, a2 ⊗ d>_F == <a, a2> * <b, d>
			const dot = (u, v) => u.reduce((acc, x, i) => acc + x * v[i], 0);
			const a2d = flattenFibers(tensorProductTypedLazy(a2, d));
			const tensorDot = dot(actualFlat, a2d);
			const scalarProductOfDots = dot(a, a2) * dot(b, d);
			assert.ok(Math.abs(tensorDot - scalarProductOfDots) < 1e-11);

			// 5. Rank-1 matrix-vector product: (a ⊗ b) * x == (b · x) * a
			const x = new Float64Array([3.0, -2.0, 1.5]);
			const bx = dot(b, x);
			for (let i = 0; i < rows.length; i++) {
				const rowDotX = dot(rows[i], x);
				assert.ok(Math.abs(rowDotX - a[i] * bx) < 1e-11);
			}
		});

		it('satisfies associativity and norm multiplicativity for 3-way tensor products', () => {
			const a = new Float64Array([1.5, -2.0]);
			const b = new Float64Array([0.5, 3.0, -1.0]);
			const c = new Float64Array([2.0, -0.25, 4.0, 1.0]);

			const direct = flattenFibers(tensorProductTypedLazy(a, b, c));
			const leftAssoc = flattenFibers(
				tensorProductTypedLazy(flattenFibers(tensorProductTypedLazy(a, b)), c),
			);
			const rightAssoc = flattenFibers(
				tensorProductTypedLazy(a, flattenFibers(tensorProductTypedLazy(b, c))),
			);

			assertCloseArray(direct, leftAssoc, 1e-12);
			assertCloseArray(direct, rightAssoc, 1e-12);

			const norm2 = (arr) => Math.hypot(...arr);
			const expectedNorm = norm2(a) * norm2(b) * norm2(c);
			const actualNorm = Math.hypot(...direct);
			assert.ok(Math.abs(actualNorm - expectedNorm) < 1e-11);
		});
	});
});
