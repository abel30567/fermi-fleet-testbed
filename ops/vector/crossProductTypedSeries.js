/**
 * Computes the 3D vector cross product element-wise over flat packed `Float64Array`
 * inputs using the closed-form Levi-Civita / 3x3 determinant formula.
 *
 * Each input array represents either a single 3D vector of length 3 or a flat packed
 * series of `k` 3D vectors of length `3 * k`:
 * `[x0, y0, z0, x1, y1, z1, ...]`.
 *
 * For each vector pair `(a_j, b_j)` at offset `i = 3 * j`:
 * ```
 * (a × b)_x = a_y * b_z - a_z * b_y
 * (a × b)_y = a_z * b_x - a_x * b_z
 * (a × b)_z = a_x * b_y - a_y * b_x
 * ```
 *
 * @param {Float64Array} a - First vector or packed series of 3D vectors (length `3 * k`).
 * @param {Float64Array} b - Second vector or packed series of 3D vectors (length `3 * k`).
 * @returns {Float64Array} New `Float64Array` of length `a.length` containing the cross products.
 * @throws {TypeError} If either `a` or `b` is not a `Float64Array`.
 * @throws {RangeError} If `a` and `b` have different lengths or lengths not divisible by 3.
 */
export function crossProductTypedSeries(a, b) {
  if (!(a instanceof Float64Array) || !(b instanceof Float64Array)) {
    throw new TypeError('Both inputs must be Float64Array instances');
  }

  const len = a.length;
  if (len !== b.length) {
    throw new RangeError(
      `Input Float64Arrays must have equal length (got ${len} and ${b.length})`
    );
  }

  if (len % 3 !== 0) {
    throw new RangeError(
      `Input Float64Array length must be a multiple of 3 (got ${len})`
    );
  }

  const result = new Float64Array(len);

  for (let i = 0; i < len; i += 3) {
    const ax = a[i];
    const ay = a[i + 1];
    const az = a[i + 2];

    const bx = b[i];
    const by = b[i + 1];
    const bz = b[i + 2];

    result[i] = ay * bz - az * by;
    result[i + 1] = az * bx - ax * bz;
    result[i + 2] = ax * by - ay * bx;
  }

  return result;
}
