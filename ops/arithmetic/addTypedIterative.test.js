import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addTypedIterative } from './addTypedIterative.js'

test('addTypedIterative: adds positive, negative, and fractional Float64Array values element-wise', () => {
  const a = new Float64Array([1, -2.5, 3.75, 0, 100.125])
  const b = new Float64Array([4, 2.5, -0.75, 7, -50.125])
  const out = addTypedIterative(a, b)

  assert.ok(out instanceof Float64Array)
  assert.notEqual(out, a)
  assert.notEqual(out, b)
  assert.deepEqual(out, new Float64Array([5, 0, 3, 7, 50]))
  // Inputs remain unmutated
  assert.deepEqual(a, new Float64Array([1, -2.5, 3.75, 0, 100.125]))
  assert.deepEqual(b, new Float64Array([4, 2.5, -0.75, 7, -50.125]))
})

test('addTypedIterative: supports aliased inputs and subarray views with non-zero byteOffset', () => {
  const backing = new Float64Array([10, 20, 30, 40, 50])
  const sliceA = backing.subarray(1, 4) // [20, 30, 40]
  const sliceB = backing.subarray(2, 5) // [30, 40, 50]

  assert.deepEqual(addTypedIterative(sliceA, sliceB), new Float64Array([50, 70, 90]))
  assert.deepEqual(addTypedIterative(sliceA, sliceA), new Float64Array([40, 60, 80]))
  assert.deepEqual(backing, new Float64Array([10, 20, 30, 40, 50]))
})

test('addTypedIterative: handles empty and single-element Float64Array inputs', () => {
  const emptyOut = addTypedIterative(new Float64Array(0), new Float64Array(0))
  assert.ok(emptyOut instanceof Float64Array)
  assert.equal(emptyOut.length, 0)

  const singleOut = addTypedIterative(new Float64Array([42.5]), new Float64Array([-0.5]))
  assert.deepEqual(singleOut, new Float64Array([42]))
})

test('addTypedIterative: preserves IEEE-754 special values (NaN, Infinity, signed zero, overflow, subnormals)', () => {
  const a = new Float64Array([
    NaN,
    Infinity,
    -Infinity,
    Infinity,
    -0,
    -0,
    Number.MAX_VALUE,
    Number.MIN_VALUE,
  ])
  const b = new Float64Array([
    1,
    10,
    -10,
    -Infinity,
    -0,
    0,
    Number.MAX_VALUE,
    Number.MIN_VALUE,
  ])
  const out = addTypedIterative(a, b)

  assert.ok(Number.isNaN(out[0]))
  assert.equal(out[1], Infinity)
  assert.equal(out[2], -Infinity)
  assert.ok(Number.isNaN(out[3]))
  assert.ok(Object.is(out[4], -0))
  assert.ok(Object.is(out[5], 0))
  assert.equal(out[6], Infinity)
  assert.equal(out[7], 2 * Number.MIN_VALUE)
})

test('addTypedIterative: throws TypeError for non-Float64Array inputs', () => {
  const valid = new Float64Array([1, 2])
  const invalidValues = [
    [1, 2],
    new Float32Array([1, 2]),
    new Int32Array([1, 2]),
    null,
    undefined,
    42,
    '12',
    { 0: 1, 1: 2, length: 2 },
  ]

  for (const bad of invalidValues) {
    assert.throws(() => addTypedIterative(bad, valid), TypeError)
    assert.throws(() => addTypedIterative(valid, bad), TypeError)
  }
})

test('addTypedIterative: throws RangeError when Float64Array lengths differ', () => {
  assert.throws(
    () => addTypedIterative(new Float64Array([1, 2]), new Float64Array([1, 2, 3])),
    RangeError
  )
  assert.throws(
    () => addTypedIterative(new Float64Array(0), new Float64Array([1])),
    RangeError
  )
})

test('addTypedIterative: cross-check against algebraic identities, closed-form formulas, and reference implementation', () => {
  const n = 256
  const a = new Float64Array(n)
  const b = new Float64Array(n)
  const c = new Float64Array(n)
  const zeros = new Float64Array(n)
  const negA = new Float64Array(n)

  // Deterministic exact dyadic rational inputs (powers of 1/8) for exact associativity
  for (let i = 0; i < n; i += 1) {
    a[i] = ((i * 37) % 101 - 50) / 8
    b[i] = ((i * 53) % 97 - 48) / 8
    c[i] = ((i * 19) % 89 - 44) / 8
    negA[i] = -a[i]
  }

  // Commutativity: a + b === b + a
  assert.deepEqual(addTypedIterative(a, b), addTypedIterative(b, a))

  // Additive identity: a + 0 === a
  assert.deepEqual(addTypedIterative(a, zeros), a)

  // Additive inverse: a + (-a) === 0
  const invSum = addTypedIterative(a, negA)
  for (let i = 0; i < n; i += 1) {
    assert.equal(invSum[i], 0)
  }

  // Associativity: (a + b) + c === a + (b + c)
  assert.deepEqual(
    addTypedIterative(addTypedIterative(a, b), c),
    addTypedIterative(a, addTypedIterative(b, c))
  )

  // Independent reference computation using Array.from
  const expected = Float64Array.from(Array.from(a, (v, i) => v + b[i]))
  assert.deepEqual(addTypedIterative(a, b), expected)

  // Closed-form Gauss pairing: i + (n - 1 - i) = n - 1 for all i
  const asc = new Float64Array(n)
  const desc = new Float64Array(n)
  for (let i = 0; i < n; i += 1) {
    asc[i] = i
    desc[i] = n - 1 - i
  }
  const paired = addTypedIterative(asc, desc)
  let total = 0
  for (let i = 0; i < n; i += 1) {
    assert.equal(paired[i], n - 1)
    total += paired[i]
  }
  assert.equal(total, n * (n - 1))

  // Trigonometric identity cross-check: sin^2(x) + cos^2(x) = 1
  const sinSq = new Float64Array(n)
  const cosSq = new Float64Array(n)
  for (let i = 0; i < n; i += 1) {
    const theta = (i * Math.PI) / 64
    sinSq[i] = Math.sin(theta) ** 2
    cosSq[i] = Math.cos(theta) ** 2
  }
  const ones = addTypedIterative(sinSq, cosSq)
  for (let i = 0; i < n; i += 1) {
    assert.ok(Math.abs(ones[i] - 1) <= 1e-15)
  }
})
