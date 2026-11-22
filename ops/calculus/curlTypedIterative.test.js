import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { curlTypedIterative } from './curlTypedIterative.js';

/**
 * Samples an analytical 3D vector field `fn(x, y, z) -> [fx, fy, fz]` onto a regular
 * row-major grid of dimensions `[nx, ny, nz]` with spacing `[dx, dy, dz]` and origin `[x0, y0, z0]`.
 */
function sampleField(shape, spacing, fn, origin = [0, 0, 0]) {
	const [nx, ny, nz] = shape;
	const [dx, dy, dz] = spacing;
	const [x0, y0, z0] = origin;
	const total = nx * ny * nz;
	const fx = new Float64Array(total);
	const fy = new Float64Array(total);
	const fz = new Float64Array(total);

	for (let i = 0; i < nx; i++) {
		const x = x0 + i * dx;
		for (let j = 0; j < ny; j++) {
			const y = y0 + j * dy;
			for (let k = 0; k < nz; k++) {
				const z = z0 + k * dz;
				const idx = (i * ny + j) * nz + k;
				const [vx, vy, vz] = fn(x, y, z);
				fx[idx] = vx;
				fy[idx] = vy;
				fz[idx] = vz;
			}
		}
	}
	return [fx, fy, fz];
}

function assertFieldClose(actual, expected, tol = 1e-12) {
	assert.equal(actual.length, 3);
	for (let c = 0; c < 3; c++) {
		assert.ok(actual[c] instanceof Float64Array, `component ${c} should be Float64Array`);
		assert.equal(actual[c].length, expected[c].length);
		for (let idx = 0; idx < expected[c].length; idx++) {
			const diff = Math.abs(actual[c][idx] - expected[c][idx]);
			assert.ok(
				diff <= tol,
				`component ${c} at index ${idx}: expected ${expected[c][idx]}, got ${actual[c][idx]} (diff=${diff} > ${tol})`
			);
		}
	}
}

function maxFieldError(actual, expected) {
	let maxErr = 0;
	for (let c = 0; c < 3; c++) {
		for (let idx = 0; idx < expected[c].length; idx++) {
			const diff = Math.abs(actual[c][idx] - expected[c][idx]);
			if (diff > maxErr) {
				maxErr = diff;
			}
		}
	}
	return maxErr;
}

describe('curlTypedIterative', () => {
	describe('analytical curl cross-checks (normal cases)', () => {
		it('computes exact curl (0, 0, 2) for solid body rotation F = (-y, x, 0) with default spacing', () => {
			const shape = [4, 5, 3];
			const spacing = [1, 1, 1];
			const field = sampleField(shape, spacing, (x, y) => [-y, x, 0]);
			const expected = sampleField(shape, spacing, () => [0, 0, 2]);

			const result = curlTypedIterative(field, shape);
			assertFieldClose(result, expected, 1e-12);
		});

		it('computes exact curl 2*omega for 3D rigid body rotation F = omega x r with anisotropic spacing and negative coordinates', () => {
			const shape = [5, 4, 6];
			const spacing = [0.25, 0.5, 0.2];
			const origin = [-2, -3, -1.5];
			const [wx, wy, wz] = [1.5, -2.25, 3.0];

			const field = sampleField(
				shape,
				spacing,
				(x, y, z) => [wy * z - wz * y, wz * x - wx * z, wx * y - wy * x],
				origin
			);
			const expected = sampleField(shape, spacing, () => [2 * wx, 2 * wy, 2 * wz], origin);

			const result = curlTypedIterative(field, shape, spacing);
			assertFieldClose(result, expected, 1e-12);
		});

		it('computes zero curl for irrotational gradient field F = (2x, 2y, 2z)', () => {
			const shape = [5, 5, 5];
			const spacing = [0.3, 0.4, 0.5];
			const field = sampleField(shape, spacing, (x, y, z) => [2 * x, 2 * y, 2 * z], [-1, -1, -1]);
			const expected = sampleField(shape, spacing, () => [0, 0, 0]);

			const result = curlTypedIterative(field, shape, spacing);
			assertFieldClose(result, expected, 1e-12);
		});

		it('computes zero curl for quadratic conservative field F = grad(x^2*y + y^2*z + z^2*x)', () => {
			const shape = [5, 6, 4];
			const spacing = [0.4, 0.25, 0.5];
			const field = sampleField(
				shape,
				spacing,
				(x, y, z) => [2 * x * y + z * z, x * x + 2 * y * z, y * y + 2 * z * x],
				[-1, -2, -0.5]
			);
			const expected = sampleField(shape, spacing, () => [0, 0, 0]);

			const result = curlTypedIterative(field, shape, spacing);
			assertFieldClose(result, expected, 1e-11);
		});

		it('computes exact curl (-z, -x, -y) everywhere (interior & boundaries) for quadratic field F = (y^2 + xz, z^2 + xy, x^2 + yz)', () => {
			const shape = [6, 5, 7];
			const spacing = [0.25, 0.5, 0.2];
			const origin = [-1.0, -0.5, -0.75];

			const field = sampleField(
				shape,
				spacing,
				(x, y, z) => [y * y + x * z, z * z + x * y, x * x + y * z],
				origin
			);
			const expected = sampleField(shape, spacing, (x, y, z) => [-z, -x, -y], origin);

			const result = curlTypedIterative(field, shape, spacing);
			assertFieldClose(result, expected, 1e-12);
		});

		it('matches analytical curl of smooth trigonometric field with O(h^2) convergence', () => {
			const fieldFn = (x, y, z) => [
				Math.sin(y) * Math.cos(z),
				Math.sin(z) * Math.cos(x),
				Math.sin(x) * Math.cos(y),
			];
			const curlFn = (x, y, z) => [
				-Math.sin(x) * Math.sin(y) - Math.cos(z) * Math.cos(x),
				-Math.sin(y) * Math.sin(z) - Math.cos(x) * Math.cos(y),
				-Math.sin(z) * Math.sin(x) - Math.cos(y) * Math.cos(z),
			];

			const coarseShape = [9, 9, 9];
			const coarseSpacing = [0.2, 0.2, 0.2];
			const coarseField = sampleField(coarseShape, coarseSpacing, fieldFn);
			const coarseExpected = sampleField(coarseShape, coarseSpacing, curlFn);
			const coarseErr = maxFieldError(curlTypedIterative(coarseField, coarseShape, coarseSpacing), coarseExpected);

			const fineShape = [17, 17, 17];
			const fineSpacing = [0.1, 0.1, 0.1];
			const fineField = sampleField(fineShape, fineSpacing, fieldFn);
			const fineExpected = sampleField(fineShape, fineSpacing, curlFn);
			const fineErr = maxFieldError(curlTypedIterative(fineField, fineShape, fineSpacing), fineExpected);

			assert.ok(coarseErr < 0.03, `coarse error too large: ${coarseErr}`);
			assert.ok(fineErr < 0.008, `fine error too large: ${fineErr}`);
			const ratio = coarseErr / fineErr;
			assert.ok(ratio > 3.5 && ratio < 4.5, `expected ~4x O(h^2) error reduction, got ${ratio}`);
		});

		it('satisfies vector calculus identities: linearity and div(curl(F)) = 0', () => {
			const shape = [7, 7, 7];
			const spacing = [0.25, 0.3, 0.2];
			const origin = [-0.5, -0.5, -0.5];

			// Linearity: curl(a*F + b*G) = a*curl(F) + b*curl(G)
			const a = 2.5;
			const b = -1.75;
			const fieldF = sampleField(shape, spacing, (x, y, z) => [y * y, z * x, x * y], origin);
			const fieldG = sampleField(shape, spacing, (x, y, z) => [-y, x + z * z, y * z], origin);
			const combined = [0, 1, 2].map((c) => {
				const arr = new Float64Array(fieldF[c].length);
				for (let idx = 0; idx < arr.length; idx++) {
					arr[idx] = a * fieldF[c][idx] + b * fieldG[c][idx];
				}
				return arr;
			});

			const curlF = curlTypedIterative(fieldF, shape, spacing);
			const curlG = curlTypedIterative(fieldG, shape, spacing);
			const curlCombined = curlTypedIterative(combined, shape, spacing);
			const linearExpected = [0, 1, 2].map((c) => {
				const arr = new Float64Array(curlF[c].length);
				for (let idx = 0; idx < arr.length; idx++) {
					arr[idx] = a * curlF[c][idx] + b * curlG[c][idx];
				}
				return arr;
			});
			assertFieldClose(curlCombined, linearExpected, 1e-11);

			// div(curl(F)) = 0 on interior points for cubic mixed field F = (x*y*z, x^2*z, y*z^2),
			// whose analytical curl is (z^2 - x^2, x*y, x*z) (non-trivial cancellation: -2x + x + x = 0).
			const cubicField = sampleField(
				shape,
				spacing,
				(x, y, z) => [x * y * z, x * x * z, y * z * z],
				origin
			);
			const [cx, cy, cz] = curlTypedIterative(cubicField, shape, spacing);
			const [nx, ny, nz] = shape;
			const [dx, dy, dz] = spacing;
			const strideX = ny * nz;
			const strideY = nz;

			for (let i = 1; i < nx - 1; i++) {
				for (let j = 1; j < ny - 1; j++) {
					for (let k = 1; k < nz - 1; k++) {
						const idx = i * strideX + j * strideY + k;
						const dCxDx = (cx[idx + strideX] - cx[idx - strideX]) / (2 * dx);
						const dCyDy = (cy[idx + strideY] - cy[idx - strideY]) / (2 * dy);
						const dCzDz = (cz[idx + 1] - cz[idx - 1]) / (2 * dz);
						const divOfCurl = dCxDx + dCyDy + dCzDz;
						assert.ok(
							Math.abs(divOfCurl) < 1e-11,
							`expected div(curl(F)) = 0 at (${i},${j},${k}), got ${divOfCurl}`
						);
					}
				}
			}
		});
	});

	describe('edge cases', () => {
		it('handles empty grids (any dimension 0) by returning empty Float64Arrays', () => {
			for (const shape of [
				[0, 0, 0],
				[0, 3, 4],
				[3, 0, 4],
				[3, 4, 0],
			]) {
				const empty = [new Float64Array(0), new Float64Array(0), new Float64Array(0)];
				const [cx, cy, cz] = curlTypedIterative(empty, shape, [0.5, 0.5, 0.5]);
				assert.ok(cx instanceof Float64Array && cx.length === 0);
				assert.ok(cy instanceof Float64Array && cy.length === 0);
				assert.ok(cz instanceof Float64Array && cz.length === 0);
			}
		});

		it('handles constant zero and non-zero fields without negative zeros', () => {
			const shape = [3, 3, 3];
			const total = 27;
			const zeros = [new Float64Array(total), new Float64Array(total), new Float64Array(total)];
			const [cx, cy, cz] = curlTypedIterative(zeros, shape);
			for (let idx = 0; idx < total; idx++) {
				assert.ok(Object.is(cx[idx], 0));
				assert.ok(Object.is(cy[idx], 0));
				assert.ok(Object.is(cz[idx], 0));
			}

			const constField = [
				new Float64Array(total).fill(-7.5),
				new Float64Array(total).fill(42.25),
				new Float64Array(total).fill(-0.125),
			];
			const [ccx, ccy, ccz] = curlTypedIterative(constField, shape, [0.2, 0.5, 1.5]);
			for (let idx = 0; idx < total; idx++) {
				assert.ok(Object.is(ccx[idx], 0));
				assert.ok(Object.is(ccy[idx], 0));
				assert.ok(Object.is(ccz[idx], 0));
			}
		});

		it('handles singleton axes (1x1x1 and 2D slice nx x ny x 1)', () => {
			const single = [new Float64Array([5]), new Float64Array([-3]), new Float64Array([9])];
			const [scx, scy, scz] = curlTypedIterative(single, [1, 1, 1]);
			assert.deepEqual(scx, new Float64Array([0]));
			assert.deepEqual(scy, new Float64Array([0]));
			assert.deepEqual(scz, new Float64Array([0]));

			const sliceShape = [4, 5, 1];
			const sliceSpacing = [0.5, 0.25, 1.0];
			const field2d = sampleField(sliceShape, sliceSpacing, (x, y) => [-y, x, 0]);
			const expected2d = sampleField(sliceShape, sliceSpacing, () => [0, 0, 2]);
			assertFieldClose(curlTypedIterative(field2d, sliceShape, sliceSpacing), expected2d, 1e-12);
		});

		it('handles 2x2x2 grids (first-order finite-difference fallback) exactly for linear fields', () => {
			const shape = [2, 2, 2];
			const spacing = [0.5, 0.25, 2.0];
			const field = sampleField(shape, spacing, (x, y, z) => [3 * z - 4 * y, 5 * x - 2 * z, y - 6 * x]);
			// Analytical curl:
			// Cx = dFz/dy - dFy/dz = 1 - (-2) = 3
			// Cy = dFx/dz - dFz/dx = 3 - (-6) = 9
			// Cz = dFy/dx - dFx/dy = 5 - (-4) = 9
			const expected = sampleField(shape, spacing, () => [3, 9, 9]);
			assertFieldClose(curlTypedIterative(field, shape, spacing), expected, 1e-12);
		});

		it('does not mutate input Float64Arrays and returns distinct output buffers', () => {
			const shape = [3, 3, 3];
			const spacing = [0.5, 0.5, 0.5];
			const field = sampleField(shape, spacing, (x, y, z) => [-y, x, z * z]);
			const snapshots = field.map((arr) => new Float64Array(arr));

			const out = curlTypedIterative(field, shape, spacing);
			for (let c = 0; c < 3; c++) {
				assert.notEqual(out[c], field[c]);
				assert.deepEqual(field[c], snapshots[c]);
			}
		});
	});

	describe('input validation', () => {
		const validField = () => [new Float64Array(8), new Float64Array(8), new Float64Array(8)];

		it('throws TypeError for non-array field, shape, or spacing', () => {
			assert.throws(() => curlTypedIterative(null, [2, 2, 2]), TypeError);
			assert.throws(() => curlTypedIterative({}, [2, 2, 2]), TypeError);
			assert.throws(() => curlTypedIterative(validField(), null), TypeError);
			assert.throws(() => curlTypedIterative(validField(), '222'), TypeError);
			assert.throws(() => curlTypedIterative(validField(), [2, 2, 2], null), TypeError);
			assert.throws(() => curlTypedIterative(validField(), [2, 2, 2], 1), TypeError);
		});

		it('throws TypeError when field components are not Float64Array instances', () => {
			assert.throws(
				() => curlTypedIterative([[0, 0], new Float64Array(2), new Float64Array(2)], [2, 1, 1]),
				TypeError
			);
			assert.throws(
				() => curlTypedIterative([new Float64Array(2), new Float32Array(2), new Float64Array(2)], [2, 1, 1]),
				TypeError
			);
			assert.throws(
				() => curlTypedIterative([new Float64Array(2), new Float64Array(2), null], [2, 1, 1]),
				TypeError
			);
		});

		it('throws TypeError when shape or spacing elements are not numbers', () => {
			assert.throws(() => curlTypedIterative(validField(), ['2', 2, 2]), TypeError);
			assert.throws(() => curlTypedIterative(validField(), [2, 2, 2], [1, '1', 1]), TypeError);
		});

		it('throws RangeError for invalid tuple lengths', () => {
			assert.throws(() => curlTypedIterative([new Float64Array(8), new Float64Array(8)], [2, 2, 2]), RangeError);
			assert.throws(() => curlTypedIterative(validField(), [2, 2]), RangeError);
			assert.throws(() => curlTypedIterative(validField(), [2, 2, 2], [1, 1]), RangeError);
			assert.throws(() => curlTypedIterative(validField(), [2, 2, 2], [1, 1, 1, 1]), RangeError);
		});

		it('throws RangeError for negative, non-integer, or non-finite shape dimensions', () => {
			assert.throws(() => curlTypedIterative(validField(), [-2, 2, 2]), RangeError);
			assert.throws(() => curlTypedIterative(validField(), [2.5, 2, 2]), RangeError);
			assert.throws(() => curlTypedIterative(validField(), [NaN, 2, 2]), RangeError);
			assert.throws(() => curlTypedIterative(validField(), [Infinity, 2, 2]), RangeError);
		});

		it('throws RangeError for component length mismatch', () => {
			assert.throws(
				() => curlTypedIterative([new Float64Array(8), new Float64Array(7), new Float64Array(8)], [2, 2, 2]),
				RangeError
			);
			assert.throws(() => curlTypedIterative(validField(), [3, 2, 2]), RangeError);
		});

		it('throws RangeError for non-positive or non-finite spacing', () => {
			assert.throws(() => curlTypedIterative(validField(), [2, 2, 2], [0, 1, 1]), RangeError);
			assert.throws(() => curlTypedIterative(validField(), [2, 2, 2], [1, -0.5, 1]), RangeError);
			assert.throws(() => curlTypedIterative(validField(), [2, 2, 2], [1, 1, NaN]), RangeError);
			assert.throws(() => curlTypedIterative(validField(), [2, 2, 2], [Infinity, 1, 1]), RangeError);
		});

		it('throws RangeError when any field component contains NaN or Infinity', () => {
			const withNaN = validField();
			withNaN[0][3] = NaN;
			assert.throws(() => curlTypedIterative(withNaN, [2, 2, 2]), RangeError);

			const withInf = validField();
			withInf[1][5] = Infinity;
			assert.throws(() => curlTypedIterative(withInf, [2, 2, 2]), RangeError);

			const withNegInf = validField();
			withNegInf[2][7] = -Infinity;
			assert.throws(() => curlTypedIterative(withNegInf, [2, 2, 2]), RangeError);

			// Also caught on singleton 1x1x1 grids
			assert.throws(
				() => curlTypedIterative([new Float64Array([NaN]), new Float64Array([0]), new Float64Array([0])], [1, 1, 1]),
				RangeError
			);
		});
	});
});
