export function add(a, b) {
	return a + b
}

export function doubleIntegralPolar(f, r0, r1, th0, th1, n = 200) {
	const dr = (r1 - r0) / n
	const dth = (th1 - th0) / n
	let sum = 0
	for (let i = 0; i < n; i++) {
		const r = r0 + (i + 0.5) * dr
		for (let j = 0; j < n; j++) {
			const th = th0 + (j + 0.5) * dth
			sum += f(r, th) * r
		}
	}
	return sum * dr * dth
}
