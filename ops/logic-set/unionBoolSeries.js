/**
 * Computes the closed-form / series-identity union over plain booleans or JS `Set` objects.
 *
 * - For plain booleans, maps each input to its indicator $x_i \in \{0, 1\}$ and evaluates
 *   the inclusion-exclusion / De Morgan closed-form identity:
 *   $$u_0 = 0, \quad u_k = u_{k-1} + x_k - u_{k-1} x_k = 1 - \prod_{i=1}^{k} (1 - x_i)$$
 *   returning `u_n === 1`.
 * - For `Set` objects, evaluates the disjoint-union series identity:
 *   $$U_0 = \emptyset, \quad U_k = U_{k-1} \sqcup (S_k \setminus U_{k-1})$$
 *   where each element's membership satisfies the closed-form indicator identity
 *   $\mathbf{1}_{U_k}(e) = \mathbf{1}_{U_{k-1}}(e) + \mathbf{1}_{S_k}(e) - \mathbf{1}_{U_{k-1}}(e)\mathbf{1}_{S_k}(e)$
 *   and is inserted into the fresh result `Set` when its disjoint increment
 *   $\mathbf{1}_{S_k}(e)(1 - \mathbf{1}_{U_{k-1}}(e)) = 1$.
 *
 * @template T
 * @param {...(boolean | Set<T>)} inputs - One or more plain booleans, or one or more `Set` instances (all inputs must share the same kind).
 * @returns {boolean | Set<T>} The boolean disjunction for boolean inputs, or a new `Set` containing the union for `Set` inputs.
 * @throws {TypeError} If no arguments are provided, any argument is neither a plain boolean nor a `Set`, or boolean and `Set` arguments are mixed.
 */
export function unionBoolSeries(...inputs) {
	if (inputs.length === 0) {
		throw new TypeError('unionBoolSeries requires at least one boolean or Set argument')
	}

	const first = inputs[0]
	const isBoolMode = typeof first === 'boolean'
	const isSetMode = first instanceof Set

	if (!isBoolMode && !isSetMode) {
		throw new TypeError('unionBoolSeries arguments must be plain booleans or Set instances')
	}

	if (isBoolMode) {
		let acc = 0
		for (let i = 0; i < inputs.length; i++) {
			const val = inputs[i]
			if (typeof val !== 'boolean') {
				throw new TypeError(`Expected plain boolean at argument index ${i}`)
			}
			const x = val ? 1 : 0
			// Closed-form inclusion-exclusion step: u + x - u*x === 1 - (1 - u)*(1 - x)
			acc = acc + x - acc * x
		}
		return acc === 1
	}

	const result = new Set()
	for (let i = 0; i < inputs.length; i++) {
		const current = inputs[i]
		if (!(current instanceof Set)) {
			throw new TypeError(`Expected Set instance at argument index ${i}`)
		}
		// Disjoint-union series term: S_i \ U_{i-1}
		for (const element of current) {
			const accHas = result.has(element) ? 1 : 0
			const delta = 1 * (1 - accHas)
			if (delta === 1) {
				result.add(element)
			}
		}
	}
	return result
}
