/**
 * Numerically robust matrix transpose over a row-major `Float64Array`.
 *
 * Maps an `rows × cols` matrix `A` stored in row-major order into a newly
 * allocated `cols × rows` row-major `Float64Array` `B` such that
 * `B[j * rows + i] = A[i * cols + j]`.
 *
 * Numerical robustness guarantees:
 * - **Zero rounding error (0 ULP error bound)**: Transfers raw 64-bit IEEE-754
 *   bit patterns through `BigUint64Array` views (respecting `data.byteOffset`),
 *   preserving `-0`, subnormals (`Number.MIN_VALUE`), extreme magnitudes
 *   (`±Number.MAX_VALUE`), `±Infinity`, and `NaN` bit payloads exactly.
 * - **Overflow-safe shape validation**: Uses `BigInt` arithmetic to verify
 *   `rows * cols === data.length` without IEEE-754 integer overflow.
 * - **Cache-blocked traversal**: Uses square tile blocking (`blockSize`,
 *   default `32`) to maintain memory locality on large matrices while
 *   producing an immutable, non-aliased output buffer.
 * - **Optional finiteness enforcement**: Pass `{ finiteOnly: true }` to reject
 *   `NaN` or `±Infinity` entries before transposition.
 *
 * @param {Float64Array} data - Input matrix elements in row-major order.
 * @param {number} rows - Number of rows (non-negative safe integer).
 * @param {number} cols - Number of columns (non-negative safe integer).
 * @param {object} [options] - Optional configuration.
 * @param {boolean} [options.finiteOnly=false] - Throw `RangeError` if any entry is non-finite.
 * @param {number} [options.blockSize=32] - Cache-blocking tile dimension (positive safe integer).
 * @returns {Float64Array} Newly allocated `cols × rows` transposed matrix in row-major order.
 * @throws {TypeError} If `data` is not a `Float64Array`, dimensions are not safe integers, or options have invalid types.
 * @throws {RangeError} If dimensions are negative, `rows * cols !== data.length`, `blockSize < 1`, or `finiteOnly` rejects an entry.
 */
export function transposeTypedStable(data, rows, cols, options = {}) {
	if (!(data instanceof Float64Array)) {
		throw new TypeError('Expected data to be a Float64Array')
	}

	if (typeof rows !== 'number' || !Number.isSafeInteger(rows)) {
		throw new TypeError('Expected rows to be a safe integer')
	}
	if (typeof cols !== 'number' || !Number.isSafeInteger(cols)) {
		throw new TypeError('Expected cols to be a safe integer')
	}
	if (rows < 0 || cols < 0) {
		throw new RangeError('Expected rows and cols to be non-negative')
	}

	if (BigInt(rows) * BigInt(cols) !== BigInt(data.length)) {
		throw new RangeError(
			`Dimension mismatch: expected Float64Array of length ${rows} * ${cols}, got ${data.length}`
		)
	}

	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('Expected options to be a plain object')
	}

	const { finiteOnly = false, blockSize = 32 } = options

	if (typeof finiteOnly !== 'boolean') {
		throw new TypeError('Expected options.finiteOnly to be a boolean')
	}
	if (typeof blockSize !== 'number' || !Number.isSafeInteger(blockSize)) {
		throw new TypeError('Expected options.blockSize to be a safe integer')
	}
	if (blockSize < 1) {
		throw new RangeError('Expected options.blockSize to be at least 1')
	}

	const n = data.length
	if (finiteOnly) {
		for (let idx = 0; idx < n; idx++) {
			if (!Number.isFinite(data[idx])) {
				const r = Math.floor(idx / cols)
				const c = idx % cols
				throw new RangeError(`Non-finite value at (${r}, ${c}): ${data[idx]}`)
			}
		}
	}

	const out = new Float64Array(n)
	if (n === 0) {
		return out
	}

	// Copy exact 64-bit IEEE-754 representations (preserving -0, subnormals, and NaN payloads).
	const srcBits = new BigUint64Array(data.buffer, data.byteOffset, n)
	const dstBits = new BigUint64Array(out.buffer, out.byteOffset, n)

	if (rows === 1 || cols === 1) {
		dstBits.set(srcBits)
		return out
	}

	// Cache-blocked transpose: out[j * rows + i] = data[i * cols + j]
	for (let rowBlock = 0; rowBlock < rows; rowBlock += blockSize) {
		const rowEnd = rowBlock + blockSize < rows ? rowBlock + blockSize : rows
		for (let colBlock = 0; colBlock < cols; colBlock += blockSize) {
			const colEnd = colBlock + blockSize < cols ? colBlock + blockSize : cols
			for (let i = rowBlock; i < rowEnd; i++) {
				const srcRowOffset = i * cols
				for (let j = colBlock; j < colEnd; j++) {
					dstBits[j * rows + i] = srcBits[srcRowOffset + j]
				}
			}
		}
	}

	return out
}
