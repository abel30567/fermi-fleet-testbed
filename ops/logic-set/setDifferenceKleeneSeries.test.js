import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { setDifferenceKleeneSeries } from './setDifferenceKleeneSeries.js'

const KLEENE_VALUES = [true, false, 'unknown']

/**
 * Independent semantic oracle #1: epistemic completion semantics.
 * A partial truth value represents the set of its classical completions:
 *   true -> [true], false -> [false], 'unknown' -> [true, false].
 * Computes classical (a && !b) across all completions and aggregates.
 */
function completionOracle(a, b) {
	const aCompletions = a === 'unknown' ? [true, false] : [a]
	const bCompletions = b === 'unknown' ? [true, false] : [b]
	let sawTrue = false
	let sawFalse = false
	for (const ac of aCompletions) {
		for (const bc of bCompletions) {
			if (ac && !bc) {
				sawTrue = true
			} else {
				sawFalse = true
			}
		}
	}
	if (sawTrue && sawFalse) return 'unknown'
	return sawTrue
}

/**
 * Independent oracle #2: lattice / absolute-value closed form on {0, 0.5, 1}:
 *   min(a, 1 - b) = (1 + a - b - |a + b - 1|) / 2.
 */
function latticeAbsOracle(a, b) {
	const toUnit = (v) => (v === true ? 1 : v === false ? 0 : 0.5)
	const ua = toUnit(a)
	const ub = toUnit(b)
	const out = (1 + ua - ub - Math.abs(ua + ub - 1)) / 2
	if (out === 1) return true
	if (out === 0) return false
	return 'unknown'
}

/**
 * Independent Kleene K3 primitives for algebraic identity verification.
 */
function kleeneNot(set) {
	const out = {}
	for (const [k, v] of Object.entries(set)) {
		out[k] = v === 'unknown' ? 'unknown' : !v
	}
	return out
}

function kleeneAnd(a, b) {
	const toNum = (v) => (v === true ? 1 : v === false ? 0 : 0.5)
	const fromNum = (n) => (n === 1 ? true : n === 0 ? false : 'unknown')
	const keys = new Set([...Object.keys(a), ...Object.keys(b)])
	const out = {}
	for (const k of keys) {
		const va = Object.hasOwn(a, k) ? a[k] : 'unknown'
		const vb = Object.hasOwn(b, k) ? b[k] : 'unknown'
		out[k] = fromNum(Math.min(toNum(va), toNum(vb)))
	}
	return out
}

function kleeneOr(a, b) {
	const toNum = (v) => (v === true ? 1 : v === false ? 0 : 0.5)
	const fromNum = (n) => (n === 1 ? true : n === 0 ? false : 'unknown')
	const keys = new Set([...Object.keys(a), ...Object.keys(b)])
	const out = {}
	for (const k of keys) {
		const va = Object.hasOwn(a, k) ? a[k] : 'unknown'
		const vb = Object.hasOwn(b, k) ? b[k] : 'unknown'
		out[k] = fromNum(Math.max(toNum(va), toNum(vb)))
	}
	return out
}

/**
 * Kleene information order: unknown <=_k true, unknown <=_k false, x <=_k x.
 */
function infoLeq(x, y) {
	return x === 'unknown' || x === y
}

describe('setDifferenceKleeneSeries', () => {
	test('exhaustive 3x3 Kleene K3 truth table (plain objects)', () => {
		const expectedTable = [
			[true, true, false],
			[true, false, true],
			[true, 'unknown', 'unknown'],
			[false, true, false],
			[false, false, false],
			[false, 'unknown', false],
			['unknown', true, false],
			['unknown', false, 'unknown'],
			['unknown', 'unknown', 'unknown'],
		]

		for (const [a, b, expected] of expectedTable) {
			const res = setDifferenceKleeneSeries({ x: a }, { x: b })
			assert.deepEqual(res, { x: expected }, `Failed for (${a}, ${b})`)
		}
	})

	test('exhaustive 3x3 Kleene K3 truth table (Map inputs)', () => {
		const setA = new Map()
		const setB = new Map()
		const expected = new Map()

		let idx = 0
		for (const a of KLEENE_VALUES) {
			for (const b of KLEENE_VALUES) {
				const key = `k${idx++}`
				setA.set(key, a)
				setB.set(key, b)
				expected.set(key, completionOracle(a, b))
			}
		}

		const actual = setDifferenceKleeneSeries(setA, setB)
		assert.ok(actual instanceof Map)
		assert.deepEqual(actual, expected)
	})

	test('partial sets with open-world default (missing keys treated as unknown)', () => {
		const setA = {
			onlyATrue: true,
			onlyAFalse: false,
			onlyAUnknown: 'unknown',
			bothTrue: true,
			aTrueBFalse: true,
		}
		const setB = {
			onlyBTrue: true,
			onlyBFalse: false,
			onlyBUnknown: 'unknown',
			bothTrue: true,
			aTrueBFalse: false,
		}

		const result = setDifferenceKleeneSeries(setA, setB)
		assert.deepEqual(result, {
			onlyATrue: 'unknown', // true \ unknown = unknown
			onlyAFalse: false, // false \ unknown = false
			onlyAUnknown: 'unknown', // unknown \ unknown = unknown
			onlyBTrue: false, // unknown \ true = false
			onlyBFalse: 'unknown', // unknown \ false = unknown
			onlyBUnknown: 'unknown', // unknown \ unknown = unknown
			bothTrue: false, // true \ true = false
			aTrueBFalse: true, // true \ false = true
		})
	})

	test('partial sets with closed-world defaultValue: false', () => {
		const setA = { a: true, b: true, c: 'unknown', d: false }
		const setB = { b: true, e: true }

		const result = setDifferenceKleeneSeries(setA, setB, {
			defaultValue: false,
		})
		assert.deepEqual(result, {
			a: true, // true \ false = true
			b: false, // true \ true = false
			c: 'unknown', // unknown \ false = unknown
			d: false, // false \ false = false
			e: false, // false \ true = false
		})
	})

	test('explicit universe option includes elements absent from both sets', () => {
		const setA = { a: true }
		const setB = { b: false }

		const openRes = setDifferenceKleeneSeries(setA, setB, {
			universe: ['a', 'b', 'c', 'c'],
		})
		assert.deepEqual(openRes, {
			a: 'unknown',
			b: 'unknown',
			c: 'unknown',
		})

		const closedRes = setDifferenceKleeneSeries(setA, setB, {
			defaultValue: false,
			universe: new Set(['c', 'd']),
		})
		assert.deepEqual(closedRes, {
			a: true,
			b: false,
			c: false,
			d: false,
		})

		function* genUniverse() {
			yield 'x'
			yield 'y'
		}
		const genRes = setDifferenceKleeneSeries({}, {}, {
			defaultValue: true,
			universe: genUniverse(),
		})
		// true \ true = false
		assert.deepEqual(genRes, { x: false, y: false })
	})

	test('edge case: empty partial sets', () => {
		assert.deepEqual(setDifferenceKleeneSeries({}, {}), {})
		assert.deepEqual(setDifferenceKleeneSeries(new Map(), new Map()), new Map())
	})

	test('edge case: self-difference A \\ A preserves unknown (non-classical K3 behavior)', () => {
		const a = { t: true, f: false, u: 'unknown' }
		assert.deepEqual(setDifferenceKleeneSeries(a, a), {
			t: false,
			f: false,
			u: 'unknown',
		})
	})

	test('edge case: null-prototype objects and prototype-sensitive keys', () => {
		const setA = Object.create(null)
		setA.__proto__ = true
		setA.constructor = 'unknown'
		setA.toString = false
		setA.hasOwnProperty = true

		const setB = Object.create(null)
		setB.__proto__ = false
		setB.constructor = true
		setB.toString = 'unknown'
		setB.valueOf = true

		const res = setDifferenceKleeneSeries(setA, setB)
		assert.equal(Object.getPrototypeOf(res), Object.prototype)
		assert.equal(Object.hasOwn(res, '__proto__'), true)
		assert.equal(res['__proto__'], true)
		assert.equal(res.constructor, false)
		assert.equal(res.toString, false)
		assert.equal(res.hasOwnProperty, 'unknown')
		assert.equal(res.valueOf, false)
	})

	test('edge case: Map with non-string keys (objects, symbols, numbers, NaN)', () => {
		const objKey = { id: 1 }
		const symKey = Symbol('elem')
		const setA = new Map([
			[objKey, true],
			[symKey, 'unknown'],
			[42, false],
			[Number.NaN, true],
		])
		const setB = new Map([
			[objKey, false],
			[symKey, true],
			[Number.NaN, 'unknown'],
		])

		const res = setDifferenceKleeneSeries(setA, setB, {
			universe: [objKey, 99],
		})
		assert.ok(res instanceof Map)
		assert.equal(res.get(objKey), true)
		assert.equal(res.get(symKey), false)
		assert.equal(res.get(42), false)
		assert.equal(res.get(Number.NaN), 'unknown')
		assert.equal(res.get(99), 'unknown')
	})

	test('purity: does not mutate input sets or options', () => {
		const setA = Object.freeze({ a: true, b: 'unknown' })
		const setB = Object.freeze({ b: false, c: true })
		const universe = Object.freeze(['a', 'd'])
		const options = Object.freeze({ defaultValue: 'unknown', universe })

		const res = setDifferenceKleeneSeries(setA, setB, options)
		assert.deepEqual(res, {
			a: 'unknown',
			b: 'unknown',
			c: false,
			d: 'unknown',
		})

		const mapA = new Map([['x', true]])
		const mapB = new Map([['x', false]])
		const mapRes = setDifferenceKleeneSeries(mapA, mapB)
		assert.notEqual(mapRes, mapA)
		assert.notEqual(mapRes, mapB)
		assert.deepEqual([...mapA.entries()], [['x', true]])
		assert.deepEqual([...mapB.entries()], [['x', false]])
	})

	test('cross-check 1 & 2: matches epistemic completion oracle and lattice abs oracle on all pairs and 1000-element sets', () => {
		// Exhaustive 9-pair check
		for (const a of KLEENE_VALUES) {
			for (const b of KLEENE_VALUES) {
				const actual = setDifferenceKleeneSeries({ k: a }, { k: b }).k
				assert.equal(actual, completionOracle(a, b))
				assert.equal(actual, latticeAbsOracle(a, b))
			}
		}

		// Deterministic pseudo-random 1000-element partial set comparison
		let seed = 0x12345678
		const nextInt = (mod) => {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
			return seed % mod
		}

		const setA = {}
		const setB = {}
		for (let i = 0; i < 1000; i++) {
			const k = `el_${i}`
			const stateA = nextInt(4) // 0..2 -> Kleene value, 3 -> omitted
			const stateB = nextInt(4)
			if (stateA < 3) setA[k] = KLEENE_VALUES[stateA]
			if (stateB < 3) setB[k] = KLEENE_VALUES[stateB]
		}

		const res = setDifferenceKleeneSeries(setA, setB)
		for (const k of Object.keys(res)) {
			const va = Object.hasOwn(setA, k) ? setA[k] : 'unknown'
			const vb = Object.hasOwn(setB, k) ? setB[k] : 'unknown'
			assert.equal(res[k], completionOracle(va, vb))
			assert.equal(res[k], latticeAbsOracle(va, vb))
		}
	})

	test('cross-check 3: satisfies K3 De Morgan and distributive set-difference identities', () => {
		// Construct A, B, C covering all 3^3 = 27 triples of (a, b, c)
		const A = {}
		const B = {}
		const C = {}
		let idx = 0
		for (const a of KLEENE_VALUES) {
			for (const b of KLEENE_VALUES) {
				for (const c of KLEENE_VALUES) {
					const k = `t${idx++}`
					A[k] = a
					B[k] = b
					C[k] = c
				}
			}
		}

		const diffAB = setDifferenceKleeneSeries(A, B)

		// Identity 1: A \ B = A ∩ (¬B)
		assert.deepEqual(diffAB, kleeneAnd(A, kleeneNot(B)))

		// Identity 2: ¬(A \ B) = (¬A) ∪ B
		assert.deepEqual(kleeneNot(diffAB), kleeneOr(kleeneNot(A), B))

		// Identity 3: (A ∪ C) \ B = (A \ B) ∪ (C \ B)
		assert.deepEqual(
			setDifferenceKleeneSeries(kleeneOr(A, C), B),
			kleeneOr(diffAB, setDifferenceKleeneSeries(C, B)),
		)

		// Identity 4: (A ∩ C) \ B = (A \ B) ∩ (C \ B)
		assert.deepEqual(
			setDifferenceKleeneSeries(kleeneAnd(A, C), B),
			kleeneAnd(diffAB, setDifferenceKleeneSeries(C, B)),
		)

		// Identity 5: A \ (B ∪ C) = (A \ B) ∩ (A \ C)
		assert.deepEqual(
			setDifferenceKleeneSeries(A, kleeneOr(B, C)),
			kleeneAnd(diffAB, setDifferenceKleeneSeries(A, C)),
		)

		// Identity 6: A \ (B ∩ C) = (A \ B) ∪ (A \ C)
		assert.deepEqual(
			setDifferenceKleeneSeries(A, kleeneAnd(B, C)),
			kleeneOr(diffAB, setDifferenceKleeneSeries(A, C)),
		)
	})

	test('cross-check 4: monotonicity in Kleene information order <=_k', () => {
		for (const a1 of KLEENE_VALUES) {
			for (const a2 of KLEENE_VALUES) {
				if (!infoLeq(a1, a2)) continue
				for (const b1 of KLEENE_VALUES) {
					for (const b2 of KLEENE_VALUES) {
						if (!infoLeq(b1, b2)) continue
						const r1 = setDifferenceKleeneSeries({ x: a1 }, { x: b1 }).x
						const r2 = setDifferenceKleeneSeries({ x: a2 }, { x: b2 }).x
						assert.ok(
							infoLeq(r1, r2),
							`Monotonicity violated: (${a1}\\${b1})=${r1} not <=_k (${a2}\\${b2})=${r2}`,
						)
					}
				}
			}
		}
	})

	test('invalid inputs throw TypeError', () => {
		class CustomBox {
			constructor() {
				this.x = true
			}
		}

		// Invalid setA / setB containers
		const invalidContainers = [
			null,
			undefined,
			true,
			42,
			'abc',
			Symbol('s'),
			[],
			new Set(['a']),
			new Date(),
			/abc/,
			() => {},
			new CustomBox(),
		]
		for (const bad of invalidContainers) {
			assert.throws(() => setDifferenceKleeneSeries(bad, {}), TypeError)
			assert.throws(() => setDifferenceKleeneSeries({}, bad), TypeError)
		}

		// Mismatched container types
		assert.throws(
			() => setDifferenceKleeneSeries({}, new Map()),
			TypeError,
		)
		assert.throws(
			() => setDifferenceKleeneSeries(new Map(), {}),
			TypeError,
		)

		// Invalid Kleene truth values inside sets
		const invalidValues = [
			null,
			undefined,
			0,
			1,
			-1,
			0.5,
			Number.NaN,
			'true',
			'false',
			'UNKNOWN',
			'maybe',
			{},
			[],
		]
		for (const badVal of invalidValues) {
			assert.throws(
				() => setDifferenceKleeneSeries({ x: badVal }, {}),
				TypeError,
			)
			assert.throws(
				() => setDifferenceKleeneSeries({}, { x: badVal }),
				TypeError,
			)
			assert.throws(
				() => setDifferenceKleeneSeries(new Map([['x', badVal]]), new Map()),
				TypeError,
			)
			assert.throws(
				() => setDifferenceKleeneSeries(new Map(), new Map([['x', badVal]])),
				TypeError,
			)
		}

		// Invalid options object
		for (const badOpts of [null, 123, 'opts', [], new Map()]) {
			assert.throws(
				() => setDifferenceKleeneSeries({}, {}, badOpts),
				TypeError,
			)
		}

		// Invalid options.defaultValue
		for (const badDef of [null, 0, 1, 'maybe', 'UNKNOWN']) {
			assert.throws(
				() => setDifferenceKleeneSeries({}, {}, { defaultValue: badDef }),
				TypeError,
			)
		}

		// Invalid options.universe
		for (const badUniv of [null, 42, {}, 'abc']) {
			assert.throws(
				() => setDifferenceKleeneSeries({}, {}, { universe: badUniv }),
				TypeError,
			)
		}
		assert.throws(
			() => setDifferenceKleeneSeries({}, {}, { universe: [123] }),
			TypeError,
		)
	})
})
