/**
 * Computes the 3D vector cross product over element-wise packed triples in
 * `Float64Array` inputs using a straightforward iterative implementation.
 *
 * Supports both a single 3D vector (length 3), packed arrays of `k` 3D vectors
 * (length `3 * k` laid out as `[x0, y0, z0, x1, y1, z1, ...]`), and empty
 * `Float64Array` inputs (length 0).
 *
 * Algorithm:
 * Iterates across `a` and `b` with stride 3 (`i = 0, 3, 6, ..., n - 3`) and
 * evaluates for each triple `(ax, ay, az)` and `(bx, by, bz)`:
 *   - `out[i]     = ay * bz - az * by`
 *   - `out[i + 1] = az * bx - ax * bz`
 *   - `out[i + 2] = ax * by - ay * bx`
 * Normalizes `-0` results to `+0`.
 *
 * @param {Float64Array} a - First input vector (or packed 3D triples) of finite numbers.
 * @param {Float64Array} b - Second input vector (or packed 3D triples) of finite numbers.
 * @param {Float64Array} [out] - Optional destination `Float64Array` of the same length.
 * @returns {Float64Array} `out` if provided, otherwise a newly allocated `Float64Array`
 *   containing the cross product triples.
 * @throws {TypeError} If `a`, `b`, or provided `out` is not a `Float64Array`.
 * @throws {RangeError} If lengths mismatch, length is not a multiple of 3, or any
 *   element of `a` or `b` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
export function crossProductTypedIterative(a, b, out) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('First argument "a" must be a Float64Array');
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Second argument "b" must be a Float64Array');
	}
	if (out !== undefined && !(out instanceof Float64Array)) {
		throw new TypeError('Optional third argument "out" must be a Float64Array');
	}

	const n = a.length;
	if (n !== b.length) {
		throw new RangeError(
			`Input Float64Array lengths must match (got ${n} and ${b.length})`
		);
	}
	if (n % 3 !== 0) {
		throw new RangeError(
			`Input Float64Array length must be a multiple of 3 (got ${n})`
		);
	}
	if (out !== undefined && out.length !== n) {
		throw new RangeError(
			`Output Float64Array length must match input length ${n} (got ${out.length})`
		);
	}

	for (let i = 0; i < n; i++) {
		if (!Number.isFinite(a[i])) {
			throw new RangeError(
				`Non-finite value in first argument "a" at index ${i}: ${a[i]}`
			);
		}
		if (!Number.isFinite(b[i])) {
			throw new RangeError(
				`Non-finite value in second argument "b" at index ${i}: ${b[i]}`
			);
		}
	}

	const result = out === undefined ? new Float64Array(n) : out;

	const overlapsA =
		out !== undefined &&
		result !== a &&
		result.buffer === a.buffer &&
		result.byteOffset < a.byteOffset + a.byteLength &&
		a.byteOffset < result.byteOffset + result.byteLength;
	const overlapsB =
		out !== undefined &&
		result !== b &&
		result.buffer === b.buffer &&
		result.byteOffset < b.byteOffset + b.byteLength &&
		b.byteOffset < result.byteOffset + result.byteLength;

	const target = overlapsA || overlapsB ? new Float64Array(n) : result;

	for (let i = 0; i < n; i += 3) {
		const ax = a[i];
		const ay = a[i + 1];
		const az = a[i + 2];

		const bx = b[i];
		const by = b[i + 1];
		const bz = b[i + 2];

		target[i] = ay * bz - az * by + 0;
		target[i + 1] = az * bx - ax * bz + 0;
		target[i + 2] = ax * by - ay * bx + 0;
	}

	if (target !== result) {
		for (let i = 0; i < n; i++) {
			result[i] = target[i];
		}
	}

	return result;
}
