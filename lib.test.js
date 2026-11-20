import { test } from 'node:test'
import assert from 'node:assert'
import { add, lineIntegralVector } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('lineIntegralVector: circulation of rotational field around circle and ellipse', () => {
	const F = ([x, y]) => [-y, x]
	const circle = (t) => [Math.cos(t), Math.sin(t)]
	const circCircle = lineIntegralVector(F, circle, 0, 2 * Math.PI)
	assert.ok(Math.abs(circCircle - 2 * Math.PI) < 1e-9, `expected 2π, got ${circCircle}`)

	const a = 3
	const b = 2
	const ellipse = (t) => [a * Math.cos(t), b * Math.sin(t)]
	const circEllipse = lineIntegralVector(F, ellipse, 0, 2 * Math.PI)
	assert.ok(
		Math.abs(circEllipse - 2 * Math.PI * a * b) < 1e-8,
		`expected 2πab, got ${circEllipse}`,
	)
})

test('lineIntegralVector: conservative 3D field path independence and closed loop', () => {
	// phi(x, y, z) = x^2 * y + sin(z) + x * z
	const phi = ([x, y, z]) => x * x * y + Math.sin(z) + x * z
	const gradPhi = ([x, y, z]) => [2 * x * y + z, x * x, Math.cos(z) + x]

	const path1 = (t) => [t, 2 * t, (Math.PI / 2) * t]
	const path2 = (t) => [t * t, 2 * Math.sin((Math.PI / 2) * t), (Math.PI / 2) * t * t * t]

	const expected = phi([1, 2, Math.PI / 2]) - phi([0, 0, 0])
	const w1 = lineIntegralVector(gradPhi, path1, 0, 1)
	const w2 = lineIntegralVector(gradPhi, path2, 0, 1)

	assert.ok(Math.abs(w1 - expected) < 1e-9, `path1: expected ${expected}, got ${w1}`)
	assert.ok(Math.abs(w2 - expected) < 1e-9, `path2: expected ${expected}, got ${w2}`)

	const closedLoop = (t) => [Math.cos(t), Math.sin(t), Math.sin(2 * t)]
	const loopWork = lineIntegralVector(gradPhi, closedLoop, 0, 2 * Math.PI)
	assert.ok(Math.abs(loopWork) < 1e-9, `closed loop should be 0, got ${loopWork}`)
})

test('lineIntegralVector: orientation reversal, path additivity, and linearity', () => {
	const F = ([x, y, z]) => [y * z, x * z + y, x * y + z * z]
	const G = ([x, y, z]) => [x, -y, 2 * z]
	const helix = (t) => [Math.cos(t), Math.sin(t), t]

	const forward = lineIntegralVector(F, helix, 0, Math.PI)
	const backward = lineIntegralVector(F, helix, Math.PI, 0)
	assert.ok(Math.abs(forward + backward) < 1e-9, `reversal failed: ${forward} vs ${backward}`)

	const part1 = lineIntegralVector(F, helix, 0, Math.PI / 3)
	const part2 = lineIntegralVector(F, helix, Math.PI / 3, Math.PI)
	assert.ok(Math.abs(part1 + part2 - forward) < 1e-9, 'path additivity failed')

	const alpha = 2.5
	const beta = -1.75
	const combined = ([x, y, z]) => {
		const fv = F([x, y, z])
		const gv = G([x, y, z])
		return [
			alpha * fv[0] + beta * gv[0],
			alpha * fv[1] + beta * gv[1],
			alpha * fv[2] + beta * gv[2],
		]
	}
	const wF = lineIntegralVector(F, helix, 0, 2)
	const wG = lineIntegralVector(G, helix, 0, 2)
	const wComb = lineIntegralVector(combined, helix, 0, 2)
	assert.ok(Math.abs(wComb - (alpha * wF + beta * wG)) < 1e-9, 'linearity failed')
})

test('lineIntegralVector: orthogonal field, degenerate interval, and 1D scalar curve', () => {
	const radial = ([x, y]) => [x, y]
	const circle = (t) => [Math.cos(t), Math.sin(t)]
	const orthoWork = lineIntegralVector(radial, circle, 0, 2 * Math.PI)
	assert.ok(Math.abs(orthoWork) < 1e-10, `orthogonal field should give 0, got ${orthoWork}`)

	assert.equal(lineIntegralVector(radial, circle, 1.5, 1.5), 0)

	const scalarWork = lineIntegralVector((x) => x * x, (t) => t, 0, 3, 100)
	assert.ok(Math.abs(scalarWork - 9) < 1e-9, `1D integral expected 9, got ${scalarWork}`)
})

test('lineIntegralVector: input validation and dimension mismatch errors', () => {
	const F = ([x, y]) => [x, y]
	const r = (t) => [t, t]

	assert.throws(() => lineIntegralVector(null, r, 0, 1), TypeError)
	assert.throws(() => lineIntegralVector(F, 'not-a-fn', 0, 1), TypeError)
	assert.throws(() => lineIntegralVector(F, r, NaN, 1), RangeError)
	assert.throws(() => lineIntegralVector(F, r, 0, Infinity), RangeError)
	assert.throws(() => lineIntegralVector(F, r, 0, 1, 0), RangeError)
	assert.throws(() => lineIntegralVector(F, r, 0, 1, -10), RangeError)
	assert.throws(() => lineIntegralVector(F, r, 0, 1, 2.5), RangeError)
	assert.throws(() => lineIntegralVector(([x, y]) => [x, y, 0], r, 0, 1, 10), RangeError)
})
