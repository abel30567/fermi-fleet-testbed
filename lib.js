export function add(a, b) {
	return a + b
}

export function rejectFrom(u, v) {
	const dotUV = u.reduce((sum, ui, i) => sum + ui * v[i], 0)
	const dotVV = v.reduce((sum, vi) => sum + vi * vi, 0)
	const scale = dotUV / dotVV
	return u.map((ui, i) => ui - scale * v[i])
}
