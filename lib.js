export function add(a, b) {
	return a + b
}

export function fixedPoint(g, x0, tol = 1e-10, maxIter = 200) {
	if (typeof g !== 'function') {
		throw new TypeError('g must be a function')
	}
	if (typeof x0 !== 'number' || !Number.isFinite(x0)) {
		throw new RangeError('x0 must be a finite number')
	}
	if (typeof tol !== 'number' || !Number.isFinite(tol) || tol <= 0) {
		throw new RangeError('tol must be a positive finite number')
	}
	if (!Number.isInteger(maxIter) || maxIter < 1) {
		throw new RangeError('maxIter must be a positive integer')
	}

	let x = x0
	for (let i = 0; i < maxIter; i++) {
		const next = g(x)
		if (typeof next !== 'number' || !Number.isFinite(next)) {
			throw new Error('fixedPoint iteration produced a non-finite value')
		}
		if (Math.abs(next - x) <= tol) {
			return next
		}
		x = next
	}

	throw new Error(`fixedPoint did not converge within ${maxIter} iterations`)
}
