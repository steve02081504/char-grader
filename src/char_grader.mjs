import { read } from './character-card-parser.mjs';
import { Tiktoken } from "js-tiktoken/lite";
import { o200k_base } from './o200k_base.mjs';
import { arraysEqual } from './tools.mjs';
function simple_marco_remover(str) {
	return str.replace(/{{\/\/([\s\S]*?)}}/g, '').replace(/\{\{(user|char)\}\}/gi, 'name');
}
function remove_simple_marcos(object) {
	if (Object(object) instanceof String) return simple_marco_remover(object)
	for (const key in object) object[key] = remove_simple_marcos(object[key])
	return object
}
var encoder = new Tiktoken(o200k_base);
function get_token_size(str_array) {
	return encoder.encode(str_array.join('\n')).length
}


export function char_grader(arg, progress_stream = console.log) {
	progress_stream("Initializing...")
	if (arg instanceof ArrayBuffer || arg instanceof Uint8Array) arg = read(arg);
	if (Object(arg) instanceof String) arg = JSON.parse(arg);
	/** @type {import('./charData.mjs').v1CharData} */
	let json = arg
	var score_details = {
		name: json.name,
		logs: [],
		score: 0
	}
	progress_stream("Removeing useless datas...")
	json = remove_simple_marcos(json)
	let format_text = json.description
	if (json?.data?.character_book?.entries) {
		json.data.character_book.entries = json.data.character_book.entries.filter(_ => _.keys !== undefined)
		for (const entry of json.data.character_book.entries) {
			entry.keys = entry.keys.filter(_ => _.length > 0).sort()
			entry.secondary_keys = entry.secondary_keys.filter(_ => _.length > 0).sort()
			if (!entry.constant && !entry.keys.length) entry.enabled = false
		}
		json.data.character_book.entries = json.data.character_book.entries.filter(_ => _.enabled && _.content).sort((a, b) => a.insertion_order - b.insertion_order)
		progress_stream("Marging WI data...")
		let new_book = []
		let index = 0
		for (const entry of json.data.character_book.entries) {
			let last_entry = new_book[index - 1]
			if (
				last_entry &&
				arraysEqual(entry.keys, last_entry.keys) &&
				arraysEqual(entry.secondary_keys, last_entry.secondary_keys) &&
				entry.constant === last_entry.constant &&
				entry.position === last_entry.position
			) {
				last_entry.content += '\n' + entry.content
			}
			else {
				new_book.push(entry)
				index++
			}
		}
		json.data.character_book.entries = new_book
		format_text += json.data.character_book.entries.filter(_ => _.constant).map(_ => _.content).join('\n')
	}
	progress_stream("Grading...")
	function BaseGradingByTokenSize(title, str_array, scale = 1) {
		let size = get_token_size(str_array)
		let score = size * scale
		score_details.score += size * scale
		progress_stream(`${title}: ${size} tokens, ${score} scores.`)
		score_details.logs.push({
			type: title,
			score: score
		})
		return size
	}
	function GradingByTokenSize(title, str_array, scale = 1, reparation_startsize = 450, reparation_scale = 1/1.03) {
		let size = BaseGradingByTokenSize(title, str_array, scale)
		if (size >= reparation_startsize) {
			let diff = Math.pow(size, reparation_scale) * scale
			score_details.score -= diff
			score_details.logs.push({
				type: `${title} too large`,
				score: -diff
			})
			progress_stream(`[reparation] ${title} too large: ${-diff} scores.`)
		}
		return size
	}
	GradingByTokenSize('description & constant WI infos & mes_example', [
		format_text, json.mes_example,
	], 1, 9037)
	GradingByTokenSize('personality & scenario', [
		json.personality, json.scenario
	], 0.5)
	let charData = json.data
	GradingByTokenSize('system_prompt & depth_prompt', [
		charData.system_prompt, charData?.extensions?.depth_prompt?.prompt
	], 0.3)
	if (format_text.includes('    ') || format_text.includes('\t')) {
		let format_name = ''
		let yaml_score = format_text.match(/\n\s+-\s*\S/g)?.length
		let json_score = format_text.match(/\"\,\s*\n/g)?.length + format_text.match(/\{\s*\n/g)?.length
		let xml_score = format_text.match(/<([^>]*)>[^<]*<(\/|\\)\1>/g)?.length
		if (yaml_score >= json_score && yaml_score >= xml_score) format_name = 'yaml'
		else if (json_score >= yaml_score && json_score >= xml_score) format_name = 'json'
		else if (xml_score >= json_score && xml_score >= yaml_score) format_name = 'xml'
		if (format_name) {
			score_details.score *= 0.4
			score_details.logs.push({
				type: `format: ${format_name}`,
				scale: 0.4
			})
			progress_stream(`format: ${format_name}, all scores reduced as scale 0.4.`)
		}
	}

	if (json?.data?.character_book?.entries) {
		let wibook_entries = json.data.character_book.entries.filter(_ => !_.constant)
		score_details.score += wibook_entries.length * 5
		score_details.logs.push({
			type: 'greenWI_entries',
			score: wibook_entries.length * 5
		})
		progress_stream(`greenWI_entries: ${wibook_entries.length} green entries, ${wibook_entries.length * 5} scores.`)
		let key_num = wibook_entries.map(_ => _.keys.length + _.secondary_keys.length).reduce((a, b) => a + b, 0)
		score_details.score += key_num * 2
		score_details.logs.push({
			type: 'key_num',
			score: key_num * 2
		})
		progress_stream(`key_num: ${key_num} keys, ${key_num * 2} scores.`)
		BaseGradingByTokenSize("greenWI_total_token_size", wibook_entries.map(_ => _.content), 0.6)
	}
	return score_details
}
