/**
 * Computes the logical disjunction (OR) of plain booleans or the set union of
 * JavaScript `Set` objects using the complementary-product / characteristic-function
 * identity:
 *
 *   chi(x_1 OR ... OR x_n) = 1 - prod_{i=1}^{n} (1 - chi(x_i))
 *
 * For plain booleans, `chi(b) = b ? 1 : 0` and the result is a plain boolean.
 * For `Set` objects, the same characteristic identity is evaluated per element
 * `e` with `chi_S(e) = S.has(e) ? 1 : 0`, returning a newly allocated `Set`
 * without mutating any input set.
 *
 * Requires at least 2 arguments, all of the same supported domain (either all
 * plain booleans or all `Set` instances).
 *
 * @overload
 * @param {boolean} a - First boolean operand.
 * @param {boolean} b - Second boolean operand.
 * @param {...boolean} rest - Additional boolean operands.
 * @returns {boolean} Logical disjunction of all boolean operands.
 *
 * @overload
 * @param {Set<*>} a - First Set operand.
 * @param {Set<*>} b - Second Set operand.
 * @param {...Set<*>} rest - Additional Set operands.
 * @returns {Set<*>} New Set containing the union of all input Sets.
 *
 * @throws {TypeError} If fewer than 2 arguments are provided, if any argument
 *   is neither a plain boolean nor a `Set`, or if booleans and `Set`s are mixed.
 */
export function orBoolSeries(...args) {
	if (args.length < 2) {
		throw new TypeError(
			`orBoolSeries requires at least 2 arguments, got ${args.length}`,
		);
	}

	const first = args[0];

	if (typeof first === "boolean") {
		for (let i = 1; i < args.length; i++) {
			if (typeof args[i] !== "boolean") {
				throw new TypeError(
					`orBoolSeries expects all arguments to be plain booleans when the first argument is boolean; got ${describeValue(args[i])} at index ${i}`,
				);
			}
		}

		// Characteristic-function / De Morgan complementary-product identity:
		// chi(OR) = 1 - prod_i (1 - chi_i), exact in {0, 1}.
		let complementProduct = 1;
		for (let i = 0; i < args.length; i++) {
			const chi = args[i] ? 1 : 0;
			complementProduct *= 1 - chi;
		}
		return 1 - complementProduct === 1;
	}

	if (first instanceof Set) {
		for (let i = 1; i < args.length; i++) {
			if (!(args[i] instanceof Set)) {
				throw new TypeError(
					`orBoolSeries expects all arguments to be Set instances when the first argument is a Set; got ${describeValue(args[i])} at index ${i}`,
				);
			}
		}

		// Evaluate chi_{U_i S_i}(e) = 1 - prod_i (1 - chi_{S_i}(e)) for every
		// candidate element across the input sets without mutating inputs.
		const union = new Set();
		for (let i = 0; i < args.length; i++) {
			for (const element of args[i]) {
				if (union.has(element)) {
					continue;
				}
				let complementProduct = 1;
				for (let j = 0; j < args.length; j++) {
					const chi = args[j].has(element) ? 1 : 0;
					complementProduct *= 1 - chi;
					if (complementProduct === 0) {
						break;
					}
				}
				if (1 - complementProduct === 1) {
					union.add(element);
				}
			}
		}
		return union;
	}

	throw new TypeError(
		`orBoolSeries expects plain booleans or Set instances; got ${describeValue(first)} at index 0`,
	);
}

/**
 * Produces a concise type description for error messages.
 *
 * @param {*} value
 * @returns {string}
 */
function describeValue(value) {
	if (value === null) return "null";
	if (value instanceof Set) return "Set";
	if (Array.isArray(value)) return "Array";
	if (typeof value === "object") {
		const ctor = value.constructor?.name;
		return ctor ? `object (${ctor})` : "object";
	}
	return typeof value;
}
