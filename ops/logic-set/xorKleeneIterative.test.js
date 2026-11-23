import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { xorKleeneIterative, UNKNOWN } from './xorKleeneIterative.js'

/**
 * Independent Strong Kleene K3 primitives used for cross-checking.
 */
function kleeneNot(a) {
	if (a === null) return null
	return !a
}

function kleeneAnd(a, b) {
	if (a === false || b === false) return false
	if (a === true && b === true) return true
	return null
}

function kleeneOr(a, b) {
	if (a === true || b === true) return true
	if (a === false && b === false) return false
	return null
}

function derivedKleeneXor2(a, b) {
	return kleeneOr(kleeneAnd(a, kleeneNot(b)), kleeneAnd(kleeneNot(a), b))
}

/**
 * Independent possible-worlds (completion) semantics for n-ary Kleene XOR:
 * expand every `null` to both `true` and `false`; return `true`/`false` iff
 * all classical completions agree, otherwise `null`.
 */
function possibleWorldsXor(values) {
	let worlds = [false]
	for (const v of values) {
		if (v === null) {
			const next = []
			for (const w of worlds) {
				next.push(w !== false)
				next.push(w !== true)
			}
			worlds = next
		} else {
			worlds = worlds.map((w) => w !== v)
		}
	}
	const first = worlds[0]
	for (const w of worlds) {
		if (w !== first) return null
	}
	return first
}

const KLEENE_VALUES = [true, false, null]

describe('xorKleeneIterative - scalar Kleene K3 logic', () => {
	test('exports UNKNOWN as null', () => {
		assert.equal(UNKNOWN, null)
	})

	test('binary truth table covers all 9 combinations', () => {
		const expected = [
			[true, true, false],
			[true, false, true],
			[true, null, null],
			[false, true, true],
			[false, false, false],
			[false, null, null],
			[null, true, null],
			[null, false, null],
			[null, null, null],
		]

		for (const [a, b, out] of expected) {
			assert.equal(xorKleeneIterative(a, b), out, `xor(${a}, ${b})`)
			assert.equal(xorKleeneIterative([a, b]), out, `xor([${a}, ${b}])`)
		}
	})

	test('unary and empty-array edge cases', () => {
		assert.equal(xorKleeneIterative([]), false)
		assert.equal(xorKleeneIterative(true), true)
		assert.equal(xorKleeneIterative(false), false)
		assert.equal(xorKleeneIterative(null), null)
		assert.equal(xorKleeneIterative([true]), true)
		assert.equal(xorKleeneIterative([false]), false)
		assert.equal(xorKleeneIterative([null]), null)
	})

	test('n-ary variadic and array calls including long iterative chains', () => {
		assert.equal(xorKleeneIterative(true, true, true), true)
		assert.equal(xorKleeneIterative(true, true, false, true, true), false)
		assert.equal(xorKleeneIterative(false, true, null, true), null)

		const manyTruesOdd = Array(1001).fill(true)
		const manyTruesEven = Array(1000).fill(true)
		assert.equal(xorKleeneIterative(manyTruesOdd), true)
		assert.equal(xorKleeneIterative(manyTruesEven), false)

		const manyWithOneUnknown = [...manyTruesEven, null, true]
		assert.equal(xorKleeneIterative(manyWithOneUnknown), null)
	})

	test('independent cross-check: matches derived (a AND NOT b) OR (NOT a AND b) and possible-worlds semantics for all 2-, 3-, and 4-tuples', () => {
		for (const a of KLEENE_VALUES) {
			for (const b of KLEENE_VALUES) {
				const actual = xorKleeneIterative(a, b)
				assert.equal(actual, derivedKleeneXor2(a, b))
				assert.equal(actual, possibleWorldsXor([a, b]))
			}
		}

		for (const a of KLEENE_VALUES) {
			for (const b of KLEENE_VALUES) {
				for (const c of KLEENE_VALUES) {
					const actual = xorKleeneIterative(a, b, c)
					const derived = derivedKleeneXor2(derivedKleeneXor2(a, b), c)
					assert.equal(actual, derived)
					assert.equal(actual, possibleWorldsXor([a, b, c]))
					// Associativity and commutativity
					assert.equal(
						xorKleeneIterative(xorKleeneIterative(a, b), c),
						xorKleeneIterative(a, xorKleeneIterative(b, c)),
					)
					assert.equal(actual, xorKleeneIterative(c, a, b))
				}
			}
		}

		for (const a of KLEENE_VALUES) {
			for (const b of KLEENE_VALUES) {
				for (const c of KLEENE_VALUES) {
					for (const d of KLEENE_VALUES) {
						assert.equal(
							xorKleeneIterative(a, b, c, d),
							possibleWorldsXor([a, b, c, d]),
						)
					}
				}
			}
		}
	})
})

describe('xorKleeneIterative - Map partial sets', () => {
	test('computes pointwise Kleene XOR over two Map partial sets', () => {
		const a = new Map([
			['tt', true],
			['tf', true],
			['tu', true],
			['ft', false],
			['ff', false],
			['fu', false],
			['ut', null],
			['uf', null],
			['uu', null],
			['onlyA_t', true],
			['onlyA_f', false],
		])
		const b = new Map([
			['tt', true],
			['tf', false],
			['tu', null],
			['ft', true],
			['ff', false],
			['fu', null],
			['ut', true],
			['uf', false],
			['uu', null],
			['onlyB_t', true],
			['onlyB_f', false],
		])

		const res = xorKleeneIterative(a, b)
		assert.ok(res instanceof Map)
		assert.deepEqual(
			res,
			new Map([
				['tt', false],
				['tf', true],
				['tu', null],
				['ft', true],
				['ff', false],
				['fu', null],
				['ut', null],
				['uf', null],
				['uu', null],
				['onlyA_t', null],
				['onlyA_f', null],
				['onlyB_t', null],
				['onlyB_f', null],
			]),
		)
	})

	test('supports non-string keys, empty Maps, unary copy, and n-ary folds', () => {
		const objKey = { id: 1 }
		const m1 = new Map([
			[1, true],
			[objKey, false],
		])
		const m2 = new Map([
			[1, true],
			[objKey, true],
		])
		const m3 = new Map([
			[1, true],
			[objKey, false],
		])

		assert.deepEqual(
			xorKleeneIterative(m1, m2, m3),
			new Map([
				[1, true],
				[objKey, true],
			]),
		)
		assert.deepEqual(xorKleeneIterative([m1, m2, m3]), xorKleeneIterative(m1, m2, m3))

		const unary = xorKleeneIterative(m1)
		assert.notEqual(unary, m1)
		assert.deepEqual(unary, m1)

		assert.deepEqual(xorKleeneIterative(new Map(), new Map()), new Map())
	})
})

describe('xorKleeneIterative - plain-object partial sets', () => {
	test('computes pointwise Kleene XOR over plain objects and null-prototype objects', () => {
		const a = { x: true, y: false, z: true, u: null, onlyA: true }
		const b = { x: true, y: true, z: false, u: true, onlyB: false }

		assert.deepEqual(xorKleeneIterative(a, b), {
			x: false,
			y: true,
			z: true,
			u: null,
			onlyA: null,
			onlyB: null,
		})

		const nullProtoA = Object.assign(Object.create(null), { p: true, q: false })
		const nullProtoB = Object.assign(Object.create(null), { p: false, q: false })
		assert.deepEqual(xorKleeneIterative(nullProtoA, nullProtoB), {
			p: true,
			q: false,
		})
	})

	test('handles objects with keys literally named "included" and "excluded" when values are Kleene scalars', () => {
		const a = { included: true, excluded: false }
		const b = { included: false, excluded: false }
		assert.deepEqual(xorKleeneIterative(a, b), { included: true, excluded: false })
	})

	test('handles empty objects and unary shallow clone safely', () => {
		assert.deepEqual(xorKleeneIterative({}, {}), {})
		const original = { a: true, b: null }
		const copy = xorKleeneIterative(original)
		assert.notEqual(copy, original)
		assert.deepEqual(copy, original)
	})
})

describe('xorKleeneIterative - structured { included, excluded } partial sets', () => {
	test('computes Kleene symmetric difference over two and three structured partial sets', () => {
		const a = { included: new Set(['a', 'b', 'c']), excluded: new Set(['d', 'e']) }
		const b = { included: new Set(['b', 'd', 'f']), excluded: new Set(['a', 'e']) }

		const ab = xorKleeneIterative(a, b)
		assert.ok(ab.included instanceof Set)
		assert.ok(ab.excluded instanceof Set)
		// a: T^F=T, b: T^T=F, c: T^U=U, d: F^T=T, e: F^F=F, f: U^T=U
		assert.deepEqual(ab.included, new Set(['a', 'd']))
		assert.deepEqual(ab.excluded, new Set(['b', 'e']))

		const c = { included: ['a', 'b'], excluded: ['d', 'e', 'g'] }
		const abc = xorKleeneIterative(a, b, c)
		// a: T^T=F, b: F^T=T, d: T^F=T, e: F^F=F, g: U^F=U
		assert.deepEqual(abc.included, new Set(['b', 'd']))
		assert.deepEqual(abc.excluded, new Set(['a', 'e']))
		assert.deepEqual(abc, xorKleeneIterative(ab, c))
		assert.deepEqual(abc, xorKleeneIterative([a, b, c]))
	})

	test('unary structured partial set returns independent cloned Sets', () => {
		const input = { included: [1, 1, 2], excluded: [3] }
		const out = xorKleeneIterative(input)
		assert.deepEqual(out.included, new Set([1, 2]))
		assert.deepEqual(out.excluded, new Set([3]))
	})
})

describe('xorKleeneIterative - cross-representation & monotonicity cross-checks', () => {
	test('Map, plain object, and structured partial set representations produce identical pointwise Kleene truth values', () => {
		const universe = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5']

		// Deterministic pseudo-random generator (LCG) for reproducible test vectors
		let seed = 0x12345678
		const nextVal = () => {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
			return KLEENE_VALUES[seed % 3]
		}

		for (let trial = 0; trial < 25; trial++) {
			const count = (trial % 4) + 1
			const rawSets = []
			for (let s = 0; s < count; s++) {
				const entries = {}
				for (const k of universe) {
					entries[k] = nextVal()
				}
				rawSets.push(entries)
			}

			const asRecords = rawSets.map((raw) => {
				const obj = {}
				for (const k of universe) {
					if (raw[k] !== null || (trial + k.charCodeAt(1)) % 2 === 0) {
						obj[k] = raw[k]
					}
				}
				return obj
			})

			const asMaps = asRecords.map((obj) => new Map(Object.entries(obj)))

			const asStructured = rawSets.map((raw) => {
				const included = new Set()
				const excluded = new Set()
				for (const k of universe) {
					if (raw[k] === true) included.add(k)
					else if (raw[k] === false) excluded.add(k)
				}
				return { included, excluded }
			})

			const resRecord = xorKleeneIterative(asRecords)
			const resMap = xorKleeneIterative(asMaps)
			const resStructured = xorKleeneIterative(asStructured)

			for (const k of universe) {
				const expected = possibleWorldsXor(rawSets.map((raw) => raw[k]))
				const recVal = Object.prototype.hasOwnProperty.call(resRecord, k)
					? resRecord[k]
					: null
				const mapVal = resMap.has(k) ? resMap.get(k) : null
				const structVal = resStructured.included.has(k)
					? true
					: resStructured.excluded.has(k)
						? false
						: null

				assert.equal(recVal, expected, `trial ${trial} key ${k} record`)
				assert.equal(mapVal, expected, `trial ${trial} key ${k} map`)
				assert.equal(structVal, expected, `trial ${trial} key ${k} structured`)
			}
		}
	})

	test('Kleene information-order monotonicity: refining unknown memberships never flips known outputs', () => {
		const partialA = { a: true, b: null, c: false, d: null }
		const partialB = { a: false, b: true, c: false, d: null }
		const refinedA = { a: true, b: false, c: false, d: true }
		const refinedB = { a: false, b: true, c: false, d: false }

		const coarseXor = xorKleeneIterative(partialA, partialB)
		const refinedXor = xorKleeneIterative(refinedA, refinedB)

		for (const key of Object.keys(coarseXor)) {
			if (coarseXor[key] !== null) {
				assert.equal(refinedXor[key], coarseXor[key])
			}
		}
		assert.deepEqual(coarseXor, { a: true, b: null, c: false, d: null })
		assert.deepEqual(refinedXor, { a: true, b: true, c: false, d: true })
	})
})

describe('xorKleeneIterative - input validation', () => {
	test('throws TypeError on missing or invalid operands', () => {
		assert.throws(() => xorKleeneIterative(), TypeError)
		assert.throws(() => xorKleeneIterative(undefined), TypeError)
		assert.throws(() => xorKleeneIterative(1, 0), TypeError)
		assert.throws(() => xorKleeneIterative('true', 'false'), TypeError)
		assert.throws(() => xorKleeneIterative(new Set([1]), new Set([2])), TypeError)
		assert.throws(() => xorKleeneIterative([true], [false]), TypeError)
		// Must still validate operands that appear after null
		assert.throws(() => xorKleeneIterative(null, 'invalid'), TypeError)
		assert.throws(() => xorKleeneIterative([null, 42]), TypeError)
	})

	test('throws TypeError on mismatched operand kinds', () => {
		assert.throws(() => xorKleeneIterative(true, new Map()), TypeError)
		assert.throws(() => xorKleeneIterative(new Map(), { a: true }), TypeError)
		assert.throws(
			() =>
				xorKleeneIterative(
					{ a: true },
					{ included: new Set(['a']), excluded: new Set() },
				),
			TypeError,
		)
		assert.throws(
			() =>
				xorKleeneIterative(
					{ included: new Set(['a']), excluded: new Set() },
					{ a: true },
				),
			TypeError,
		)
	})

	test('throws TypeError on invalid values inside partial sets', () => {
		assert.throws(
			() => xorKleeneIterative(new Map([['a', 1]]), new Map([['a', true]])),
			TypeError,
		)
		assert.throws(
			() => xorKleeneIterative({ a: true }, { a: 'unknown' }),
			TypeError,
		)
		assert.throws(
			() =>
				xorKleeneIterative({
					included: new Set(['a']),
					excluded: 'not-a-set',
				}),
			TypeError,
		)
	})

	test('throws RangeError when a structured partial set has overlapping included and excluded elements', () => {
		assert.throws(
			() =>
				xorKleeneIterative({
					included: new Set(['x']),
					excluded: new Set(['x']),
				}),
			RangeError,
		)
		// Even when earlier sets have empty known sets, later sets must still be validated
		assert.throws(
			() =>
				xorKleeneIterative(
					{ included: new Set(), excluded: new Set() },
					{ included: ['dup'], excluded: ['dup'] },
				),
			RangeError,
		)
	})
})
