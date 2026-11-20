export function add(a, b) {
	return a + b
}

export function goldenSectionMin(f, a, b, tol = 1e-8) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (!Number.isFinite(a) || !Number.isFinite(b)) {
		throw new RangeError('a and b must be finite numbers')
	}
	if (a > b) {
		throw new RangeError('a must be less than or equal to b')
	}
	if (!Number.isFinite(tol) || tol <= 0) {
		throw new RangeError('tol must be a positive finite number')
	}

	if (b - a <= tol) {
		const x = (a + b) / 2
		return { x, fx: f(x) }
	}

	const invPhi = (Math.sqrt(5) - 1) / 2
	let left = a
	let right = b
	let c = right - invPhi * (right - left)
	let d = left + invPhi * (right - left)
	let fc = f(c)
	let fd = f(d)

	const maxIter = 1000
	for (let i = 0; i < maxIter && right - left > tol; i++) {
		if (c <= left || d >= right) {
			break
		}
		if (fc <= fd) {
			right = d
			d = c
			fd = fc
			c = right - invPhi * (right - left)
			fc = f(c)
		} else {
			left = c
			c = d
			fc = fd
			d = left + invPhi * (right - left)
			fd = f(d)
		}
	}

	const x = (left + right) / 2
	return { x, fx: f(x) }
}
