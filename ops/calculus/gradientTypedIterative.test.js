import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gradientTypedIterative } from './gradientTypedIterative.js';

function assertCloseArray(actual, expected, tol = 1e-12, label = '') {
	assert.ok(actual instanceof Float64Array, `${label}: expected Float64Array`);
	assert.equal(actual.length, expected.length, `${label}: length mismatch`);
	for (let i = 0; i < expected.length; i++) {
		const diff = Math.abs(actual[i] - expected[i]);
		assert.ok(
			diff <= tol,
			`${label}[${i}]: expected ${expected[i]}, got ${actual[i]} (diff ${diff} > ${tol})`,
		);
	}
}

describe('gradientTypedIterative', () => {
	describe('1D normal cases', () => {
		it('computes zero gradient for constant fields (including large constant offset)', () => {
			const zeros = new Float64Array([0, 0, 0, 0, 0]);
			assertCloseArray(gradientTypedIterative(zeros), [0, 0, 0, 0, 0], 0);

			const largeConst = new Float64Array([1e12, 1e12, 1e12, 1e12]);
			assertCloseArray(gradientTypedIterative(largeConst, undefined, 0.1, 1), [0, 0, 0, 0], 0);
			assertCloseArray(gradientTypedIterative(largeConst, undefined, 0.1, 2), [0, 0, 0, 0], 0);
		});

		it('is exact everywhere for 1D linear functions with default and custom spacing', () => {
			// f(x) = -3.5x + 7 with h = 1 -> f'(x) = -3.5
			const f1 = new Float64Array([7, 3.5, 0, -3.5, -7]);
			assertCloseArray(gradientTypedIterative(f1), [-3.5, -3.5, -3.5, -3.5, -3.5], 1e-14);

			// f(x) = -3.5x + 7 with h = 0.25 -> x = [-1, -0.75, -0.5, -0.25, 0]
			const h = 0.25;
			const f2 = new Float64Array(5);
			for (let i = 0; i < 5; i++) {
				const x = -1 + i * h;
				f2[i] = -3.5 * x + 7;
			}
			assertCloseArray(
				gradientTypedIterative(f2, undefined, h),
				[-3.5, -3.5, -3.5, -3.5, -3.5],
				1e-14,
			);
			assertCloseArray(
				gradientTypedIterative(f2, [5], [h]),
				[-3.5, -3.5, -3.5, -3.5, -3.5],
				1e-14,
			);
		});

		it('computes central interior and one-sided boundary differences on 1D quadratic', () => {
			// f(x) = x^2 at x = [1, 2, 3, 4, 5], h = 1 -> f'(x) = [2, 4, 6, 8, 10]
			const f = new Float64Array([1, 4, 9, 16, 25]);
			// edgeOrder=1: left=(4-1)/1=3, interior exact [4,6,8], right=(25-16)/1=9
			assertCloseArray(gradientTypedIterative(f), [3, 4, 6, 8, 9], 1e-14);
			// edgeOrder=2: exact everywhere [2, 4, 6, 8, 10]
			assertCloseArray(gradientTypedIterative(f, undefined, 1, 2), [2, 4, 6, 8, 10], 1e-14);
		});

		it('supports non-uniform 1D coordinates via Float64Array and [Float64Array]', () => {
			// f(x) = 2x^2 - 5x + 1 -> f'(x) = 4x - 5
			const x = new Float64Array([-2.0, -0.5, 0.25, 1.5, 4.0]);
			const f = new Float64Array(x.length);
			const exact = new Float64Array(x.length);
			for (let i = 0; i < x.length; i++) {
				f[i] = 2 * x[i] * x[i] - 5 * x[i] + 1;
				exact[i] = 4 * x[i] - 5;
			}

			// Interior exact with edgeOrder=1
			const g1 = gradientTypedIterative(f, undefined, x, 1);
			assert.ok(Math.abs(g1[0] - (f[1] - f[0]) / (x[1] - x[0])) <= 1e-14);
			for (let i = 1; i < x.length - 1; i++) {
				assert.ok(Math.abs(g1[i] - exact[i]) <= 1e-12);
			}
			const last = x.length - 1;
			assert.ok(Math.abs(g1[last] - (f[last] - f[last - 1]) / (x[last] - x[last - 1])) <= 1e-14);

			// Everywhere exact with edgeOrder=2 (both direct Float64Array and wrapped array)
			assertCloseArray(gradientTypedIterative(f, undefined, x, 2), exact, 1e-12);
			assertCloseArray(gradientTypedIterative(f, [x.length], [x], 2), exact, 1e-12);
		});

		it('does not mutate input Float64Array or coordinate arrays', () => {
			const values = new Float64Array([1, 3, 7, 13]);
			const coords = new Float64Array([0, 1, 3, 6]);
			const valuesCopy = new Float64Array(values);
			const coordsCopy = new Float64Array(coords);

			gradientTypedIterative(values, undefined, coords);

			assert.deepEqual(values, valuesCopy);
			assert.deepEqual(coords, coordsCopy);
		});
	});

	describe('N-D normal cases', () => {
		it('computes 2D linear gradient with scalar, array, and Float64Array spacings', () => {
			// f(x, y) = 5x - 2y + 3 on 4x3 grid with hx = 0.5, hy = 2.0
			const nx = 4;
			const ny = 3;
			const hx = 0.5;
			const hy = 2.0;
			const values = new Float64Array(nx * ny);
			for (let i = 0; i < nx; i++) {
				const x = i * hx;
				for (let j = 0; j < ny; j++) {
					const y = j * hy;
					values[i * ny + j] = 5 * x - 2 * y + 3;
				}
			}

			const expectedX = new Float64Array(nx * ny).fill(5);
			const expectedY = new Float64Array(nx * ny).fill(-2);

			const [gxArr, gyArr] = gradientTypedIterative(values, [nx, ny], [hx, hy]);
			assertCloseArray(gxArr, expectedX, 1e-13, '2D array spacing gx');
			assertCloseArray(gyArr, expectedY, 1e-13, '2D array spacing gy');

			const [gxTyped, gyTyped] = gradientTypedIterative(
				values,
				[nx, ny],
				new Float64Array([hx, hy]),
			);
			assertCloseArray(gxTyped, expectedX, 1e-13, '2D Float64Array spacing gx');
			assertCloseArray(gyTyped, expectedY, 1e-13, '2D Float64Array spacing gy');
		});

		it('supports mixed uniform and non-uniform per-axis spacing in 2D', () => {
			// f(x, y) = x^2 + 3xy - 2y^2 -> df/dx = 2x + 3y, df/dy = 3x - 4y
			const nx = 4;
			const hx = 0.5;
			const yCoords = new Float64Array([-2, -0.5, 1.0, 4.0]);
			const ny = yCoords.length;
			const values = new Float64Array(nx * ny);
			const exactX = new Float64Array(nx * ny);
			const exactY = new Float64Array(nx * ny);

			for (let i = 0; i < nx; i++) {
				const x = -1 + i * hx;
				for (let j = 0; j < ny; j++) {
					const y = yCoords[j];
					const idx = i * ny + j;
					values[idx] = x * x + 3 * x * y - 2 * y * y;
					exactX[idx] = 2 * x + 3 * y;
					exactY[idx] = 3 * x - 4 * y;
				}
			}

			const [gx, gy] = gradientTypedIterative(values, [nx, ny], [hx, yCoords], 2);
			assertCloseArray(gx, exactX, 1e-12, 'mixed 2D gx');
			assertCloseArray(gy, exactY, 1e-12, 'mixed 2D gy');
		});

		it('computes 3D partial derivatives accurately', () => {
			// f(x, y, z) = x^2 - 2xy + 3yz + z^2
			// grad = [2x - 2y, -2x + 3z, 3y + 2z]
			const shape = [3, 4, 3];
			const [nx, ny, nz] = shape;
			const spacing = [0.5, 0.25, 1.0];
			const values = new Float64Array(nx * ny * nz);
			const exactX = new Float64Array(nx * ny * nz);
			const exactY = new Float64Array(nx * ny * nz);
			const exactZ = new Float64Array(nx * ny * nz);

			for (let i = 0; i < nx; i++) {
				const x = i * spacing[0];
				for (let j = 0; j < ny; j++) {
					const y = j * spacing[1];
					for (let k = 0; k < nz; k++) {
						const z = k * spacing[2];
						const idx = (i * ny + j) * nz + k;
						values[idx] = x * x - 2 * x * y + 3 * y * z + z * z;
						exactX[idx] = 2 * x - 2 * y;
						exactY[idx] = -2 * x + 3 * z;
						exactZ[idx] = 3 * y + 2 * z;
					}
				}
			}

			const [gx, gy, gz] = gradientTypedIterative(values, shape, spacing, 2);
			assertCloseArray(gx, exactX, 1e-12, '3D gx');
			assertCloseArray(gy, exactY, 1e-12, '3D gy');
			assertCloseArray(gz, exactZ, 1e-12, '3D gz');
		});
	});

	describe('edge cases', () => {
		it('handles empty 1D and N-D Float64Arrays', () => {
			const empty = new Float64Array(0);
			const res1d = gradientTypedIterative(empty);
			assert.ok(res1d instanceof Float64Array);
			assert.equal(res1d.length, 0);

			const res2d = gradientTypedIterative(empty, [0, 3]);
			assert.ok(Array.isArray(res2d));
			assert.equal(res2d.length, 2);
			assert.equal(res2d[0].length, 0);
			assert.equal(res2d[1].length, 0);
		});

		it('handles single-element 1D and two-element 1D arrays', () => {
			const single = new Float64Array([42]);
			assertCloseArray(gradientTypedIterative(single), [0], 0);

			const pair = new Float64Array([10, 16]);
			assertCloseArray(gradientTypedIterative(pair, undefined, 2), [3, 3], 1e-14);
			assertCloseArray(
				gradientTypedIterative(pair, undefined, new Float64Array([-3, -1])),
				[3, 3],
				1e-14,
			);
		});

		it('handles singleton dimensions in 2D grids', () => {
			// shape = [1, 4]: axis 0 is singleton (0s), axis 1 has linear slope 2
			const row = new Float64Array([1, 3, 5, 7]);
			const [gxRow, gyRow] = gradientTypedIterative(row, [1, 4], 1);
			assertCloseArray(gxRow, [0, 0, 0, 0], 0);
			assertCloseArray(gyRow, [2, 2, 2, 2], 1e-14);

			// shape = [4, 1]: axis 0 has linear slope -3, axis 1 is singleton (0s)
			const col = new Float64Array([9, 6, 3, 0]);
			const [gxCol, gyCol] = gradientTypedIterative(col, [4, 1], 1);
			assertCloseArray(gxCol, [-3, -3, -3, -3], 1e-14);
			assertCloseArray(gyCol, [0, 0, 0, 0], 0);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-Float64Array values', () => {
			assert.throws(() => gradientTypedIterative([1, 2, 3]), TypeError);
			assert.throws(() => gradientTypedIterative(new Float32Array([1, 2, 3])), TypeError);
			assert.throws(() => gradientTypedIterative(null), TypeError);
			assert.throws(() => gradientTypedIterative(undefined), TypeError);
		});

		it('throws RangeError for NaN or Infinity in values', () => {
			assert.throws(() => gradientTypedIterative(new Float64Array([1, Number.NaN, 3])), RangeError);
			assert.throws(() => gradientTypedIterative(new Float64Array([1, Infinity, 3])), RangeError);
			assert.throws(() => gradientTypedIterative(new Float64Array([-Infinity, 2, 3])), RangeError);
		});

		it('validates shape type, positivity, integrality, and length match', () => {
			const v = new Float64Array([1, 2, 3, 4]);
			assert.throws(() => gradientTypedIterative(v, '2x2'), TypeError);
			assert.throws(() => gradientTypedIterative(v, []), RangeError);
			assert.throws(() => gradientTypedIterative(v, [2, '2']), TypeError);
			assert.throws(() => gradientTypedIterative(v, [-2, 2]), RangeError);
			assert.throws(() => gradientTypedIterative(v, [2.5, 2]), RangeError);
			assert.throws(() => gradientTypedIterative(v, [3, 2]), RangeError);
		});

		it('validates spacing values, lengths, and monotonicity', () => {
			const v = new Float64Array([1, 2, 3, 4]);
			assert.throws(() => gradientTypedIterative(v, undefined, 0), RangeError);
			assert.throws(() => gradientTypedIterative(v, undefined, -1), RangeError);
			assert.throws(() => gradientTypedIterative(v, undefined, Number.NaN), RangeError);
			assert.throws(() => gradientTypedIterative(v, undefined, Infinity), RangeError);
			assert.throws(() => gradientTypedIterative(v, undefined, '1'), TypeError);
			assert.throws(() => gradientTypedIterative(v, undefined, null), TypeError);

			// 1D coordinate Float64Array checks
			assert.throws(
				() => gradientTypedIterative(v, undefined, new Float64Array([0, 1, 2])),
				RangeError,
			);
			assert.throws(
				() => gradientTypedIterative(v, undefined, new Float64Array([0, 1, 1, 2])),
				RangeError,
			);
			assert.throws(
				() => gradientTypedIterative(v, undefined, new Float64Array([0, 2, 1, 3])),
				RangeError,
			);
			assert.throws(
				() => gradientTypedIterative(v, undefined, new Float64Array([0, 1, Number.NaN, 3])),
				RangeError,
			);

			// 2D spacing checks
			assert.throws(() => gradientTypedIterative(v, [2, 2], [1]), RangeError);
			assert.throws(() => gradientTypedIterative(v, [2, 2], [1, -0.5]), RangeError);
			assert.throws(() => gradientTypedIterative(v, [2, 2], [1, 'bad']), TypeError);
			assert.throws(
				() => gradientTypedIterative(v, [2, 2], new Float64Array([1, 2, 3])),
				RangeError,
			);
			assert.throws(
				() => gradientTypedIterative(v, [2, 2], new Float64Array([1, 0])),
				RangeError,
			);
		});

		it('validates edgeOrder and minimum axis length for edgeOrder=2', () => {
			const v = new Float64Array([1, 2, 3, 4]);
			assert.throws(() => gradientTypedIterative(v, undefined, 1, '2'), TypeError);
			assert.throws(() => gradientTypedIterative(v, undefined, 1, 3), RangeError);
			assert.throws(() => gradientTypedIterative(v, undefined, 1, 0), RangeError);
			assert.throws(() => gradientTypedIterative(new Float64Array([1, 2]), undefined, 1, 2), RangeError);
			assert.throws(() => gradientTypedIterative(v, [2, 2], 1, 2), RangeError);
		});
	});

	describe('independent analytical cross-checks', () => {
		it('matches analytical gradient of f(x, y) = 2x^2 + 3xy - y^2 -> [4x + 3y, 3x - 2y]', () => {
			const nx = 6;
			const ny = 5;
			const hx = 0.5;
			const hy = 0.25;
			const x0 = -1.0;
			const y0 = 0.5;

			const values = new Float64Array(nx * ny);
			const analyticalX = new Float64Array(nx * ny);
			const analyticalY = new Float64Array(nx * ny);

			for (let i = 0; i < nx; i++) {
				const x = x0 + i * hx;
				for (let j = 0; j < ny; j++) {
					const y = y0 + j * hy;
					const idx = i * ny + j;
					values[idx] = 2 * x * x + 3 * x * y - y * y;
					analyticalX[idx] = 4 * x + 3 * y;
					analyticalY[idx] = 3 * x - 2 * y;
				}
			}

			// Default edgeOrder=1: exact in interior, exact first-order Taylor offset at boundaries
			const [gx1, gy1] = gradientTypedIterative(values, [nx, ny], [hx, hy], 1);
			for (let i = 0; i < nx; i++) {
				for (let j = 0; j < ny; j++) {
					const idx = i * ny + j;
					// For 2x^2: forward diff at i=0 gives f'(x) + 2*hx; backward at i=nx-1 gives f'(x) - 2*hx
					const expectedGx1 =
						i === 0
							? analyticalX[idx] + 2 * hx
							: i === nx - 1
								? analyticalX[idx] - 2 * hx
								: analyticalX[idx];
					// For -y^2: forward diff at j=0 gives f'(y) - hy; backward at j=ny-1 gives f'(y) + hy
					const expectedGy1 =
						j === 0
							? analyticalY[idx] - hy
							: j === ny - 1
								? analyticalY[idx] + hy
								: analyticalY[idx];

					assert.ok(Math.abs(gx1[idx] - expectedGx1) <= 1e-13);
					assert.ok(Math.abs(gy1[idx] - expectedGy1) <= 1e-13);
				}
			}

			// edgeOrder=2: exact to machine precision at ALL points (interior + boundaries)
			const [gx2, gy2] = gradientTypedIterative(values, [nx, ny], [hx, hy], 2);
			assertCloseArray(gx2, analyticalX, 1e-13, 'quadratic analytical gx (edgeOrder=2)');
			assertCloseArray(gy2, analyticalY, 1e-13, 'quadratic analytical gy (edgeOrder=2)');
		});

		it('matches analytical gradient of sin(x)*cos(y) with O(h^2) interior convergence', () => {
			function maxInteriorError(n) {
				const h = Math.PI / (n - 1);
				const values = new Float64Array(n * n);
				for (let i = 0; i < n; i++) {
					const x = i * h;
					for (let j = 0; j < n; j++) {
						const y = j * h;
						values[i * n + j] = Math.sin(x) * Math.cos(y);
					}
				}
				const [gx, gy] = gradientTypedIterative(values, [n, n], h);
				let maxErr = 0;
				for (let i = 1; i < n - 1; i++) {
					const x = i * h;
					for (let j = 1; j < n - 1; j++) {
						const y = j * h;
						const idx = i * n + j;
						const errX = Math.abs(gx[idx] - Math.cos(x) * Math.cos(y));
						const errY = Math.abs(gy[idx] - -Math.sin(x) * Math.sin(y));
						if (errX > maxErr) maxErr = errX;
						if (errY > maxErr) maxErr = errY;
					}
				}
				return maxErr;
			}

			const errCoarse = maxInteriorError(17); // h = pi/16
			const errFine = maxInteriorError(33); // h = pi/32
			const ratio = errCoarse / errFine;

			assert.ok(errFine < 2e-3, `expected fine error < 2e-3, got ${errFine}`);
			// Second-order central difference: halving h reduces truncation error by ~4x
			assert.ok(ratio > 3.9 && ratio < 4.1, `expected O(h^2) ratio ~4, got ${ratio}`);
		});

		it('satisfies linearity identity grad(a*f + b*g) = a*grad(f) + b*grad(g)', () => {
			const shape = [4, 5];
			const total = 20;
			const f = new Float64Array(total);
			const g = new Float64Array(total);
			const combined = new Float64Array(total);
			const alpha = 2.75;
			const beta = -1.4;

			for (let i = 0; i < total; i++) {
				f[i] = Math.sin(0.3 * i) + 0.1 * i * i;
				g[i] = Math.cos(0.2 * i) - 0.5 * i;
				combined[i] = alpha * f[i] + beta * g[i];
			}

			const spacing = [0.4, 0.7];
			const [fx, fy] = gradientTypedIterative(f, shape, spacing);
			const [gx, gy] = gradientTypedIterative(g, shape, spacing);
			const [cx, cy] = gradientTypedIterative(combined, shape, spacing);

			for (let i = 0; i < total; i++) {
				assert.ok(Math.abs(cx[i] - (alpha * fx[i] + beta * gx[i])) <= 1e-12);
				assert.ok(Math.abs(cy[i] - (alpha * fy[i] + beta * gy[i])) <= 1e-12);
			}
		});
	});
});
