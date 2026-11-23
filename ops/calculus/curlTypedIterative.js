/**
 * Computes a one-dimensional finite-difference partial derivative at a grid point.
 *
 * Uses second-order central differences in the interior, second-order one-sided
 * differences on boundaries when axis length >= 3, first-order differences when
 * axis length === 2, and 0 when axis length === 1.
 *
 * @param {Float64Array} arr - Flattened 3D scalar field in row-major order.
 * @param {number} idx - Linear index of the current grid point.
 * @param {number} coord - Coordinate along the differentiation axis.
 * @param {number} n - Number of grid points along the axis.
 * @param {number} stride - Linear index stride along the axis.
 * @param {number} h - Grid spacing along the axis.
 * @returns {number} Approximated partial derivative at `idx`.
 */
function partialDiff(arr, idx, coord, n, stride, h) {
	if (n === 1) {
		return 0
	}
	if (n === 2) {
		return coord === 0
			? (arr[idx + stride] - arr[idx]) / h
			: (arr[idx] - arr[idx - stride]) / h
	}
	if (coord === 0) {
		return (-3 * arr[idx] + 4 * arr[idx + stride] - arr[idx + 2 * stride]) / (2 * h)
	}
	if (coord === n - 1) {
		return (3 * arr[idx] - 4 * arr[idx - stride] + arr[idx - 2 * stride]) / (2 * h)
	}
	return (arr[idx + stride] - arr[idx - stride]) / (2 * h)
}

/**
 * Validates that a value is a 3-element array or typed array.
 *
 * @param {unknown} value
 * @param {string} name
 */
function assertTriple(value, name) {
	const isArrayLike = Array.isArray(value) || (ArrayBuffer.isView(value) && !(value instanceof DataView))
	if (!isArrayLike) {
		throw new TypeError(`${name} must be an array or typed array of length 3`)
	}
	if (value.length !== 3) {
		throw new RangeError(`${name} must have exactly 3 elements`)
	}
}

/**
 * Computes the 3D numerical curl (∇ × F) of a vector field F = (fx, fy, fz)
 * element-wise over Float64Array inputs on a regular 3D Cartesian grid,
 * using a straightforward iterative finite-difference implementation.
 *
 * The grid is flattened in row-major (C) order: `idx = (i * ny + j) * nz + k`,
 * where `i` indexes x (`0 <= i < nx`), `j` indexes y (`0 <= j < ny`), and
 * `k` indexes z (`0 <= k < nz`).
 *
 * Curl definition:
 * - `cx = ∂fz/∂y - ∂fy/∂z`
 * - `cy = ∂fx/∂z - ∂fz/∂x`
 * - `cz = ∂fy/∂x - ∂fx/∂y`
 *
 * @param {Float64Array} fx - x-component field values, length `nx * ny * nz`.
 * @param {Float64Array} fy - y-component field values, length `nx * ny * nz`.
 * @param {Float64Array} fz - z-component field values, length `nx * ny * nz`.
 * @param {[number, number, number] | Float64Array | Int32Array | Uint32Array} dims - Grid dimensions `[nx, ny, nz]`, each a positive integer.
 * @param {[number, number, number] | Float64Array} [spacing=[1, 1, 1]] - Grid spacings `[dx, dy, dz]`, each a finite positive number.
 * @returns {{ cx: Float64Array, cy: Float64Array, cz: Float64Array }} Element-wise curl components on the same grid.
 * @throws {TypeError} If `fx`, `fy`, `fz` are not `Float64Array` instances or `dims`/`spacing` are not array-like.
 * @throws {RangeError} If dimensions or spacings are invalid, input lengths mismatch, or any field value is non-finite.
 */
export function curlTypedIterative(fx, fy, fz, dims, spacing = [1, 1, 1]) {
	if (!(fx instanceof Float64Array)) {
		throw new TypeError('fx must be a Float64Array')
	}
	if (!(fy instanceof Float64Array)) {
		throw new TypeError('fy must be a Float64Array')
	}
	if (!(fz instanceof Float64Array)) {
		throw new TypeError('fz must be a Float64Array')
	}

	assertTriple(dims, 'dims')
	assertTriple(spacing, 'spacing')

	const nx = dims[0]
	const ny = dims[1]
	const nz = dims[2]
	if (!Number.isInteger(nx) || nx < 1 || !Number.isInteger(ny) || ny < 1 || !Number.isInteger(nz) || nz < 1) {
		throw new RangeError('dims elements [nx, ny, nz] must be positive integers')
	}

	const total = nx * ny * nz
	if (!Number.isSafeInteger(total)) {
		throw new RangeError('grid size nx * ny * nz exceeds Number.MAX_SAFE_INTEGER')
	}

	if (fx.length !== total || fy.length !== total || fz.length !== total) {
		throw new RangeError(`fx, fy, and fz must each have length ${total} (got ${fx.length}, ${fy.length}, ${fz.length})`)
	}

	const dx = spacing[0]
	const dy = spacing[1]
	const dz = spacing[2]
	if (
		typeof dx !== 'number' || !Number.isFinite(dx) || dx <= 0 ||
		typeof dy !== 'number' || !Number.isFinite(dy) || dy <= 0 ||
		typeof dz !== 'number' || !Number.isFinite(dz) || dz <= 0
	) {
		throw new RangeError('spacing elements [dx, dy, dz] must be finite positive numbers')
	}

	for (let idx = 0; idx < total; idx++) {
		if (!Number.isFinite(fx[idx]) || !Number.isFinite(fy[idx]) || !Number.isFinite(fz[idx])) {
			throw new RangeError(`input arrays must contain only finite numbers (non-finite value at index ${idx})`)
		}
	}

	const cx = new Float64Array(total)
	const cy = new Float64Array(total)
	const cz = new Float64Array(total)

	const strideX = ny * nz
	const strideY = nz
	const strideZ = 1

	let idx = 0
	for (let i = 0; i < nx; i++) {
		for (let j = 0; j < ny; j++) {
			for (let k = 0; k < nz; k++) {
				const dfzDy = partialDiff(fz, idx, j, ny, strideY, dy)
				const dfyDz = partialDiff(fy, idx, k, nz, strideZ, dz)
				const dfxDz = partialDiff(fx, idx, k, nz, strideZ, dz)
				const dfzDx = partialDiff(fz, idx, i, nx, strideX, dx)
				const dfyDx = partialDiff(fy, idx, i, nx, strideX, dx)
				const dfxDy = partialDiff(fx, idx, j, ny, strideY, dy)

				cx[idx] = dfzDy - dfyDz
				cy[idx] = dfxDz - dfzDx
				cz[idx] = dfyDx - dfxDy
				idx++
			}
		}
	}

	return { cx, cy, cz }
}
