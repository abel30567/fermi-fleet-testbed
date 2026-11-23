import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { determinantFloatSeries } from "./determinantFloatSeries.js";

/**
 * Independent reference implementation via recursive Laplace (cofactor) expansion
 * along the first row, for cross-checking small matrices.
 */
function cofactorDeterminant(m) {
	const n = m.length;
	if (n === 1) return m[0][0];
	if (n === 2) return m[0][0] * m[1][1] - m[0][1] * m[1][0];
	let sum = 0;
	for (let c = 0; c < n; c++) {
		const minor = [];
		for (let r = 1; r < n; r++) {
			const row = [];
			for (let k = 0; k < n; k++) {
				if (k !== c) row.push(m[r][k]);
			}
			minor.push(row);
		}
		sum += (c % 2 === 0 ? 1 : -1) * m[0][c] * cofactorDeterminant(minor);
	}
	return sum;
}

function matMul(a, b) {
	const n = a.length;
	const out = Array.from({ length: n }, () => new Array(n).fill(0));
	for (let i = 0; i < n; i++) {
		for (let k = 0; k < n; k++) {
			for (let j = 0; j < n; j++) {
				out[i][j] += a[i][k] * b[k][j];
			}
		}
	}
	return out;
}

function transpose(m) {
	const n = m.length;
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => m[j][i]),
	);
}

function swapRows(m, r1, r2) {
	const copy = m.map((row) => row.slice());
	[copy[r1], copy[r2]] = [copy[r2], copy[r1]];
	return copy;
}

function assertClose(actual, expected, tol = 1e-9, msg = "") {
	const scale = Math.max(1, Math.abs(expected));
	assert.ok(
		Math.abs(actual - expected) <= tol * scale,
		`${msg ? msg + ": " : ""}expected ${actual} to be close to ${expected} (tol=${tol * scale})`,
	);
}

describe("determinantFloatSeries", () => {
	describe("normal cases", () => {
		it("computes 1x1 determinants", () => {
			assert.equal(determinantFloatSeries([[7]]), 7);
			assert.equal(determinantFloatSeries([[-3.5]]), -3.5);
			assert.equal(Object.is(determinantFloatSeries([[0]]), 0), true);
			assert.equal(Object.is(determinantFloatSeries([[-0]]), 0), true);
		});

		it("computes 2x2 determinants", () => {
			assert.equal(
				determinantFloatSeries([
					[1, 2],
					[3, 4],
				]),
				-2,
			);
			assert.equal(
				determinantFloatSeries([
					[1, 0],
					[0, 1],
				]),
				1,
			);
			assertClose(
				determinantFloatSeries([
					[1.5, -2.25],
					[4.0, 3.5],
				]),
				1.5 * 3.5 - -2.25 * 4.0,
			);
		});

		it("computes 3x3 determinants", () => {
			assert.equal(
				determinantFloatSeries([
					[6, 1, 1],
					[4, -2, 5],
					[2, 8, 7],
				]),
				-306,
			);
			assert.equal(
				determinantFloatSeries([
					[1, 0, 0],
					[0, 1, 0],
					[0, 0, 1],
				]),
				1,
			);
		});

		it("computes 4x4 determinants including zero-diagonal pivot cases", () => {
			const m = [
				[0, 2, 1, 3],
				[4, 0, 2, 1],
				[1, 3, 0, 2],
				[2, 1, 4, 0],
			];
			assertClose(determinantFloatSeries(m), -87, 1e-11);
			assertClose(determinantFloatSeries(m), cofactorDeterminant(m), 1e-11);

			const m2 = [
				[1, 3, 5, 9],
				[1, 3, 1, 7],
				[4, 3, 9, 7],
				[5, 2, 0, 9],
			];
			assertClose(determinantFloatSeries(m2), -376, 1e-11);
		});

		it("computes 5x5 determinants", () => {
			// Vandermonde matrix for [1, 2, 3, 4, 5]: det = prod_{i<j}(x_j - x_i) = 1!*2!*3!*4! = 288
			const xs = [1, 2, 3, 4, 5];
			const vandermonde = xs.map((x) =>
				Array.from({ length: 5 }, (_, p) => x ** p),
			);
			assertClose(determinantFloatSeries(vandermonde), 288, 1e-10);

			const general5 = [
				[2, -1, 0, 3, 1],
				[1, 4, -2, 0, 2],
				[0, 2, 5, -1, 3],
				[-3, 1, 2, 4, -2],
				[1, 0, -1, 2, 6],
			];
			assertClose(
				determinantFloatSeries(general5),
				cofactorDeterminant(general5),
				1e-10,
			);
		});

		it("returns 0 for singular matrices", () => {
			// 2x2 proportional rows
			assert.equal(
				determinantFloatSeries([
					[2, 4],
					[1, 2],
				]),
				0,
			);
			// 3x3 linearly dependent rows (row3 = row1 + row2)
			assert.equal(
				determinantFloatSeries([
					[1, 2, 3],
					[4, 5, 6],
					[5, 7, 9],
				]),
				0,
			);
			// 4x4 zero column
			assert.equal(
				determinantFloatSeries([
					[1, 0, 2, 3],
					[4, 0, 5, 6],
					[7, 0, 8, 9],
					[10, 0, 11, 13],
				]),
				0,
			);
			// 5x5 duplicate rows
			assertClose(
				determinantFloatSeries([
					[1, 2, 3, 4, 5],
					[6, 7, 8, 9, 10],
					[2, -1, 4, 0, 3],
					[1, 2, 3, 4, 5],
					[9, 1, -2, 7, 4],
				]),
				0,
				1e-11,
			);
		});

		it("computes determinants of upper and lower triangular matrices", () => {
			const upper4 = [
				[2, 5, -1, 8],
				[0, -3, 4, 7],
				[0, 0, 5, -2],
				[0, 0, 0, 0.5],
			];
			assertClose(determinantFloatSeries(upper4), 2 * -3 * 5 * 0.5, 1e-12);

			const lower5 = [
				[-2, 0, 0, 0, 0],
				[9, 3, 0, 0, 0],
				[4, -1, 0.25, 0, 0],
				[7, 8, 6, -4, 0],
				[1, 2, 3, 4, 5],
			];
			assertClose(
				determinantFloatSeries(lower5),
				-2 * 3 * 0.25 * -4 * 5,
				1e-12,
			);
		});

		it("computes determinants of orthogonal matrices (±1)", () => {
			// 2D rotation matrix (det = +1)
			const theta = 1.2345;
			const rot2 = [
				[Math.cos(theta), -Math.sin(theta)],
				[Math.sin(theta), Math.cos(theta)],
			];
			assertClose(determinantFloatSeries(rot2), 1, 1e-12);

			// 3D rotation around z-axis composed with reflection across x (det = -1)
			const reflRot3 = [
				[-Math.cos(theta), Math.sin(theta), 0],
				[Math.sin(theta), Math.cos(theta), 0],
				[0, 0, 1],
			];
			assertClose(determinantFloatSeries(reflRot3), -1, 1e-12);

			// 4x4 normalized Hadamard matrix (orthogonal, det = +1)
			const s = 0.5;
			const hadamard4 = [
				[s, s, s, s],
				[s, -s, s, -s],
				[s, s, -s, -s],
				[s, -s, -s, s],
			];
			assertClose(determinantFloatSeries(hadamard4), 1, 1e-12);

			// 4x4 odd permutation matrix (orthogonal, det = -1)
			const perm4 = [
				[0, 1, 0, 0],
				[1, 0, 0, 0],
				[0, 0, 1, 0],
				[0, 0, 0, 1],
			];
			assert.equal(determinantFloatSeries(perm4), -1);
		});

		it("does not mutate the input matrix", () => {
			const original = [
				[0, 2, 1, 3],
				[4, 0, 2, 1],
				[1, 3, 0, 2],
				[2, 1, 4, 0],
			];
			const snapshot = original.map((r) => r.slice());
			determinantFloatSeries(original);
			assert.deepEqual(original, snapshot);
		});

		it("avoids spurious intermediate overflow/underflow in LU product", () => {
			const scaled = [
				[1e200, 0, 0, 0],
				[0, 1e200, 0, 0],
				[0, 0, 1e-200, 0],
				[0, 0, 0, 1e-200],
			];
			assertClose(determinantFloatSeries(scaled), 1, 1e-11);
		});
	});

	describe("edge cases and input validation", () => {
		it("rejects non-array inputs", () => {
			for (const bad of [null, undefined, 42, "[[1]]", {}, true]) {
				assert.throws(() => determinantFloatSeries(bad), TypeError);
			}
		});

		it("rejects empty matrices", () => {
			assert.throws(() => determinantFloatSeries([]), RangeError);
			assert.throws(() => determinantFloatSeries([[]]), RangeError);
		});

		it("rejects non-array rows", () => {
			assert.throws(() => determinantFloatSeries([1, 2]), TypeError);
			assert.throws(
				() => determinantFloatSeries([[1, 2], null]),
				TypeError,
			);
		});

		it("rejects non-square and ragged matrices", () => {
			assert.throws(
				() =>
					determinantFloatSeries([
						[1, 2, 3],
						[4, 5, 6],
					]),
				RangeError,
			);
			assert.throws(
				() =>
					determinantFloatSeries([
						[1, 2],
						[3, 4],
						[5, 6],
					]),
				RangeError,
			);
			assert.throws(
				() =>
					determinantFloatSeries([
						[1, 2],
						[3],
					]),
				RangeError,
			);
			assert.throws(
				() =>
					determinantFloatSeries([
						[1, 2, 3],
						[4, 5],
						[6, 7, 8],
					]),
				RangeError,
			);
		});

		it("rejects NaN, Infinity, -Infinity, and non-number entries", () => {
			assert.throws(() => determinantFloatSeries([[NaN]]), TypeError);
			assert.throws(() => determinantFloatSeries([[Infinity]]), TypeError);
			assert.throws(
				() => determinantFloatSeries([[-Infinity]]),
				TypeError,
			);
			assert.throws(
				() =>
					determinantFloatSeries([
						[1, 2],
						[3, NaN],
					]),
				TypeError,
			);
			assert.throws(
				() =>
					determinantFloatSeries([
						[1, "2"],
						[3, 4],
					]),
				TypeError,
			);
			assert.throws(
				() =>
					determinantFloatSeries([
						[1, undefined],
						[3, 4],
					]),
				TypeError,
			);
			assert.throws(
				() =>
					determinantFloatSeries([
						[1n, 0n],
						[0n, 1n],
					]),
				TypeError,
			);
		});

		it("normalizes -0 to +0", () => {
			const res = determinantFloatSeries([
				[0, -0],
				[1, 0],
			]);
			assert.equal(Object.is(res, 0), true);
		});
	});

	describe("independent mathematical cross-checks", () => {
		const m3 = [
			[2.5, -1.2, 3.4],
			[0.7, 4.1, -2.3],
			[-1.9, 0.8, 5.2],
		];
		const m4a = [
			[3.1, -0.5, 2.2, 1.4],
			[-1.7, 4.3, 0.8, -2.1],
			[2.0, 1.1, -3.5, 0.9],
			[0.6, -2.8, 1.3, 2.7],
		];
		const m4b = [
			[-1.2, 2.4, 0.3, -1.5],
			[3.0, -0.9, 2.1, 1.8],
			[0.5, 1.6, -2.7, 3.2],
			[-2.3, 0.7, 1.9, -0.4],
		];

		it("matches independent cofactor expansion on 3x3 and 4x4 matrices", () => {
			assertClose(
				determinantFloatSeries(m3),
				cofactorDeterminant(m3),
				1e-12,
				"3x3 cofactor check",
			);
			assertClose(
				determinantFloatSeries(m4a),
				cofactorDeterminant(m4a),
				1e-11,
				"4x4 cofactor check A",
			);
			assertClose(
				determinantFloatSeries(m4b),
				cofactorDeterminant(m4b),
				1e-11,
				"4x4 cofactor check B",
			);
		});

		it("satisfies multiplicativity det(A * B) = det(A) * det(B)", () => {
			const detA = determinantFloatSeries(m4a);
			const detB = determinantFloatSeries(m4b);
			const detAB = determinantFloatSeries(matMul(m4a, m4b));
			assertClose(detAB, detA * detB, 1e-10, "det(AB) = det(A)det(B)");
		});

		it("satisfies transpose invariance det(A^T) = det(A)", () => {
			assertClose(
				determinantFloatSeries(transpose(m3)),
				determinantFloatSeries(m3),
				1e-12,
				"3x3 transpose",
			);
			assertClose(
				determinantFloatSeries(transpose(m4a)),
				determinantFloatSeries(m4a),
				1e-11,
				"4x4 transpose",
			);
		});

		it("satisfies row-swap sign flip det(swap(A)) = -det(A)", () => {
			assertClose(
				determinantFloatSeries(swapRows(m3, 0, 2)),
				-determinantFloatSeries(m3),
				1e-12,
				"3x3 row swap",
			);
			assertClose(
				determinantFloatSeries(swapRows(m4a, 1, 3)),
				-determinantFloatSeries(m4a),
				1e-11,
				"4x4 row swap",
			);
		});

		it("satisfies homogeneity det(c * A) = c^n * det(A)", () => {
			const c = -2.5;
			const scaled = m4a.map((row) => row.map((v) => v * c));
			assertClose(
				determinantFloatSeries(scaled),
				c ** 4 * determinantFloatSeries(m4a),
				1e-10,
				"4x4 homogeneity",
			);
		});
	});
});
