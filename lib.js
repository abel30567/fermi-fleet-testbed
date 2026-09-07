export function add(a, b) {
	return a + b
}

export function doubleIntegralSimpson(f, ax, bx, ay, by, n = 50) {
	if (n % 2 !== 0) {
		throw new RangeError('n must be even')
	}

	const hx = (bx - ax) / n
	const hy = (by - ay) / n

	const simpsonWeight = (i, n) => {
		if (i === 0 || i === n) return 1
		if (i % 2 === 1) return 4
		return 2
	}

	let total = 0
	for (let i = 0; i <= n; i++) {
		const x = ax + i * hx
		const wx = simpsonWeight(i, n)
		let inner = 0
		for (let j = 0; j <= n; j++) {
			const y = ay + j * hy
			const wy = simpsonWeight(j, n)
			inner += wy * f(x, y)
		}
		inner *= hy / 3
		total += wx * inner
	}
	total *= hx / 3

	return total
}
