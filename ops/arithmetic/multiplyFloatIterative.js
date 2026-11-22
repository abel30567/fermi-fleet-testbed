/**
 * Multiplies two or more IEEE-754 float64 numbers using a straightforward
 * left-to-right iterative product loop.
 *
 * All arguments are validated upfront to ensure they are primitive JavaScript
 * `number` values (including special IEEE-754 values such as `-0`, `Infinity`,
 * `-Infinity`, and `NaN`). Standard IEEE-754 float64 multiplication semantics
 * apply at each step, including signed-zero preservation, overflow to
 * `Infinity`/`-Infinity`, underflow to `0`/`-0`, and `NaN` propagation.
 *
 * @param {...number} values - Two or more IEEE-754 float64 numbers to multiply.
 * @returns {number} The iterative IEEE-754 float64 product of all input values.
 * @throws {TypeError} If fewer than two arguments are provided, or if any
 *   argument is not a primitive `number`.
 *
 * @example
 * multiplyFloatIterative(2, 3); // 6
 * multiplyFloatIterative(1.5, -4, 2); // -12
 */
export function multiplyFloatIterative(...values) {
  if (values.length < 2) {
    throw new TypeError(
      `multiplyFloatIterative requires at least 2 arguments, received ${values.length}`,
    );
  }

  for (let i = 0; i < values.length; i += 1) {
    if (typeof values[i] !== 'number') {
      throw new TypeError(
        `multiplyFloatIterative expected a number at argument index ${i}, received ${typeof values[i]}`,
      );
    }
  }

  let product = values[0];
  for (let i = 1; i < values.length; i += 1) {
    product *= values[i];
  }

  return product;
}
