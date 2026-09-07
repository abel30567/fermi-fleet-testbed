import { test } from 'node:test'
import assert from 'node:assert'
import { add, chainRuleDt } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('chainRuleDt: f=x*y, x=t, y=t*t at t=2 matches d/dt(t^3)=12', () => {
	const f = (x, y) => x * y
	const xt = (t) => t
	const yt = (t) => t * t
	const result = chainRuleDt(f, xt, yt, 2)
	assert.ok(Math.abs(result - 12) < 1e-2, `expected ~12, got ${result}`)
})

test('chainRuleDt: f=x+y, x=t, y=t is constant slope 2', () => {
	const f = (x, y) => x + y
	const xt = (t) => t
	const yt = (t) => t
	const result = chainRuleDt(f, xt, yt, 5)
	assert.ok(Math.abs(result - 2) < 1e-2, `expected ~2, got ${result}`)
})

test('chainRuleDt: f=x*y, x=cos(t), y=sin(t) at t=0 matches d/dt(sin(t)cos(t))=cos(2t)', () => {
	const f = (x, y) => x * y
	const xt = (t) => Math.cos(t)
	const yt = (t) => Math.sin(t)
	const result = chainRuleDt(f, xt, yt, 0)
	assert.ok(Math.abs(result - 1) < 1e-2, `expected ~1, got ${result}`)
})

test('chainRuleDt: respects custom step size h', () => {
	const f = (x, y) => x * y
	const xt = (t) => t
	const yt = (t) => t * t
	const result = chainRuleDt(f, xt, yt, 2, 1e-3)
	assert.ok(Math.abs(result - 12) < 1e-2, `expected ~12, got ${result}`)
})
