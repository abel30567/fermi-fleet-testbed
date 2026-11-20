export function add(a, b) {
	return a + b
}

export function newton1D(f, df, x0, tol = 1e-10, maxIter = 100) {
	if (typeof f !== 'function' || typeof df !== 'function') {
		throw new TypeError('f and df must be functions')
	}
	if (typeof x0 !== 'number' || !Number.isFinite(x0)) {
		throw new RangeError('x0 must be a finite number')
	}
	if (typeof tol !== 'number' || !Number.isFinite(tol) || tol <= 0) {
		throw new RangeError('tol must be a positive finite number')
	}
	if (!Number.isInteger(maxIter) || maxIter < 0) {
		throw new RangeError('maxIter must be a non-negative integer')
	}

	const DERIVATIVE_EPS = 1e-15
	let x = x0

	for (let i = 0; i < maxIter; i++) {
		const fx = f(x)
		if (!Number.isFinite(fx)) {
			throw new Error('Function evaluated to a non-finite value')
		}
		if (fx === 0) {
			return x
		}

		const dfx = df(x)
		if (!Number.isFinite(dfx) || Math.abs(dfx) < DERIVATIVE_EPS) {
			throw new Error('Derivative is too close to zero')
		}

		const step = fx / dfx
		const nextX = x - step
		if (!Number.isFinite(nextX)) {
			throw new Error('Newton-Raphson iteration diverged to a non-finite value')
		}

		x = nextX
		if (Math.abs(step) <= tol) {
			return x
		}
	}

	const finalFx = f(x)
	if (Number.isFinite(finalFx) && finalFx === 0) {
		return x
	}

	throw new Error(`Newton-Raphson failed to converge within ${maxIter} iterations`)
}
