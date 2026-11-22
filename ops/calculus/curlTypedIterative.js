/**
 * Computes the partial derivative of a 3D scalar field component along one axis
 * at flat index `idx` using second-order finite differences (central differences
 * on the interior and second-order one-sided differences on boundaries when
 * `len >= 3`, first-order differences when `len === 2`, and `0` when `len <= 1`).
 *
 * @param {Float64Array} arr - Flattened 3D scalar field component.
 * @param {number} idx - Flat index `(i * ny + j) * nz + k`.
 * @param {number} pos - Grid index along the differentiation axis (`0 <= pos < len`).
 * @param {number} len - Number of grid points along the differentiation axis.
 * @param {number} stride - Flat index stride along the differentiation axis.
 * @param {number} invH - Reciprocal grid spacing `1 / h`.
 * @param {number} inv2H - Reciprocal double grid spacing `1 / (2 * h)`.
 * @returns {number} Numerical partial derivative at `idx`.
 */
function partialDerivative(arr, idx, pos, len, stride, invH, inv2H) {
	if (len <= 1) {
		return 0;
	}
	if (len === 2) {
		return pos === 0
			? (arr[idx + stride] - arr[idx]) * invH
			: (arr[idx] - arr[idx - stride]) * invH;
	}
	if (pos === 0) {
		return (-3 * arr[idx] + 4 * arr[idx + stride] - arr[idx + 2 * stride]) * inv2H;
	}
	if (pos === len - 1) {
		return (3 * arr[idx] - 4 * arr[idx - stride] + arr[idx - 2 * stride]) * inv2H;
	}
	return (arr[idx + stride] - arr[idx - stride]) * inv2H;
}

/**
 * Computes the 3D numerical curl of a vector field sampled on a regular 3D rectilinear grid
 * using a straightforward iterative finite-difference implementation over `Float64Array`s.
 *
 * Grid values are stored in row-major (C-order) layout for shape `[nx, ny, nz]`,
 * where grid coordinate `(i, j, k)` maps to flat index `(i * ny + j) * nz + k`.
 *
 * The curl components at each grid point are computed as:
 * - `Cx = dFz/dy - dFy/dz`
 * - `Cy = dFx/dz - dFz/dx`
 * - `Cz = dFy/dx - dFx/dy`
 *
 * Finite-difference scheme along an axis of length `n` and spacing `h`:
 * - `n >= 3`: 2nd-order central difference `(f[m+1] - f[m-1]) / (2h)` in the interior,
 *   2nd-order forward `(-3f[0] + 4f[1] - f[2]) / (2h)` at `m = 0`, and
 *   2nd-order backward `(3f[n-1] - 4f[n-2] + f[n-3]) / (2h)` at `m = n - 1`.
 * - `n === 2`: 1st-order difference `(f[1] - f[0]) / h`.
 * - `n === 1`: derivative along the singleton axis is `0`.
 * - `n === 0`: returns three empty `Float64Array(0)` instances.
 *
 * @param {[Float64Array, Float64Array, Float64Array]} field - Vector field components `[Fx, Fy, Fz]`.
 * @param {[number, number, number]} shape - Grid dimensions `[nx, ny, nz]` (non-negative integers).
 * @param {[number, number, number]} [spacing=[1, 1, 1]] - Positive finite grid spacings `[dx, dy, dz]`.
 * @returns {[Float64Array, Float64Array, Float64Array]} Curl vector field components `[Cx, Cy, Cz]`.
 * @throws {TypeError} If `field`, `shape`, or `spacing` are not arrays, field components are not
 *   `Float64Array` instances, or shape/spacing entries are not numbers.
 * @throws {RangeError} If `field`, `shape`, or `spacing` do not have length 3, dimensions are
 *   negative or non-integer, total size overflows safe integers, spacing values are non-finite or
 *   non-positive, component lengths do not match `nx * ny * nz`, or any input field value is
 *   `NaN` or infinite.
 */
export function curlTypedIterative(field, shape, spacing = [1, 1, 1]) {
	if (!Array.isArray(field)) {
		throw new TypeError('field must be an array of three Float64Array components [Fx, Fy, Fz]');
	}
	if (field.length !== 3) {
		throw new RangeError('field must have length 3 ([Fx, Fy, Fz])');
	}
	const [fx, fy, fz] = field;
	if (!(fx instanceof Float64Array) || !(fy instanceof Float64Array) || !(fz instanceof Float64Array)) {
		throw new TypeError('field components Fx, Fy, and Fz must all be Float64Array instances');
	}

	if (!Array.isArray(shape)) {
		throw new TypeError('shape must be an array of three non-negative integers [nx, ny, nz]');
	}
	if (shape.length !== 3) {
		throw new RangeError('shape must have length 3 ([nx, ny, nz])');
	}
	const [nx, ny, nz] = shape;
	for (let axis = 0; axis < 3; axis++) {
		const dim = shape[axis];
		if (typeof dim !== 'number') {
			throw new TypeError(`shape[${axis}] must be a number`);
		}
		if (!Number.isInteger(dim) || dim < 0) {
			throw new RangeError(`shape[${axis}] must be a non-negative integer`);
		}
	}

	const total = nx * ny * nz;
	if (!Number.isSafeInteger(total)) {
		throw new RangeError('grid size nx * ny * nz exceeds Number.MAX_SAFE_INTEGER');
	}

	if (fx.length !== total || fy.length !== total || fz.length !== total) {
		throw new RangeError(
			`field component lengths (${fx.length}, ${fy.length}, ${fz.length}) must all equal nx * ny * nz (${total})`
		);
	}

	if (!Array.isArray(spacing)) {
		throw new TypeError('spacing must be an array of three positive finite numbers [dx, dy, dz]');
	}
	if (spacing.length !== 3) {
		throw new RangeError('spacing must have length 3 ([dx, dy, dz])');
	}
	const [dx, dy, dz] = spacing;
	for (let axis = 0; axis < 3; axis++) {
		const h = spacing[axis];
		if (typeof h !== 'number') {
			throw new TypeError(`spacing[${axis}] must be a number`);
		}
		if (!Number.isFinite(h) || h <= 0) {
			throw new RangeError(`spacing[${axis}] must be a positive finite number`);
		}
	}

	for (let idx = 0; idx < total; idx++) {
		if (!Number.isFinite(fx[idx]) || !Number.isFinite(fy[idx]) || !Number.isFinite(fz[idx])) {
			throw new RangeError(`field contains non-finite value at flat index ${idx}`);
		}
	}

	const cx = new Float64Array(total);
	const cy = new Float64Array(total);
	const cz = new Float64Array(total);

	if (total === 0) {
		return [cx, cy, cz];
	}

	const strideZ = 1;
	const strideY = nz;
	const strideX = ny * nz;

	const invDx = 1 / dx;
	const invDy = 1 / dy;
	const invDz = 1 / dz;
	const inv2Dx = 0.5 / dx;
	const inv2Dy = 0.5 / dy;
	const inv2Dz = 0.5 / dz;

	for (let i = 0; i < nx; i++) {
		const baseX = i * strideX;
		for (let j = 0; j < ny; j++) {
			const baseXY = baseX + j * strideY;
			for (let k = 0; k < nz; k++) {
				const idx = baseXY + k;

				const dFzDy = partialDerivative(fz, idx, j, ny, strideY, invDy, inv2Dy);
				const dFyDz = partialDerivative(fy, idx, k, nz, strideZ, invDz, inv2Dz);

				const dFxDz = partialDerivative(fx, idx, k, nz, strideZ, invDz, inv2Dz);
				const dFzDx = partialDerivative(fz, idx, i, nx, strideX, invDx, inv2Dx);

				const dFyDx = partialDerivative(fy, idx, i, nx, strideX, invDx, inv2Dx);
				const dFxDy = partialDerivative(fx, idx, j, ny, strideY, invDy, inv2Dy);

				cx[idx] = (dFzDy - dFyDz) + 0;
				cy[idx] = (dFxDz - dFzDx) + 0;
				cz[idx] = (dFyDx - dFxDy) + 0;
			}
		}
	}

	return [cx, cy, cz];
}
