import test from 'node:test'
import assert from 'node:assert/strict'
import { setDifferenceFuzzyIterative } from './setDifferenceFuzzyIterative.js'

const EPSILON = 1e-12

function assertFuzzyClose(actual, expected, msg = '') {
	const actualKeys = Object.keys(actual).sort()
	const expectedKeys = Object.keys(expected).sort()
	assert.deepStrictEqual(actualKeys, expectedKeys, `Key mismatch ${msg}`)
	for (const key of expectedKeys) {
		assert.ok(
			Math.abs(actual[key] - expected[key]) <= EPSILON,
			`Value mismatch for key "${key}" ${msg}: got ${actual[key]}, expected ${expected[key]}`,
		)
	}
}

test('normal cases: plain object fuzzy sets with Zadeh operators', () => {
	const a = { x: 0.8, y: 0.5, z: 0.2, w: 0.9 }
	const b = { y: 0.3, z: 0.9, w: 1.0, onlyB: 0.7 }

	// x: min(0.8, 1 - 0) = 0.8
	// y: min(0.5, 1 - 0.3) = min(0.5, 0.7) = 0.5
	// z: min(0.2, 1 - 0.9) = min(0.2, 0.1) = 0.1
	// w: min(0.9, 1 - 1.0) = 0 -> omitted by default
	const res = setDifferenceFuzzyIterative(a, b)
	assertFuzzyClose(res, { x: 0.8, y: 0.5, z: 0.1 })

	// With keepZeros: true, keys from setA that evaluate to 0 are retained
	const resWithZeros = setDifferenceFuzzyIterative(a, b, { keepZeros: true })
	assertFuzzyClose(resWithZeros, { x: 0.8, y: 0.5, z: 0.1, w: 0 })
})

test('normal cases: crisp sets reduce to classical set difference', () => {
	const a = { a: 1, b: 1, c: 1 }
	const b = { b: 1, d: 1 }
	assert.deepStrictEqual(setDifferenceFuzzyIterative(a, b), { a: 1, c: 1 })
	assert.deepStrictEqual(setDifferenceFuzzyIterative(a, a), {})
})

test('normal cases: fuzzy self-difference A \\ A retains partial memberships', () => {
	// Under Zadeh operators, min(mu, 1 - mu) > 0 whenever 0 < mu < 1
	const a = { low: 0.2, mid: 0.5, high: 0.8, crisp0: 0, crisp1: 1 }
	const res = setDifferenceFuzzyIterative(a, a)
	assertFuzzyClose(res, { low: 0.2, mid: 0.5, high: 0.2 })
})

test('normal cases: Map fuzzy sets including non-string keys', () => {
	const objKey = { id: 1 }
	const a = new Map([
		[1, 0.75],
		[2, 0.4],
		[objKey, 0.9],
	])
	const b = new Map([
		[2, 0.8],
		[objKey, 1.0],
		[99, 0.5],
	])

	const res = setDifferenceFuzzyIterative(a, b)
	assert.ok(res instanceof Map)
	assert.strictEqual(res.size, 2)
	assert.ok(Math.abs(res.get(1) - 0.75) <= EPSILON)
	assert.ok(Math.abs(res.get(2) - 0.2) <= EPSILON)
	assert.strictEqual(res.has(objKey), false)
	assert.strictEqual(res.has(99), false)

	const resKeepZeros = setDifferenceFuzzyIterative(a, b, { keepZeros: true })
	assert.strictEqual(resKeepZeros.size, 3)
	assert.strictEqual(resKeepZeros.get(objKey), 0)
})

test('edge cases: empty sets, disjoint sets, and immutability', () => {
	assert.deepStrictEqual(setDifferenceFuzzyIterative({}, {}), {})
	assert.deepStrictEqual(setDifferenceFuzzyIterative({}, { a: 0.5 }), {})

	const emptyMap = new Map()
	const nonEmptyMap = new Map([['a', 0.6]])
	assert.deepStrictEqual(setDifferenceFuzzyIterative(emptyMap, nonEmptyMap), new Map())

	const a = { a: 0.4, b: 0.9 }
	const b = { c: 0.7 }
	const res = setDifferenceFuzzyIterative(a, b)
	assert.deepStrictEqual(res, { a: 0.4, b: 0.9 })
	assert.notStrictEqual(res, a)

	res.a = 0.1
	assert.deepStrictEqual(a, { a: 0.4, b: 0.9 })
	assert.deepStrictEqual(b, { c: 0.7 })
})

test('edge cases: boundary degrees (0, -0, 1), null-prototype objects, and special keys', () => {
	const a = Object.assign(Object.create(null), {
		zeroZero: -0,
		zeroOne: 0,
		oneZero: 1,
		oneOne: 1,
		toString: 0.7,
		constructor: 0.6,
		hasOwnProperty: 0.5,
	})
	const b = Object.assign(Object.create(null), {
		zeroZero: 0,
		zeroOne: 1,
		oneZero: -0,
		oneOne: 1,
		toString: 0.2,
	})

	const res = setDifferenceFuzzyIterative(a, b)
	assertFuzzyClose(res, {
		oneZero: 1,
		toString: 0.7,
		constructor: 0.6,
		hasOwnProperty: 0.5,
	})

	const resKeep = setDifferenceFuzzyIterative(a, b, { keepZeros: true })
	assert.strictEqual(Object.is(resKeep.zeroZero, 0), true)
	assert.strictEqual(Object.is(resKeep.zeroOne, 0), true)
	assert.strictEqual(Object.is(resKeep.oneOne, 0), true)
})

test('edge cases: large fuzzy sets iterate cleanly without recursion', () => {
	const size = 10_000
	const a = new Map()
	const b = new Map()
	for (let i = 0; i < size; i++) {
		a.set(i, (i % 101) / 100)
		b.set(i, ((i * 7) % 101) / 100)
	}

	const res = setDifferenceFuzzyIterative(a, b, { keepZeros: true })
	assert.strictEqual(res.size, size)
	for (let i = 0; i < size; i++) {
		const expected = Math.min(a.get(i), 1 - b.get(i))
		assert.ok(Math.abs(res.get(i) - expected) <= EPSILON)
	}
})

test('invalid inputs: non-object/Map containers and mismatched container types', () => {
	const invalidContainers = [null, undefined, 42, 'abc', true, [0.5], new Set(['a']), new Date()]
	for (const bad of invalidContainers) {
		assert.throws(() => setDifferenceFuzzyIterative(bad, {}), TypeError)
		assert.throws(() => setDifferenceFuzzyIterative({}, bad), TypeError)
	}

	assert.throws(() => setDifferenceFuzzyIterative({}, new Map()), TypeError)
	assert.throws(() => setDifferenceFuzzyIterative(new Map(), {}), TypeError)
})

test('invalid inputs: non-number, non-finite, and out-of-range membership degrees', () => {
	const nonNumbers = ['0.5', true, null, undefined, {}, []]
	for (const bad of nonNumbers) {
		assert.throws(() => setDifferenceFuzzyIterative({ a: bad }, {}), TypeError)
		assert.throws(() => setDifferenceFuzzyIterative({}, { onlyInB: bad }), TypeError)
		assert.throws(() => setDifferenceFuzzyIterative(new Map([['a', bad]]), new Map()), TypeError)
		assert.throws(() => setDifferenceFuzzyIterative(new Map(), new Map([['b', bad]])), TypeError)
	}

	const outOfRange = [-0.0001, -1, 1.0001, 2, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
	for (const bad of outOfRange) {
		assert.throws(() => setDifferenceFuzzyIterative({ a: bad }, {}), RangeError)
		assert.throws(() => setDifferenceFuzzyIterative({}, { onlyInB: bad }), RangeError)
		assert.throws(() => setDifferenceFuzzyIterative(new Map([['a', bad]]), new Map()), RangeError)
		assert.throws(() => setDifferenceFuzzyIterative(new Map(), new Map([['b', bad]])), RangeError)
	}
})

test('invalid inputs: malformed options object', () => {
	assert.throws(() => setDifferenceFuzzyIterative({}, {}, null), TypeError)
	assert.throws(() => setDifferenceFuzzyIterative({}, {}, 'keepZeros'), TypeError)
	assert.throws(() => setDifferenceFuzzyIterative({}, {}, []), TypeError)
	assert.throws(() => setDifferenceFuzzyIterative({}, {}, { keepZeros: 'true' }), TypeError)
	assert.throws(() => setDifferenceFuzzyIterative({}, {}, { keepZeros: 1 }), TypeError)
})

test('independent cross-check: agrees with Zadeh intersection(A, complement(B)) and algebraic laws', () => {
	// Deterministic LCG PRNG for reproducible property-based cross-checks
	let seed = 0x12345678
	function nextRandom() {
		seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
		return seed / 0x100000000
	}

	const universe = ['u0', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7']

	function randomFuzzySet() {
		const obj = {}
		for (const u of universe) {
			const r = nextRandom()
			if (r < 0.25) continue // implicit 0
			if (r < 0.35) obj[u] = 0
			else if (r < 0.45) obj[u] = 1
			else obj[u] = Math.round(nextRandom() * 1000) / 1000
		}
		return obj
	}

	// Independent reference operators over the explicit universe
	const degree = (s, u) => (Object.hasOwn(s, u) ? s[u] : 0)
	const zadehComplement = (s) =>
		Object.fromEntries(universe.map((u) => [u, 1 - degree(s, u)]))
	const zadehIntersect = (x, y) =>
		Object.fromEntries(
			universe
				.map((u) => [u, Math.min(degree(x, u), degree(y, u))])
				.filter(([, v]) => v > 0),
		)
	const zadehUnion = (x, y) =>
		Object.fromEntries(
			universe
				.map((u) => [u, Math.max(degree(x, u), degree(y, u))])
				.filter(([, v]) => v > 0),
		)

	for (let trial = 0; trial < 100; trial++) {
		const A = randomFuzzySet()
		const B = randomFuzzySet()
		const C = randomFuzzySet()

		const actual = setDifferenceFuzzyIterative(A, B)
		const reference = zadehIntersect(A, zadehComplement(B))
		assertFuzzyClose(actual, reference, `trial=${trial} (A \\ B vs A ∩ ¬B)`)

		// Verify Map path matches plain object path identically
		const mapActual = setDifferenceFuzzyIterative(new Map(Object.entries(A)), new Map(Object.entries(B)))
		assertFuzzyClose(Object.fromEntries(mapActual), actual, `trial=${trial} (Map vs Object)`)

		// Boundedness: 0 <= mu_(A\B)(u) <= mu_A(u) and <= 1 - mu_B(u)
		for (const u of universe) {
			const d = degree(actual, u)
			assert.ok(d >= 0 && d <= 1)
			assert.ok(d <= degree(A, u) + EPSILON)
			assert.ok(d <= 1 - degree(B, u) + EPSILON)
		}

		// Zadeh distributivity over union & intersection:
		// A \ (B ∪ C) = (A \ B) ∩ (A \ C)
		// A \ (B ∩ C) = (A \ B) ∪ (A \ C)
		assertFuzzyClose(
			setDifferenceFuzzyIterative(A, zadehUnion(B, C)),
			zadehIntersect(setDifferenceFuzzyIterative(A, B), setDifferenceFuzzyIterative(A, C)),
			`trial=${trial} (De Morgan union)`,
		)
		assertFuzzyClose(
			setDifferenceFuzzyIterative(A, zadehIntersect(B, C)),
			zadehUnion(setDifferenceFuzzyIterative(A, B), setDifferenceFuzzyIterative(A, C)),
			`trial=${trial} (De Morgan intersection)`,
		)
	}
})
