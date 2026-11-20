import { test } from 'node:test'
import assert from 'node:assert'
import { add, goldenSectionMin } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('goldenSectionMin: minimizes quadratic function', () => {
	const f = (x) => (x - 3) ** 2 + 5
	const res = goldenSectionMin(f, 0, 10)
	assert.ok(Math.abs(res.x - 3) < 1e-7, `expected x ≈ 3, got ${res.x}`)
	assert.ok(Math.abs(res.fx - 5) < 1e-12, `expected fx ≈ 5, got ${res.fx}`)
	assert.equal(res.fx, f(res.x))
})

test('goldenSectionMin: minimizes transcendental functions', () => {
	const cosRes = goldenSectionMin(Math.cos, 0, 2 * Math.PI)
	assert.ok(Math.abs(cosRes.x - Math.PI) < 1e-7, `expected x ≈ π, got ${cosRes.x}`)
	assert.ok(Math.abs(cosRes.fx - -1) < 1e-12, `expected fx ≈ -1, got ${cosRes.fx}`)

	const expFn = (x) => Math.exp(x) - 2 * x
	const expRes = goldenSectionMin(expFn, -2, 3)
	assert.ok(Math.abs(expRes.x - Math.LN2) < 1e-7, `expected x ≈ ln(2), got ${expRes.x}`)
	assert.ok(Math.abs(expRes.fx - (2 - 2 * Math.LN2)) < 1e-12)
})

test('goldenSectionMin: minimizes non-differentiable unimodal function', () => {
	const f = (x) => Math.abs(x - 1.25) + 2
	const res = goldenSectionMin(f, -5, 5, 1e-10)
	assert.ok(Math.abs(res.x - 1.25) < 1e-9, `expected x ≈ 1.25, got ${res.x}`)
	assert.ok(Math.abs(res.fx - 2) < 1e-9, `expected fx ≈ 2, got ${res.fx}`)
})

test('goldenSectionMin: satisfies affine transformation identity', () => {
	const f = (x) => x ** 4 - 4 * x + 1
	const shift = 2.5
	const scale = 3
	const offset = -7
	const g = (x) => scale * f(x - shift) + offset

	const resF = goldenSectionMin(f, 0, 3, 1e-10)
	const resG = goldenSectionMin(g, shift, 3 + shift, 1e-10)

	assert.ok(Math.abs(resG.x - (resF.x + shift)) < 1e-8)
	assert.ok(Math.abs(resG.fx - (scale * resF.fx + offset)) < 1e-10)
})

test('goldenSectionMin: handles boundary minima and degenerate intervals', () => {
	const inc = goldenSectionMin((x) => 2 * x + 1, 1, 5)
	assert.ok(Math.abs(inc.x - 1) < 1e-7)
	assert.ok(Math.abs(inc.fx - 3) < 1e-6)

	const dec = goldenSectionMin((x) => -x, -10, -2)
	assert.ok(Math.abs(dec.x - -2) < 1e-7)
	assert.ok(Math.abs(dec.fx - 2) < 1e-7)

	const point = goldenSectionMin((x) => x * x, 4, 4)
	assert.deepEqual(point, { x: 4, fx: 16 })
})

test('goldenSectionMin: validates arguments', () => {
	assert.throws(() => goldenSectionMin('not-a-fn', 0, 1), TypeError)
	assert.throws(() => goldenSectionMin((x) => x, 5, 1), RangeError)
	assert.throws(() => goldenSectionMin((x) => x, NaN, 1), RangeError)
	assert.throws(() => goldenSectionMin((x) => x, 0, Infinity), RangeError)
	assert.throws(() => goldenSectionMin((x) => x, 0, 1, 0), RangeError)
	assert.throws(() => goldenSectionMin((x) => x, 0, 1, -1e-5), RangeError)
})
