/**
 * Computes the cumulative (running) calculus integral over a sequence of complex numbers
 * `{ re, im }` lazily using a streaming generator.
 *
 * Consumes `values` (and optional `options.nodes`) one element at a time in O(1) memory,
 * using Neumaier compensated summation for numerical stability on long streams.
 *
 * Each yielded value is a fresh `{ re, im }` object representing the cumulative integral
 * up to the corresponding input sample:
 * - For an empty iterable, yields nothing.
 * - For the first sample, yields `initial` (default `{ re: 0, im: 0 }`).
 * - For each subsequent sample `k >= 1`, adds the complex increment `f_k * dz_k`, where:
 *   - `method === 'trapezoidal'` (default): `f_k = (y_{k-1} + y_k) / 2`
 *   - `method === 'left'`: `f_k = y_{k-1}`
 *   - `method === 'right'`: `f_k = y_k`
 *   - `dz_k` is the uniform `step` (real or complex) or `nodes[k] - nodes[k-1]` when `options.nodes` is provided.
 *
 * @typedef {{ re: number, im: number }} Complex
 *
 * @typedef {Object} IntegralComplexLazyOptions
 * @property {number | Complex} [step=1] Uniform real or complex integration step (mutually exclusive with `nodes`).
 * @property {Iterable<number | Complex>} [nodes] Lazy iterable of real or complex sample positions for non-uniform grids or complex contour integrals (mutually exclusive with `step`).
 * @property {Complex} [initial={ re: 0, im: 0 }] Initial constant of integration.
 * @property {'trapezoidal' | 'left' | 'right'} [method='trapezoidal'] Quadrature rule for each step.
 *
 * @param {Iterable<Complex>} values Iterable of complex samples `{ re, im }`.
 * @param {number | Complex | IntegralComplexLazyOptions} [stepOrOptions=1] Uniform real/complex step or options object.
 * @returns {Generator<Complex, void, undefined>} Lazy generator yielding cumulative complex integral values `{ re, im }`.
 */
export function integralComplexLazy(values, stepOrOptions = undefined) {
	assertNonStringIterable(values, 'values')

	const config = parseOptions(stepOrOptions)
	const valuesIter = openIterator(values, 'values')

	if (config.nodes !== null) {
		let nodesIter
		try {
			nodesIter = openIterator(config.nodes, 'options.nodes')
		} catch (err) {
			closeIterator(valuesIter, false)
			throw err
		}
		return integrateWithNodes(
			valuesIter,
			nodesIter,
			config.initRe,
			config.initIm,
			config.method
		)
	}

	return integrateUniform(
		valuesIter,
		config.stepRe,
		config.stepIm,
		config.initRe,
		config.initIm,
		config.method
	)
}

const VALID_METHODS = new Set(['trapezoidal', 'left', 'right'])
const OPTION_KEYS = new Set(['step', 'nodes', 'initial', 'method'])

function normalizeZero(value) {
	return value === 0 ? 0 : value
}

function assertNonStringIterable(input, name) {
	if (
		input == null ||
		typeof input === 'string' ||
		typeof input[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(`${name} must be a non-string iterable`)
	}
}

function openIterator(iterable, name) {
	const iter = iterable[Symbol.iterator]()
	if (iter == null || typeof iter !== 'object' || typeof iter.next !== 'function') {
		throw new TypeError(
			`${name}[Symbol.iterator]() must return an iterator object with a next() method`
		)
	}
	return iter
}

function closeIterator(iter, done) {
	if (!done && iter != null && typeof iter.return === 'function') {
		iter.return()
	}
}

function validateComplex(value, label) {
	if (value == null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be a complex object { re, im }`)
	}
	const { re, im } = value
	if (typeof re !== 'number') {
		throw new TypeError(`${label}.re must be a number`)
	}
	if (typeof im !== 'number') {
		throw new TypeError(`${label}.im must be a number`)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${label} components must be finite numbers`)
	}
	return { re, im }
}

function validateRealOrComplex(value, label) {
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new RangeError(`${label} must be a finite number`)
		}
		return { re: value, im: 0 }
	}
	return validateComplex(value, label)
}

function parseOptions(stepOrOptions) {
	if (stepOrOptions === undefined) {
		return {
			stepRe: 1,
			stepIm: 0,
			nodes: null,
			initRe: 0,
			initIm: 0,
			method: 'trapezoidal'
		}
	}

	if (typeof stepOrOptions === 'number') {
		if (!Number.isFinite(stepOrOptions)) {
			throw new RangeError('step must be a finite number')
		}
		return {
			stepRe: stepOrOptions,
			stepIm: 0,
			nodes: null,
			initRe: 0,
			initIm: 0,
			method: 'trapezoidal'
		}
	}

	if (
		stepOrOptions == null ||
		typeof stepOrOptions !== 'object' ||
		Array.isArray(stepOrOptions)
	) {
		throw new TypeError('stepOrOptions must be a finite number, complex { re, im }, or options object')
	}

	const hasComplexKeys = 're' in stepOrOptions || 'im' in stepOrOptions
	const hasOptionKeys = Object.keys(stepOrOptions).some((key) => OPTION_KEYS.has(key))

	if (hasComplexKeys && hasOptionKeys) {
		throw new TypeError(
			'Cannot mix complex step properties (re, im) with option properties (step, nodes, initial, method)'
		)
	}

	if (hasComplexKeys) {
		const step = validateComplex(stepOrOptions, 'step')
		return {
			stepRe: step.re,
			stepIm: step.im,
			nodes: null,
			initRe: 0,
			initIm: 0,
			method: 'trapezoidal'
		}
	}

	const { step, nodes, initial, method = 'trapezoidal' } = stepOrOptions

	if (typeof method !== 'string') {
		throw new TypeError('options.method must be a string')
	}
	if (!VALID_METHODS.has(method)) {
		throw new RangeError(
			`options.method must be one of "trapezoidal", "left", or "right" (received "${method}")`
		)
	}

	if (step !== undefined && nodes !== undefined) {
		throw new TypeError('options.step and options.nodes are mutually exclusive')
	}

	let initRe = 0
	let initIm = 0
	if (initial !== undefined) {
		const parsedInitial = validateComplex(initial, 'options.initial')
		initRe = parsedInitial.re
		initIm = parsedInitial.im
	}

	if (nodes !== undefined) {
		assertNonStringIterable(nodes, 'options.nodes')
		return {
			stepRe: 0,
			stepIm: 0,
			nodes,
			initRe,
			initIm,
			method
		}
	}

	let stepRe = 1
	let stepIm = 0
	if (step !== undefined) {
		const parsedStep = validateRealOrComplex(step, 'options.step')
		stepRe = parsedStep.re
		stepIm = parsedStep.im
	}

	return {
		stepRe,
		stepIm,
		nodes: null,
		initRe,
		initIm,
		method
	}
}

function neumaierAdd(sum, comp, term) {
	const t = sum + term
	if (!Number.isFinite(t)) {
		return [t, 0]
	}
	if (Math.abs(sum) >= Math.abs(term)) {
		comp += (sum - t) + term
	} else {
		comp += (term - t) + sum
	}
	return [t, comp]
}

function selectIntegrand(prev, curr, method) {
	if (method === 'trapezoidal') {
		return [prev.re * 0.5 + curr.re * 0.5, prev.im * 0.5 + curr.im * 0.5]
	}
	if (method === 'left') {
		return [prev.re, prev.im]
	}
	return [curr.re, curr.im]
}

function* integrateUniform(valuesIter, stepRe, stepIm, initRe, initIm, method) {
	let valuesDone = false
	try {
		const first = valuesIter.next()
		valuesDone = Boolean(first.done)
		if (valuesDone) return

		let prev = validateComplex(first.value, 'values[0]')
		let sumRe = initRe
		let compRe = 0
		let sumIm = initIm
		let compIm = 0

		yield { re: normalizeZero(sumRe), im: normalizeZero(sumIm) }

		let index = 1
		while (true) {
			const next = valuesIter.next()
			valuesDone = Boolean(next.done)
			if (valuesDone) return

			const curr = validateComplex(next.value, `values[${index}]`)
			const [fRe, fIm] = selectIntegrand(prev, curr, method)

			const dRe = fRe * stepRe - fIm * stepIm
			const dIm = fRe * stepIm + fIm * stepRe
			if (!Number.isFinite(dRe) || !Number.isFinite(dIm)) {
				throw new RangeError(`Complex integral overflowed at index ${index}`)
			}

			;[sumRe, compRe] = neumaierAdd(sumRe, compRe, dRe)
			;[sumIm, compIm] = neumaierAdd(sumIm, compIm, dIm)

			const outRe = sumRe + compRe
			const outIm = sumIm + compIm
			if (!Number.isFinite(outRe) || !Number.isFinite(outIm)) {
				throw new RangeError(`Complex integral overflowed at index ${index}`)
			}

			prev = curr
			index += 1
			yield { re: normalizeZero(outRe), im: normalizeZero(outIm) }
		}
	} finally {
		closeIterator(valuesIter, valuesDone)
	}
}

function* integrateWithNodes(valuesIter, nodesIter, initRe, initIm, method) {
	let valuesDone = false
	let nodesDone = false
	try {
		const vFirst = valuesIter.next()
		valuesDone = Boolean(vFirst.done)
		const nFirst = nodesIter.next()
		nodesDone = Boolean(nFirst.done)

		if (valuesDone && nodesDone) return
		if (valuesDone !== nodesDone) {
			throw new RangeError('values and options.nodes iterables must have the same length')
		}

		let prevVal = validateComplex(vFirst.value, 'values[0]')
		let prevNode = validateRealOrComplex(nFirst.value, 'options.nodes[0]')

		let sumRe = initRe
		let compRe = 0
		let sumIm = initIm
		let compIm = 0

		yield { re: normalizeZero(sumRe), im: normalizeZero(sumIm) }

		let index = 1
		while (true) {
			const vNext = valuesIter.next()
			valuesDone = Boolean(vNext.done)
			const nNext = nodesIter.next()
			nodesDone = Boolean(nNext.done)

			if (valuesDone && nodesDone) return
			if (valuesDone !== nodesDone) {
				throw new RangeError('values and options.nodes iterables must have the same length')
			}

			const currVal = validateComplex(vNext.value, `values[${index}]`)
			const currNode = validateRealOrComplex(nNext.value, `options.nodes[${index}]`)

			const dzRe = currNode.re - prevNode.re
			const dzIm = currNode.im - prevNode.im
			if (!Number.isFinite(dzRe) || !Number.isFinite(dzIm)) {
				throw new RangeError(`Node difference overflowed at index ${index}`)
			}

			const [fRe, fIm] = selectIntegrand(prevVal, currVal, method)
			const dRe = fRe * dzRe - fIm * dzIm
			const dIm = fRe * dzIm + fIm * dzRe
			if (!Number.isFinite(dRe) || !Number.isFinite(dIm)) {
				throw new RangeError(`Complex integral overflowed at index ${index}`)
			}

			;[sumRe, compRe] = neumaierAdd(sumRe, compRe, dRe)
			;[sumIm, compIm] = neumaierAdd(sumIm, compIm, dIm)

			const outRe = sumRe + compRe
			const outIm = sumIm + compIm
			if (!Number.isFinite(outRe) || !Number.isFinite(outIm)) {
				throw new RangeError(`Complex integral overflowed at index ${index}`)
			}

			prevVal = currVal
			prevNode = currNode
			index += 1
			yield { re: normalizeZero(outRe), im: normalizeZero(outIm) }
		}
	} finally {
		try {
			closeIterator(valuesIter, valuesDone)
		} finally {
			closeIterator(nodesIter, nodesDone)
		}
	}
}
