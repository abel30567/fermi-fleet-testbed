/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} dual - Candidate dual number to validate.
 * @param {number} index - Zero-based operand index for error reporting.
 * @throws {TypeError} If `dual` is not a non-null, non-array object or if `v` or `d` is not a number.
 * @throws {RangeError} If `v` or `d` is `NaN`, `Infinity`, or `-Infinity`.
 */
function assertValidDual(dual, index) {
	if (typeof dual !== 'object' || dual === null || Array.isArray(dual)) {
		throw new TypeError(`Operand at index ${index} must be a dual number object { v, d }`);
	}
	if (typeof dual.v !== 'number' || typeof dual.d !== 'number') {
		throw new TypeError(`Operand at index ${index} must have numeric properties 'v' and 'd'`);
	}
	if (!Number.isFinite(dual.v) || !Number.isFinite(dual.d)) {
		throw new RangeError(`Operand at index ${index} must have finite 'v' and 'd' values`);
	}
}

/**
 * Adds two or more dual numbers `{ v, d }` carrying a forward-mode derivative alongside the value,
 * using a straightforward iterative implementation.
 *
 * Dual number addition is defined component-wise over `a = v + d·ε` (with `ε² = 0`):
 * `(v₁ + d₁·ε) + (v₂ + d₂·ε) = (v₁ + v₂) + (d₁ + d₂)·ε`.
 *
 * @param {{ v: number, d: number }} a - First dual number operand (`v`: value, `d`: derivative).
 * @param {{ v: number, d: number }} b - Second dual number operand (`v`: value, `d`: derivative).
 * @param {...{ v: number, d: number }} rest - Optional additional dual number operands to sum iteratively.
 * @returns {{ v: number, d: number }} New dual number object representing the component-wise sum.
 * @throws {TypeError} If fewer than two operands are passed, or any operand is not a valid `{ v, d }` object with numeric components.
 * @throws {RangeError} If any operand component is non-finite (`NaN`, `±Infinity`), or if accumulation overflows to a non-finite value.
 */
export function addDualIterative(a, b, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError('addDualIterative requires at least two dual number operands');
	}

	const operands = [a, b, ...rest];
	let v = 0;
	let d = 0;

	for (let i = 0; i < operands.length; i += 1) {
		const dual = operands[i];
		assertValidDual(dual, i);
		v += dual.v;
		d += dual.d;
	}

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('Dual number addition overflowed to a non-finite value');
	}

	return { v, d };
}
