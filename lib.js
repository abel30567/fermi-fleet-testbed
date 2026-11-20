export function add(a, b) {
	return a + b
}

export function secantRoot(f, x0, x1, tol = 1e-10, maxIter = 100) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (typeof x0 !== 'number' || !Number.isFinite(x0)) {
		throw new TypeError('x0 must be a finite number')
	}
	if (typeof x1 !== 'number' || !Number.isFinite(x1)) {
		throw new TypeError('x1 must be a finite number')
	}
	if (typeof tol !== 'number' || !Number.isFinite(tol) || tol <= 0) {
		throw new RangeError('tol must be a positive finite number')
	}
	if (!Number.isInteger(maxIter) || maxIter < 1) {
		throw new RangeError('maxIter must be a positive integer')
	}

	let a = x0
	let b = x1
	let fa = f(a)
	if (!Number.isFinite(fa)) {
		throw new Error('Function evaluated to a non-finite value')
	}
	if (Math.abs(fa) <= tol) {
		return a
	}

	let fb = f(b)
	if (!Number.isFinite(fb)) {
		throw new Error('Function evaluated to a non-finite value')
	}
	if (Math.abs(fb) <= tol) {
		return b
	}

	for (let i = 0; i < maxIter; i++) {
		const denom = fb - fa
		if (denom === 0) {
			throw new Error('Secant method failed: zero denominator')
		}

		const x2 = b - (fb * (b - a)) / denom
		if (!Number.isFinite(x2)) {
			throw new Error('Secant method diverged to a non-finite value')
		}

		const f2 = f(x2)
		if (!Number.isFinite(f2)) {
			throw new Error('Function evaluated to a non-finite value')
		}

		if (Math.abs(x2 - b) <= tol || Math.abs(f2) <= tol) {
			return x2
		}

		a = b
		fa = fb
		b = x2
		fb = f2
	}

	throw new Error(`Secant method did not converge within ${maxIter} iterations`)
}
