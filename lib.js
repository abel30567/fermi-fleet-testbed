export function add(a, b) {
	return a + b
}

export function lineIntegralVector(P, Q, rx, ry, t0, t1, n = 1000) {
	const h = (t1 - t0) / n
	let sum = 0
	for (let i = 0; i < n; i++) {
		const t = t0 + (i + 0.5) * h
		const dx = (rx(t + h / 2) - rx(t - h / 2)) / h
		const dy = (ry(t + h / 2) - ry(t - h / 2)) / h
		sum += (P(rx(t), ry(t)) * dx + Q(rx(t), ry(t)) * dy) * h
	}
	return sum
}
