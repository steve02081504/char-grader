import { Tiktoken } from "js-tiktoken/lite"
import o2000k_base from "tiktoken/encoders/o200k_base.json"
o2000k_base.pat_str = "[^\\r\\n\\p{L}\\p{N}]?[\\p{Lu}\\p{Lt}\\p{Lm}\\p{Lo}\\p{M}]*[\\p{Ll}\\p{Lm}\\p{Lo}\\p{M}]+('s|'S|'t|'T|'re|'rE|'Re|'RE|'ve|'vE|'Ve|'VE|'m|'M|'ll|'lL|'Ll|'LL|'d|'D)?|[^\\r\\n\\p{L}\\p{N}]?[\\p{Lu}\\p{Lt}\\p{Lm}\\p{Lo}\\p{M}]+[\\p{Ll}\\p{Lm}\\p{Lo}\\p{M}]*('s|'S|'t|'T|'re|'rE|'Re|'RE|'ve|'vE|'Ve|'VE|'m|'M|'ll|'lL|'Ll|'LL|'d|'D)?|\\p{N}{1,3}| ?[^\\s\\p{L}\\p{N}]+[\\r\\n/]*|\\s*[\\r\\n]+|\\s+(?!\\S)|\\s+"
var encoder = new Tiktoken(o2000k_base)

function get_token_size(obj) {
	if (!obj) return 0
	if (Object(obj) instanceof String) return encoder.encode(obj).length
	let aret = 0
	for (let key in obj) aret += get_token_size(obj[key])
	return aret
}
function encoder_free() {
	encoder.free()
}

export {
	encoder,
	get_token_size,
	encoder_free
}
