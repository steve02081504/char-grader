import { read } from './character-card-parser.mjs';
import { Tiktoken } from "js-tiktoken/lite";
import { o200k_base } from './o200k_base.mjs';
import { arraysEqual } from './tools.mjs';
import { compressToUTF16 } from 'lz-string';
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
	return encoder.encode(str_array.filter(_ => _?.length).join('\n')).length
}


export function char_grader(arg, progress_stream = console.log) {
	progress_stream("Initializing...")
	let cardsize = 0;
	if (arg instanceof ArrayBuffer || arg instanceof Uint8Array) {
		cardsize = arg.byteLength
		arg = read(arg);
	}
	if (Object(arg) instanceof String) arg = JSON.parse(arg);
	/** @type {import('./charData.mjs').v1CharData} */
	let json = arg
	var score_details = {
		name: json.name,
		tags: json?.tags || [],
		index: json?.creatorcomment,
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
	function do_reparation(title, size, scale = 1, reparation_scale = 1 / 1.03) {
		let diff = Math.pow(size, reparation_scale) * scale
		score_details.score -= diff
		score_details.logs.push({
			type: `${title} too large`,
			score: -diff
		})
		progress_stream(`[reparation] ${title} too large: ${-diff} scores.`)
	}
	function GradingByTokenSize(title, str_array, scale = 1, reparation_startsize = 450, reparation_scale = 1 / 1.03) {
		let size = BaseGradingByTokenSize(title, str_array, scale)
		if (size >= reparation_startsize)
			do_reparation(title, size, scale, reparation_scale)
		return size
	}
	GradingByTokenSize('description & constant WI infos & mes_example', [
		format_text, json.mes_example
	], 1, 9037)
	GradingByTokenSize('personality & scenario', [
		json.personality, json.scenario
	], 0.5)
	let charData = json.data
	GradingByTokenSize('system_prompt & depth_prompt', [
		charData?.system_prompt, charData?.extensions?.depth_prompt?.prompt
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
		let key_array = []
		for (const entry of wibook_entries) {
			key_array.push(...entry.keys)
			key_array.push(...entry.secondary_keys)
		}
		let key_num = [...new Set(key_array)].length
		score_details.score += key_num * 2
		score_details.logs.push({
			type: 'unique_key_num',
			score: key_num * 2
		})
		progress_stream(`unique_key_num: ${key_num} unique keys, ${key_num * 2} scores.`)
		key_num = key_array.length - key_num;
		score_details.score += key_num * 0.4
		score_details.logs.push({
			type: 'multi_time_key_num',
			score: key_num * 0.4
		})
		progress_stream(`multi_time_key_num: ${key_num} multi time keys, ${key_num * 0.4} scores.`)
		BaseGradingByTokenSize("greenWI_total_token_size", wibook_entries.map(_ => _.content), 0.6)

		let superLargeEntries = wibook_entries.filter(_ => _?.content?.length > 2710)
		if (superLargeEntries.length > 0) {
			let size = superLargeEntries.map(_ => _.content.length).reduce((a, b) => a + b)
			let entrie_names = superLargeEntries.map(_ => _.comment).filter(_ => _).join(', ')
			do_reparation(`greenWI ${entrie_names}`, size, 0.6)
		}
	}
	if (charData?.alternate_greetings) {
		score_details.score += charData.alternate_greetings.length * 30
		score_details.logs.push({
			type: 'alternate_greetings',
			score: charData.alternate_greetings.length * 30
		})
		progress_stream(`alternate_greetings: ${charData.alternate_greetings.length} alternate greetings, ${charData.alternate_greetings.length * 30} scores.`)
	}
	if (charData?.extensions?.group_greetings) {
		score_details.score += charData.extensions.group_greetings.length * 20
		score_details.logs.push({
			type: 'group_greetings',
			score: charData.extensions.group_greetings.length * 20
		})
		progress_stream(`group_greetings: ${charData.extensions.group_greetings.length} group greetings, ${charData.extensions.group_greetings.length * 20} scores.`)
	}
	// 通过gzip压缩人物数据来得知数据冗余度，比较压缩率来同步缩放分数
	let gzip_text = [
		json.description, json.mes_example,
		json.personality, json.scenario,
		charData?.system_prompt, charData?.extensions?.depth_prompt?.prompt,
		...(json?.data?.character_book?.entries?.map?.(_ => _.content) || []),
		...(charData?.alternate_greetings || []),
		...(charData?.extensions?.group_greetings || []),
	].filter(_ => _?.length).join('\n')
	let compressed = compressToUTF16(gzip_text)
	let compress_ratio = compressed.length / gzip_text.length
	score_details.score *= compress_ratio
	score_details.logs.push({
		type: 'compress_ratio',
		scale: compress_ratio
	})
	progress_stream(`compress_ratio: ${compress_ratio}, all scores scaled as ${compress_ratio}.`)

	if (cardsize) {
		let cardsizeMB = cardsize / 1024 / 1024
		score_details.score += cardsizeMB
		score_details.logs.push({
			type: 'card size',
			score: cardsizeMB
		})
		progress_stream(`card size: ${cardsize} bytes, ${cardsizeMB} scores.`)
		if (cardsizeMB > 100)
			do_reparation('card size', cardsizeMB)
	}
	json.creatorcomment = json.creatorcomment || ""
	let cleard_creatorcomment = json.creatorcomment.split('\n').filter(
		_ => !(
			_.includes('http') || _.includes('Discord') || _.includes('GitHub') ||
			_.includes('类脑') || _.includes('Telegram') || _.includes('社区')
		) && _.trim().length
	).join('\n')
	if (cleard_creatorcomment) {
		let score = 5 + json.creatorcomment.length / 125
		score_details.score += score
		score_details.logs.push({
			type: 'creatorcomment',
			score: score
		})
		progress_stream(`creatorcomment: ${json.creatorcomment.length} bytes, ${score} scores.`)
	}
	else {
		let diff = -50
		score_details.score += diff
		score_details.logs.push({
			type: 'creatorcomment not found',
			score: diff
		})
		progress_stream(`creatorcomment not found: ${diff} scores.`)
	}
	if (json?.tags?.length) {
		score_details.score += json.tags.length * 3
		score_details.logs.push({
			type: 'tags',
			score: json.tags.length * 3
		})
		progress_stream(`tags: ${json.tags.length} tags, ${json.tags.length * 3} scores.`)
	}
	else {
		let diff = -5
		score_details.score += diff
		score_details.logs.push({
			type: 'tags not found',
			score: diff
		})
		progress_stream(`tags not found: ${diff} scores.`)
	}
	return score_details
}
