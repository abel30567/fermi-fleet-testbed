export function add(a, b) {
	return a + b
}

export function brentRoot(f, a, b, tol = 1e-10, maxIter = 100) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (!Number.isFinite(a) || !Number.isFinite(b)) {
		throw new RangeError('Bracket endpoints a and b must be finite numbers')
	}
	if (!Number.isFinite(tol) || tol <= 0) {
		throw new RangeError('Tolerance tol must be a positive finite number')
	}
	if (!Number.isInteger(maxIter) || maxIter < 1) {
		throw new RangeError('maxIter must be a positive integer')
	}

	let fa = f(a)
	let fb = f(b)
	if (!Number.isFinite(fa) || !Number.isFinite(fb)) {
		throw new RangeError('Function values at bracket endpoints must be finite')
	}
	if (fa === 0) return a
	if (fb === 0) return b
	if ((fa > 0 && fb > 0) || (fa < 0 && fb < 0)) {
		throw new RangeError('Root is not bracketed: f(a) and f(b) must have opposite signs')
	}

	let c = b
	let fc = fb
	let d = b - a
	let e = d
	const eps = Number.EPSILON

	for (let iter = 0; iter < maxIter; iter++) {
		if ((fb > 0 && fc > 0) || (fb < 0 && fc < 0)) {
			c = a
			fc = fa
			d = b - a
			e = d
		}
		if (Math.abs(fc) < Math.abs(fb)) {
			a = b
			b = c
			c = a
			fa = fb
			fb = fc
			fc = fa
		}

		const tol1 = 2 * eps * Math.abs(b) + 0.5 * tol
		const xm = 0.5 * (c - b)
		if (Math.abs(xm) <= tol1 || fb === 0) {
			return b
		}

		if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
			const s = fb / fa
			let p
			let q
			if (a === c) {
				p = 2 * xm * s
				q = 1 - s
			} else {
				q = fa / fc
				const r = fb / fc
				p = s * (2 * xm * q * (q - r) - (b - a) * (r - 1))
				q = (q - 1) * (r - 1) * (s - 1)
			}
			if (p > 0) {
				q = -q
			}
			p = Math.abs(p)
			const min1 = 3 * xm * q - Math.abs(tol1 * q)
			const min2 = Math.abs(e * q)
			if (2 * p < (min1 < min2 ? min1 : min2)) {
				e = d
				d = p / q
			} else {
				d = xm
				e = d
			}
		} else {
			d = xm
			e = d
		}

		a = b
		fa = fb
		if (Math.abs(d) > tol1) {
			b += d
		} else {
			b += xm >= 0 ? Math.abs(tol1) : -Math.abs(tol1)
		}
		fb = f(b)
		if (fb === 0) {
			return b
		}
	}

	throw new Error(`brentRoot failed to converge within ${maxIter} iterations`)
}
