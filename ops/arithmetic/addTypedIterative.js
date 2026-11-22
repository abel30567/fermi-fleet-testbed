/**
 * Performs element-wise arithmetic addition over two Float64Array inputs
 * using a straightforward iterative loop.
 *
 * @param {Float64Array} a - First Float64Array operand.
 * @param {Float64Array} b - Second Float64Array operand (must have the same length as `a`).
 * @returns {Float64Array} A new Float64Array where each element at index `i` is `a[i] + b[i]`.
 * @throws {TypeError} If `a` or `b` is not a Float64Array.
 * @throws {RangeError} If `a` and `b` have different lengths.
 */
export function addTypedIterative(a, b) {
  if (!(a instanceof Float64Array)) {
    throw new TypeError('First argument must be a Float64Array')
  }
  if (!(b instanceof Float64Array)) {
    throw new TypeError('Second argument must be a Float64Array')
  }
  if (a.length !== b.length) {
    throw new RangeError(
      `Float64Array inputs must have equal length (received ${a.length} and ${b.length})`
    )
  }

  const length = a.length
  const result = new Float64Array(length)
  for (let i = 0; i < length; i += 1) {
    result[i] = a[i] + b[i]
  }
  return result
}
