export function add(a, b) {
	return a + b
}

export function det3(m) {
	const [
		[a, b, c],
		[d, e, f],
		[g, h, i],
	] = m
	return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
}
