import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crossProductTypedIterative } from './crossProductTypedIterative.js';

/**
 * Helper: dot product of two 3D triples starting at offset `offset`.
 */
function dot3(u, v, offset = 0) {
	return (
		u[offset] * v[offset] +
		u[offset + 1] * v[offset + 1] +
		u[offset + 2] * v[offset + 2]
	);
}

/**
 * Helper: squared Euclidean norm of a 3D triple starting at offset `offset`.
 */
function normSq3(u, offset = 0) {
	return dot3(u, u, offset);
}

/**
 * Helper: independent cross product using the Levi-Civita permutation tensor ε_ijk.
 */
function leviCivitaCross3(a, b, offset = 0) {
	const u = [a[offset], a[offset + 1], a[offset + 2]];
	const v = [b[offset], b[offset + 1], b[offset + 2]];
	const out = [0, 0, 0];

	const eps = (i, j, k) => {
		if (i === j || j === k || i === k) return 0;
		return ((j - i) * (k - i) * (k - j)) / 2;
	};

	for (let i = 0; i < 3; i++) {
		let sum = 0;
		for (let j = 0; j < 3; j++) {
			for (let k = 0; k < 3; k++) {
				const e = eps(i, j, k);
				if (e !== 0) {
					sum += e * u[j] * v[k];
				}
			}
		}
		out[i] = sum + 0;
	}
	return out;
}

/**
 * Helper: 3x3 determinant with rows a, b, c.
 */
function det3(a, b, c) {
	return (
		a[0] * (b[1] * c[2] - b[2] * c[1]) -
		a[1] * (b[0] * c[2] - b[2] * c[0]) +
		a[2] * (b[0] * c[1] - b[1] * c[0])
	);
}

/**
 * Helper: assert two numbers are close within tolerance.
 */
function assertClose(actual, expected, tol = 1e-12, message) {
	const diff = Math.abs(actual - expected);
	const scale = Math.max(1, Math.abs(actual), Math.abs(expected));
	assert.ok(
		diff <= tol * scale,
		message ?? `Expected ${actual} to be close to ${expected} (diff=${diff}, tol=${tol * scale})`
	);
}

describe('crossProductTypedIterative', () => {
	describe('normal cases', () => {
		it('computes right-handed standard basis cross products', () => {
			const i = new Float64Array([1, 0, 0]);
			const j = new Float64Array([0, 1, 0]);
			const k = new Float64Array([0, 0, 1]);

			assert.deepEqual(crossProductTypedIterative(i, j), new Float64Array([0, 0, 1]));
			assert.deepEqual(crossProductTypedIterative(j, k), new Float64Array([1, 0, 0]));
			assert.deepEqual(crossProductTypedIterative(k, i), new Float64Array([0, 1, 0]));

			assert.deepEqual(crossProductTypedIterative(j, i), new Float64Array([0, 0, -1]));
			assert.deepEqual(crossProductTypedIterative(k, j), new Float64Array([-1, 0, 0]));
			assert.deepEqual(crossProductTypedIterative(i, k), new Float64Array([0, -1, 0]));
		});

		it('computes exact cross product for general 3D vectors', () => {
			const a = new Float64Array([2, 3, 4]);
			const b = new Float64Array([5, 6, 7]);
			const res = crossProductTypedIterative(a, b);

			assert.ok(res instanceof Float64Array);
			assert.equal(res.length, 3);
			// [3*7 - 4*6, 4*5 - 2*7, 2*6 - 3*5] = [-3, 6, -3]
			assert.deepEqual(res, new Float64Array([-3, 6, -3]));
		});

		it('computes packed triples of length 3k iteratively', () => {
			const a = new Float64Array([
				1, 0, 0,
				2, 3, 4,
				-1.5, 2.5, -3.5,
				7, -2, 5,
			]);
			const b = new Float64Array([
				0, 1, 0,
				5, 6, 7,
				4, -2, 1,
				-3, 8, -1,
			]);
			const res = crossProductTypedIterative(a, b);

			assert.ok(res instanceof Float64Array);
			assert.equal(res.length, 12);
			assert.deepEqual(
				res,
				new Float64Array([
					0, 0, 1,
					-3, 6, -3,
					// triple 3: [2.5*1 - (-3.5)*(-2), (-3.5)*4 - (-1.5)*1, (-1.5)*(-2) - 2.5*4]
					//         = [2.5 - 7, -14 + 1.5, 3 - 10] = [-4.5, -12.5, -7]
					-4.5, -12.5, -7,
					// triple 4: [(-2)*(-1) - 5*8, 5*(-3) - 7*(-1), 7*8 - (-2)*(-3)]
					//         = [2 - 40, -15 + 7, 56 - 6] = [-38, -8, 50]
					-38, -8, 50,
				])
			);
		});

		it('does not mutate inputs when optional out is omitted', () => {
			const a = new Float64Array([3, -4, 5]);
			const b = new Float64Array([-1, 2, -3]);
			const aCopy = new Float64Array(a);
			const bCopy = new Float64Array(b);

			const res = crossProductTypedIterative(a, b);
			assert.notEqual(res, a);
			assert.notEqual(res, b);
			assert.deepEqual(a, aCopy);
			assert.deepEqual(b, bCopy);
		});

		it('supports writing into an optional out Float64Array (fresh, in-place, and overlapping views)', () => {
			const a = new Float64Array([2, 3, 4, 1, 0, 0]);
			const b = new Float64Array([5, 6, 7, 0, 1, 0]);
			const expected = new Float64Array([-3, 6, -3, 0, 0, 1]);

			// Fresh out buffer
			const out = new Float64Array(6);
			const ret = crossProductTypedIterative(a, b, out);
			assert.equal(ret, out);
			assert.deepEqual(out, expected);

			// In-place out === a
			const aInPlace = new Float64Array(a);
			const retA = crossProductTypedIterative(aInPlace, b, aInPlace);
			assert.equal(retA, aInPlace);
			assert.deepEqual(aInPlace, expected);

			// In-place out === b
			const bInPlace = new Float64Array(b);
			const retB = crossProductTypedIterative(a, bInPlace, bInPlace);
			assert.equal(retB, bInPlace);
			assert.deepEqual(bInPlace, expected);

			// Overlapping shifted subarray view on same ArrayBuffer
			const shared = new Float64Array([2, 3, 4, 1, 0, 0, 0, 0, 0]);
			const aView = shared.subarray(0, 6);
			const outView = shared.subarray(3, 9);
			const retOverlap = crossProductTypedIterative(aView, b, outView);
			assert.equal(retOverlap, outView);
			assert.deepEqual(outView, expected);
		});
	});

	describe('edge cases', () => {
		it('returns an empty Float64Array for empty inputs', () => {
			const a = new Float64Array(0);
			const b = new Float64Array(0);
			const res = crossProductTypedIterative(a, b);

			assert.ok(res instanceof Float64Array);
			assert.equal(res.length, 0);
		});

		it('returns zero vector for zero, parallel, and anti-parallel inputs without -0', () => {
			const zero = new Float64Array([0, 0, 0]);
			const v = new Float64Array([3.5, -2.25, 7.125]);
			const scaled = new Float64Array([-7, 4.5, -14.25]);

			for (const res of [
				crossProductTypedIterative(zero, zero),
				crossProductTypedIterative(zero, v),
				crossProductTypedIterative(v, zero),
				crossProductTypedIterative(v, v),
				crossProductTypedIterative(v, scaled),
				crossProductTypedIterative(
					new Float64Array([1, 0, 0]),
					new Float64Array([-1, 0, 0])
				),
			]) {
				assert.deepEqual(res, new Float64Array([0, 0, 0]));
				for (let idx = 0; idx < 3; idx++) {
					assert.ok(Object.is(res[idx], 0), `Expected +0 at index ${idx}, got ${res[idx]}`);
				}
			}
		});

		it('handles very small subnormal-adjacent and large finite magnitudes', () => {
			const smallA = new Float64Array([1e-150, 0, 0]);
			const smallB = new Float64Array([0, 1e-150, 0]);
			const smallRes = crossProductTypedIterative(smallA, smallB);
			assertClose(smallRes[2], 1e-300, 1e-12);
			assert.equal(smallRes[0], 0);
			assert.equal(smallRes[1], 0);

			const largeA = new Float64Array([1e100, 0, 0]);
			const largeB = new Float64Array([0, 1e100, 0]);
			const largeRes = crossProductTypedIterative(largeA, largeB);
			assertClose(largeRes[2], 1e200, 1e-12);
			assert.equal(largeRes[0], 0);
			assert.equal(largeRes[1], 0);
		});
	});

	describe('input validation', () => {
		it('throws TypeError when inputs or out are not Float64Array', () => {
			const valid = new Float64Array([1, 2, 3]);
			const badValues = [
				[1, 2, 3],
				new Float32Array([1, 2, 3]),
				new Int32Array([1, 2, 3]),
				null,
				undefined,
				{},
				'123',
				42,
			];

			for (const bad of badValues) {
				assert.throws(
					() => crossProductTypedIterative(bad, valid),
					TypeError
				);
				assert.throws(
					() => crossProductTypedIterative(valid, bad),
					TypeError
				);
				if (bad !== undefined) {
					assert.throws(
						() => crossProductTypedIterative(valid, valid, bad),
						TypeError
					);
				}
			}
		});

		it('throws RangeError when lengths mismatch or are not a multiple of 3', () => {
			assert.throws(
				() =>
					crossProductTypedIterative(
						new Float64Array([1, 2, 3]),
						new Float64Array([1, 2, 3, 4, 5, 6])
					),
				RangeError
			);

			for (const len of [1, 2, 4, 5, 7, 8]) {
				const a = new Float64Array(len);
				const b = new Float64Array(len);
				assert.throws(() => crossProductTypedIterative(a, b), RangeError);
			}

			assert.throws(
				() =>
					crossProductTypedIterative(
						new Float64Array([1, 2, 3]),
						new Float64Array([4, 5, 6]),
						new Float64Array(6)
					),
				RangeError
			);
		});

		it('throws RangeError on NaN, Infinity, or -Infinity without mutating out', () => {
			const nonFinites = [NaN, Infinity, -Infinity];
			for (const bad of nonFinites) {
				const out = new Float64Array([99, 99, 99, 99, 99, 99]);
				const aBad = new Float64Array([1, 2, 3, 4, bad, 6]);
				const bGood = new Float64Array([7, 8, 9, 10, 11, 12]);

				assert.throws(
					() => crossProductTypedIterative(aBad, bGood, out),
					RangeError
				);
				assert.deepEqual(out, new Float64Array([99, 99, 99, 99, 99, 99]));

				assert.throws(
					() => crossProductTypedIterative(bGood, aBad, out),
					RangeError
				);
				assert.deepEqual(out, new Float64Array([99, 99, 99, 99, 99, 99]));
			}
		});
	});

	describe('mathematical identities and independent cross-checks', () => {
		// Deterministic LCG for reproducible vector test suites
		function makeVectors(count, seed) {
			let state = seed >>> 0;
			const next = () => {
				state = (Math.imul(1664525, state) + 1013904223) >>> 0;
				return (state / 0x100000000) * 20 - 10;
			};
			const arr = new Float64Array(count * 3);
			for (let i = 0; i < arr.length; i++) {
				arr[i] = next();
			}
			return arr;
		}

		it('matches independent Levi-Civita tensor computation across 50 packed triples', () => {
			const count = 50;
			const a = makeVectors(count, 1337);
			const b = makeVectors(count, 4242);
			const c = crossProductTypedIterative(a, b);

			for (let k = 0; k < count; k++) {
				const off = k * 3;
				const ref = leviCivitaCross3(a, b, off);
				assertClose(c[off], ref[0], 1e-13);
				assertClose(c[off + 1], ref[1], 1e-13);
				assertClose(c[off + 2], ref[2], 1e-13);
			}
		});

		it('satisfies orthogonality, anti-commutativity, and Lagrange identity', () => {
			const count = 40;
			const a = makeVectors(count, 7);
			const b = makeVectors(count, 99);

			const axb = crossProductTypedIterative(a, b);
			const bxa = crossProductTypedIterative(b, a);

			for (let k = 0; k < count; k++) {
				const off = k * 3;

				// Orthogonality: (a × b) · a = 0 and (a × b) · b = 0
				const normA = Math.sqrt(normSq3(a, off));
				const normB = Math.sqrt(normSq3(b, off));
				const normCross = Math.sqrt(normSq3(axb, off));
				const orthoTol = 1e-12 * normCross * Math.max(normA, normB);
				assert.ok(Math.abs(dot3(axb, a, off)) <= orthoTol);
				assert.ok(Math.abs(dot3(axb, b, off)) <= orthoTol);

				// Anti-commutativity: a × b = -(b × a)
				assert.equal(axb[off], -bxa[off] + 0);
				assert.equal(axb[off + 1], -bxa[off + 1] + 0);
				assert.equal(axb[off + 2], -bxa[off + 2] + 0);

				// Lagrange's identity: ||a × b||^2 = ||a||^2 ||b||^2 - (a · b)^2
				const lhs = normSq3(axb, off);
				const abDot = dot3(a, b, off);
				const rhs = normSq3(a, off) * normSq3(b, off) - abDot * abDot;
				assertClose(lhs, rhs, 1e-11);
			}
		});

		it('satisfies Jacobi identity, BAC-CAB triple product, and 3x3 determinant relation', () => {
			const count = 25;
			const a = makeVectors(count, 101);
			const b = makeVectors(count, 202);
			const c = makeVectors(count, 303);

			const bxc = crossProductTypedIterative(b, c);
			const cxa = crossProductTypedIterative(c, a);
			const axb = crossProductTypedIterative(a, b);

			const ax_bxc = crossProductTypedIterative(a, bxc);
			const bx_cxa = crossProductTypedIterative(b, cxa);
			const cx_axb = crossProductTypedIterative(c, axb);

			for (let k = 0; k < count; k++) {
				const off = k * 3;
				const scale =
					Math.sqrt(normSq3(a, off)) *
					Math.sqrt(normSq3(b, off)) *
					Math.sqrt(normSq3(c, off));

				// Jacobi identity: a×(b×c) + b×(c×a) + c×(a×b) = 0
				for (let d = 0; d < 3; d++) {
					const jacobi =
						ax_bxc[off + d] + bx_cxa[off + d] + cx_axb[off + d];
					assert.ok(
						Math.abs(jacobi) <= 1e-11 * scale,
						`Jacobi residual too large at k=${k}, d=${d}: ${jacobi}`
					);
				}

				// BAC-CAB: a × (b × c) = b(a · c) - c(a · b)
				const aDotC = dot3(a, c, off);
				const aDotB = dot3(a, b, off);
				for (let d = 0; d < 3; d++) {
					const expected = b[off + d] * aDotC - c[off + d] * aDotB;
					assertClose(ax_bxc[off + d], expected, 1e-11);
				}

				// Scalar triple product equals 3x3 determinant: c · (a × b) = det([a, b, c])
				const scalarTriple = dot3(c, axb, off);
				const det = det3(
					[a[off], a[off + 1], a[off + 2]],
					[b[off], b[off + 1], b[off + 2]],
					[c[off], c[off + 1], c[off + 2]]
				);
				assertClose(scalarTriple, det, 1e-11);
			}
		});
	});
});
