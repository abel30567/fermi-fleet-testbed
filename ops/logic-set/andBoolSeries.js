/**
 * Indicator (characteristic) function for a plain boolean value.
 * Maps `false -> 0` and `true -> 1` in the Boolean ring ({0, 1}, +, *).
 *
 * @param {boolean} value - Plain boolean value.
 * @returns {0 | 1} Indicator value in {0, 1}.
 */
function boolIndicator(value) {
	return value ? 1 : 0;
}

/**
 * Indicator (characteristic) function for membership in a Set.
 * Maps `x ∈ set -> 1` and `x ∉ set -> 0`.
 *
 * @template T
 * @param {Set<T>} set - Set to test membership against.
 * @param {T} element - Candidate element.
 * @returns {0 | 1} Indicator value in {0, 1}.
 */
function setIndicator(set, element) {
	return set.has(element) ? 1 : 0;
}

/**
 * Computes logical conjunction (AND) over 2 or more plain booleans, or
 * set intersection over 2 or more JS `Set` instances, using the closed-form
 * Boolean-ring / characteristic-function indicator product identity:
 *
 * - For booleans `x_1, ..., x_n`:
 *   `I(x_1 ∧ ... ∧ x_n) = ∏_{i=1}^{n} I(x_i)`, returning `true` iff the product equals `1`.
 * - For sets `S_1, ..., S_n`:
 *   `1_{⋂ S_i}(x) = ∏_{i=1}^{n} 1_{S_i}(x)`, iterating over the smallest input set
 *   for optimal time complexity `O(min_i |S_i| · n)` without mutating any input set.
 *
 * @param {boolean | Set<*>} a - First operand (plain boolean or Set).
 * @param {boolean | Set<*>} b - Second operand (must match type of `a`).
 * @param {...(boolean | Set<*>)} rest - Additional operands (must match type of `a`).
 * @returns {boolean | Set<*>} Conjunction boolean (when inputs are booleans) or a new
 *   intersection `Set` (when inputs are `Set` instances).
 * @throws {TypeError} If fewer than 2 arguments are provided, if any argument is neither
 *   a plain `boolean` nor a `Set` instance, or if `boolean` and `Set` arguments are mixed.
 */
export function andBoolSeries(a, b, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError(
			`andBoolSeries requires at least 2 arguments, received ${arguments.length}`
		);
	}

	const operands = [a, b, ...rest];
	const firstIsBool = typeof operands[0] === 'boolean';
	const firstIsSet = operands[0] instanceof Set;

	if (!firstIsBool && !firstIsSet) {
		throw new TypeError(
			`andBoolSeries expects plain boolean or Set arguments; argument 0 had type ${typeof operands[0]}`
		);
	}

	for (let i = 1; i < operands.length; i++) {
		const item = operands[i];
		if (firstIsBool) {
			if (typeof item !== 'boolean') {
				const detail = item instanceof Set ? 'Set (cannot mix boolean and Set)' : typeof item;
				throw new TypeError(
					`andBoolSeries expects all arguments to be plain booleans; argument ${i} was ${detail}`
				);
			}
		} else if (!(item instanceof Set)) {
			const detail =
				typeof item === 'boolean' ? 'boolean (cannot mix Set and boolean)' : typeof item;
			throw new TypeError(
				`andBoolSeries expects all arguments to be Set instances; argument ${i} was ${detail}`
			);
		}
	}

	if (firstIsBool) {
		let indicatorProduct = 1;
		for (let i = 0; i < operands.length; i++) {
			indicatorProduct *= boolIndicator(operands[i]);
		}
		return indicatorProduct === 1;
	}

	// Find the smallest set to minimize candidate membership checks.
	let smallestIndex = 0;
	let smallestSize = operands[0].size;
	for (let i = 1; i < operands.length; i++) {
		if (operands[i].size < smallestSize) {
			smallestSize = operands[i].size;
			smallestIndex = i;
		}
	}

	const result = new Set();
	if (smallestSize === 0) {
		return result;
	}

	const smallestSet = operands[smallestIndex];
	for (const element of smallestSet) {
		let indicatorProduct = 1;
		for (let i = 0; i < operands.length; i++) {
			if (i === smallestIndex) continue;
			indicatorProduct *= setIndicator(operands[i], element);
			if (indicatorProduct === 0) break;
		}
		if (indicatorProduct === 1) {
			result.add(element);
		}
	}

	return result;
}
