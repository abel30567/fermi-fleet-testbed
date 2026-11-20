import { test } from 'node:test'
import assert from 'node:assert'
import { add, powerIteration } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

function matVec(A, v) {
	return A.map((row) => row.reduce((sum, a, j) => sum + a * v[j], 0))
}

function norm(v) {
	return Math.hypot(...v)
}

test('powerIteration computes dominant eigenpair for symmetric matrix', () => {
	const A = [
		[2, 1],
		[1, 2],
	]
	const { eigenvalue, eigenvector } = powerIteration(A)
	assert.ok(Math.abs(eigenvalue - 3) < 1e-9)
	assert.ok(Math.abs(norm(eigenvector) - 1) < 1e-12)
	const Av = matVec(A, eigenvector)
	for (let i = 0; i < 2; i++) {
		assert.ok(Math.abs(Av[i] - eigenvalue * eigenvector[i]) < 1e-9)
	}
})

test('powerIteration computes dominant eigenpair for non-symmetric matrix', () => {
	const A = [
		[4, 2],
		[1, 3],
	]
	const { eigenvalue, eigenvector } = powerIteration(A)
	assert.ok(Math.abs(eigenvalue - 5) < 1e-9)
	assert.ok(Math.abs(norm(eigenvector) - 1) < 1e-12)
	const expected = [2 / Math.sqrt(5), 1 / Math.sqrt(5)]
	for (let i = 0; i < 2; i++) {
		assert.ok(Math.abs(eigenvector[i] - expected[i]) < 1e-9)
	}
})

test('powerIteration handles negative dominant eigenvalue', () => {
	const A = [
		[-4, 1],
		[1, -4],
	]
	const { eigenvalue, eigenvector } = powerIteration(A)
	assert.ok(Math.abs(eigenvalue - -5) < 1e-9)
	assert.ok(Math.abs(norm(eigenvector) - 1) < 1e-12)
	const Av = matVec(A, eigenvector)
	for (let i = 0; i < 2; i++) {
		assert.ok(Math.abs(Av[i] - eigenvalue * eigenvector[i]) < 1e-9)
	}
})

test('powerIteration works on 3x3 diagonal and row-stochastic matrices', () => {
	const D = [
		[2, 0, 0],
		[0, 7, 0],
		[0, 0, -3],
	]
	const resD = powerIteration(D)
	assert.ok(Math.abs(resD.eigenvalue - 7) < 1e-9)
	assert.ok(Math.abs(resD.eigenvector[0]) < 1e-9)
	assert.ok(Math.abs(resD.eigenvector[1] - 1) < 1e-9)
	assert.ok(Math.abs(resD.eigenvector[2]) < 1e-9)

	const P = [
		[0.7, 0.2, 0.1],
		[0.3, 0.5, 0.2],
		[0.1, 0.4, 0.5],
	]
	const resP = powerIteration(P)
	assert.ok(Math.abs(resP.eigenvalue - 1) < 1e-9)
	assert.ok(Math.abs(norm(resP.eigenvector) - 1) < 1e-12)
	const Pv = matVec(P, resP.eigenvector)
	for (let i = 0; i < 3; i++) {
		assert.ok(Math.abs(Pv[i] - resP.eigenvalue * resP.eigenvector[i]) < 1e-9)
	}
})

test('powerIteration handles 1x1, zero, identity, and nilpotent edge cases', () => {
	assert.deepEqual(powerIteration([[-4.5]]), {
		eigenvalue: -4.5,
		eigenvector: [1],
	})

	const zeroRes = powerIteration([
		[0, 0],
		[0, 0],
	])
	assert.equal(zeroRes.eigenvalue, 0)
	assert.ok(Math.abs(norm(zeroRes.eigenvector) - 1) < 1e-12)

	const idRes = powerIteration([
		[3, 0],
		[0, 3],
	])
	assert.ok(Math.abs(idRes.eigenvalue - 3) < 1e-12)
	assert.ok(Math.abs(norm(idRes.eigenvector) - 1) < 1e-12)

	const nilRes = powerIteration([
		[0, 1],
		[0, 0],
	])
	assert.equal(nilRes.eigenvalue, 0)
	assert.deepEqual(nilRes.eigenvector, [1, 0])
})

test('powerIteration validates inputs', () => {
	assert.throws(() => powerIteration([]), TypeError)
	assert.throws(() => powerIteration([[1, 2]]), TypeError)
	assert.throws(() => powerIteration([[1, NaN], [0, 1]]), TypeError)
	assert.throws(() => powerIteration([[1]], 0), RangeError)
	assert.throws(() => powerIteration([[1]], 10, -1), RangeError)
})
