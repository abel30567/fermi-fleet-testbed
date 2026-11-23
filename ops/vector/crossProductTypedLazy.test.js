import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crossProductTypedLazy } from './crossProductTypedLazy.js';

function dot3(u, v) {
	return u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
}

function normSq3(u) {
	return dot3(u, u);
}

function assertCloseVec3(actual, expected, eps = 1e-12) {
	assert.ok(actual instanceof Float64Array, 'result must be a Float64Array');
	assert.equal(actual.length, 3, 'result must have length 3');
	for (let i = 0; i < 3; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= eps,
			`component ${i}: expected ${expected[i]}, got ${actual[i]}`
		);
	}
}

describe('crossProductTypedLazy', () => {
	describe('normal cases', () => {
		it('computes standard basis cross products for single Float64Array pairs', () => {
			const i = new Float64Array([1, 0, 0]);
			const j = new Float64Array([0, 1, 0]);
			const k = new Float64Array([0, 0, 1]);

			assert.deepEqual([...crossProductTypedLazy(i, j)], [k]);
			assert.deepEqual([...crossProductTypedLazy(j, k)], [i]);
			assert.deepEqual([...crossProductTypedLazy(k, i)], [j]);
			assert.deepEqual(
				[...crossProductTypedLazy(j, i)],
				[new Float64Array([0, 0, -1])]
			);
		});

		it('computes cross products for arbitrary 3D Float64Array sequences', () => {
			const seqA = [
				new Float64Array([2, 3, 4]),
				new Float64Array([-1.5, 2.5, -3.5]),
				new Float64Array([10, -20, 30])
			];
			const seqB = [
				new Float64Array([5, 6, 7]),
				new Float64Array([4, -5, 6]),
				new Float64Array([1, 2, 3])
			];

			const results = [...crossProductTypedLazy(seqA, seqB)];
			assert.equal(results.length, 3);
			assert.deepEqual(results[0], new Float64Array([-3, 6, -3]));
			assertCloseVec3(results[1], new Float64Array([-2.5, -5, -2.5]));
			assert.deepEqual(results[2], new Float64Array([-120, 0, 40]));
		});

		it('handles empty iterables by yielding nothing', () => {
			const results = [...crossProductTypedLazy([], [])];
			assert.deepEqual(results, []);
		});

		it('accepts custom non-Array iterables such as Set and generators', () => {
			const setA = new Set([new Float64Array([1, 2, 3])]);
			function* genB() {
				yield new Float64Array([4, 5, 6]);
			}

			const results = [...crossProductTypedLazy(setA, genB())];
			assert.equal(results.length, 1);
			assert.deepEqual(results[0], new Float64Array([-3, 6, -3]));
		});
	});

	describe('edge cases', () => {
		it('returns zero vector with no negative zeros for parallel and anti-parallel vectors', () => {
			const a = new Float64Array([2, -4, 6]);
			const parallel = new Float64Array([4, -8, 12]);
			const antiParallel = new Float64Array([-1, 2, -3]);

			const [resParallel] = crossProductTypedLazy(a, parallel);
			const [resAnti] = crossProductTypedLazy(a, antiParallel);

			assert.deepEqual(resParallel, new Float64Array([0, 0, 0]));
			assert.deepEqual(resAnti, new Float64Array([0, 0, 0]));
			for (let idx = 0; idx < 3; idx++) {
				assert.ok(Object.is(resParallel[idx], 0));
				assert.ok(Object.is(resAnti[idx], 0));
			}
		});

		it('returns zero vector when either vector is the zero vector', () => {
			const zero = new Float64Array([0, 0, 0]);
			const v = new Float64Array([3.5, -7.25, 1.125]);

			const [r1] = crossProductTypedLazy(zero, v);
			const [r2] = crossProductTypedLazy(v, zero);
			const [r3] = crossProductTypedLazy(zero, zero);

			assert.deepEqual(r1, new Float64Array([0, 0, 0]));
			assert.deepEqual(r2, new Float64Array([0, 0, 0]));
			assert.deepEqual(r3, new Float64Array([0, 0, 0]));
		});

		it('rejects non-3D Float64Array vectors (0D, 2D, 4D) with RangeError', () => {
			assert.throws(
				() => crossProductTypedLazy(new Float64Array([]), new Float64Array([])),
				RangeError
			);
			assert.throws(
				() =>
					crossProductTypedLazy(
						new Float64Array([1, 2]),
						new Float64Array([3, 4])
					),
				RangeError
			);
			assert.throws(
				() =>
					crossProductTypedLazy(
						new Float64Array([1, 2, 3, 4]),
						new Float64Array([5, 6, 7, 8])
					),
				RangeError
			);
			assert.throws(
				() =>
					crossProductTypedLazy(
						new Float64Array([1, 2, 3]),
						new Float64Array([4, 5])
					),
				RangeError
			);
		});

		it('rejects non-3D Float64Array elements inside sequences lazily', () => {
			const seqA = [new Float64Array([1, 0, 0]), new Float64Array([1, 2])];
			const seqB = [new Float64Array([0, 1, 0]), new Float64Array([3, 4, 5])];

			const gen = crossProductTypedLazy(seqA, seqB);
			assert.deepEqual(gen.next().value, new Float64Array([0, 0, 1]));
			assert.throws(() => gen.next(), RangeError);
		});
	});

	describe('lazy and streaming behavior', () => {
		it('does not start or pull from iterables until .next() is called and streams infinite generators', () => {
			let pulledA = 0;
			let pulledB = 0;
			let closedA = false;
			let closedB = false;

			function* infiniteA() {
				try {
					let n = 1;
					while (true) {
						pulledA++;
						yield new Float64Array([n, 0, 0]);
						n++;
					}
				} finally {
					closedA = true;
				}
			}

			function* infiniteB() {
				try {
					let n = 1;
					while (true) {
						pulledB++;
						yield new Float64Array([0, n, 0]);
						n++;
					}
				} finally {
					closedB = true;
				}
			}

			const gen = crossProductTypedLazy(infiniteA(), infiniteB());
			assert.equal(pulledA, 0);
			assert.equal(pulledB, 0);

			const first = gen.next();
			assert.equal(first.done, false);
			assert.deepEqual(first.value, new Float64Array([0, 0, 1]));
			assert.equal(pulledA, 1);
			assert.equal(pulledB, 1);

			const second = gen.next();
			assert.equal(second.done, false);
			assert.deepEqual(second.value, new Float64Array([0, 0, 4]));
			assert.equal(pulledA, 2);
			assert.equal(pulledB, 2);

			assert.equal(closedA, false);
			assert.equal(closedB, false);
			gen.return();
			assert.equal(closedA, true);
			assert.equal(closedB, true);
		});

		it('closes both underlying iterators on early break in for..of', () => {
			let closedA = false;
			let closedB = false;

			const iterA = {
				*[Symbol.iterator]() {
					try {
						yield new Float64Array([1, 0, 0]);
						yield new Float64Array([0, 1, 0]);
						yield new Float64Array([0, 0, 1]);
					} finally {
						closedA = true;
					}
				}
			};

			const iterB = {
				*[Symbol.iterator]() {
					try {
						yield new Float64Array([0, 1, 0]);
						yield new Float64Array([0, 0, 1]);
						yield new Float64Array([1, 0, 0]);
					} finally {
						closedB = true;
					}
				}
			};

			const seen = [];
			for (const vec of crossProductTypedLazy(iterA, iterB)) {
				seen.push(vec);
				if (seen.length === 1) break;
			}

			assert.equal(seen.length, 1);
			assert.deepEqual(seen[0], new Float64Array([0, 0, 1]));
			assert.equal(closedA, true);
			assert.equal(closedB, true);
		});

		it('does not invoke Symbol.iterator until iteration begins', () => {
			let started = false;
			const lazy = {
				*[Symbol.iterator]() {
					started = true;
					yield new Float64Array([1, 0, 0]);
				}
			};
			const gen = crossProductTypedLazy(lazy, [new Float64Array([0, 1, 0])]);
			assert.equal(started, false);
			assert.deepEqual(gen.next().value, new Float64Array([0, 0, 1]));
			assert.equal(started, true);
		});
	});

	describe('invalid input validation', () => {
		it('throws TypeError for null, undefined, primitives, strings, and non-iterables', () => {
			assert.throws(() => crossProductTypedLazy(null, []), TypeError);
			assert.throws(() => crossProductTypedLazy([], undefined), TypeError);
			assert.throws(() => crossProductTypedLazy(123, 456), TypeError);
			assert.throws(() => crossProductTypedLazy('abc', 'def'), TypeError);
			assert.throws(
				() => crossProductTypedLazy(new String('abc'), new String('def')),
				TypeError
			);
			assert.throws(() => crossProductTypedLazy({}, {}), TypeError);
		});

		it('throws TypeError for non-Float64Array TypedArrays and mismatched single/sequence shapes', () => {
			const f32 = new Float32Array([1, 2, 3]);
			const i32 = new Int32Array([1, 2, 3]);
			const f64 = new Float64Array([1, 2, 3]);

			assert.throws(() => crossProductTypedLazy(f32, f32), TypeError);
			assert.throws(() => crossProductTypedLazy(i32, i32), TypeError);
			assert.throws(() => crossProductTypedLazy(f64, [f64]), TypeError);
			assert.throws(() => crossProductTypedLazy([f64], f64), TypeError);
		});

		it('throws TypeError if a sequence yields non-Float64Array elements', () => {
			const gen = crossProductTypedLazy([[1, 2, 3]], [new Float64Array([4, 5, 6])]);
			assert.throws(() => gen.next(), TypeError);

			const gen2 = crossProductTypedLazy(
				[new Float64Array([1, 2, 3])],
				[new Float32Array([4, 5, 6])]
			);
			assert.throws(() => gen2.next(), TypeError);
		});

		it('throws RangeError for NaN and Infinity components', () => {
			const valid = new Float64Array([1, 2, 3]);
			const withNaN = new Float64Array([1, Number.NaN, 3]);
			const withInf = new Float64Array([1, Number.POSITIVE_INFINITY, 3]);
			const withNegInf = new Float64Array([Number.NEGATIVE_INFINITY, 2, 3]);

			assert.throws(() => crossProductTypedLazy(withNaN, valid), RangeError);
			assert.throws(() => crossProductTypedLazy(valid, withInf), RangeError);
			assert.throws(() => crossProductTypedLazy(withNegInf, valid), RangeError);

			const gen = crossProductTypedLazy([withNaN], [valid]);
			assert.throws(() => gen.next(), RangeError);
		});

		it('throws RangeError when finite input sequences have different lengths and closes remaining iterator', () => {
			let closedLonger = false;
			const shorter = [new Float64Array([1, 0, 0])];
			const longer = {
				*[Symbol.iterator]() {
					try {
						yield new Float64Array([0, 1, 0]);
						yield new Float64Array([0, 0, 1]);
						yield new Float64Array([1, 1, 1]);
					} finally {
						closedLonger = true;
					}
				}
			};

			const gen = crossProductTypedLazy(shorter, longer);
			assert.deepEqual(gen.next().value, new Float64Array([0, 0, 1]));
			assert.throws(() => gen.next(), RangeError);
			assert.equal(closedLonger, true);
		});
	});

	describe('independent mathematical cross-checks', () => {
		const samplesA = [
			new Float64Array([3.2, -1.7, 4.5]),
			new Float64Array([-0.5, 2.25, -8.125]),
			new Float64Array([12.4, 0.3, -5.9]),
			new Float64Array([0.1, -0.2, 0.3])
		];
		const samplesB = [
			new Float64Array([-2.1, 5.4, 1.3]),
			new Float64Array([7.5, -3.25, 0.5]),
			new Float64Array([-1.1, 4.8, 2.7]),
			new Float64Array([0.4, 0.5, -0.6])
		];
		const samplesC = [
			new Float64Array([1.5, 2.5, -3.5]),
			new Float64Array([-4.0, 1.0, 2.0]),
			new Float64Array([0.75, -1.25, 3.5]),
			new Float64Array([-2.0, -3.0, 4.0])
		];

		it('satisfies orthogonality, anti-commutativity, and Lagrange identity', () => {
			const ab = [...crossProductTypedLazy(samplesA, samplesB)];
			const ba = [...crossProductTypedLazy(samplesB, samplesA)];

			for (let idx = 0; idx < samplesA.length; idx++) {
				const u = samplesA[idx];
				const v = samplesB[idx];
				const c = ab[idx];
				const cRev = ba[idx];

				// Orthogonality: (u × v) · u == 0 and (u × v) · v == 0
				assert.ok(Math.abs(dot3(c, u)) < 1e-11, `not orthogonal to u at ${idx}`);
				assert.ok(Math.abs(dot3(c, v)) < 1e-11, `not orthogonal to v at ${idx}`);

				// Anti-commutativity: u × v == -(v × u)
				assertCloseVec3(c, new Float64Array([-cRev[0], -cRev[1], -cRev[2]]));

				// Lagrange's identity: ||u × v||^2 == ||u||^2 ||v||^2 - (u · v)^2
				const lhs = normSq3(c);
				const rhs = normSq3(u) * normSq3(v) - dot3(u, v) ** 2;
				assert.ok(
					Math.abs(lhs - rhs) < 1e-9,
					`Lagrange identity failed at ${idx}: ${lhs} vs ${rhs}`
				);
			}
		});

		it('satisfies the Jacobi identity across streamed triples', () => {
			const bc = crossProductTypedLazy(samplesB, samplesC);
			const ca = crossProductTypedLazy(samplesC, samplesA);
			const ab = crossProductTypedLazy(samplesA, samplesB);

			const t1 = [...crossProductTypedLazy(samplesA, bc)];
			const t2 = [...crossProductTypedLazy(samplesB, ca)];
			const t3 = [...crossProductTypedLazy(samplesC, ab)];

			for (let idx = 0; idx < samplesA.length; idx++) {
				const sum = new Float64Array([
					t1[idx][0] + t2[idx][0] + t3[idx][0],
					t1[idx][1] + t2[idx][1] + t3[idx][1],
					t1[idx][2] + t2[idx][2] + t3[idx][2]
				]);
				assertCloseVec3(sum, new Float64Array([0, 0, 0]), 1e-10);
			}
		});
	});
});
