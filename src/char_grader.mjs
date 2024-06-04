import { read } from './character-card-parser.mjs';
import { Tiktoken } from "js-tiktoken/lite";
import { o200k_base } from './o200k_base.mjs';
import { arraysEqual } from './tools.mjs';
import { compressToUTF16 } from 'lz-string';
function simple_marco_remover(str) {
	return str.replace(/{{\/\/([\s\S]*?)}}/g, '').replace(/\{\{user\}\}/i, 'user').replace(/\{\{char\}\}/i, 'char');
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
	if (Object(arg) instanceof String) arg = JSON.parse(arg.replace(/\r\n/g, '\n'));
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
	function BaseGrading(title, data, data_type = 'tokens', scale = 1, base_score = 0, pow = 1) {
		let score = Math.pow(data, pow) * scale + base_score
		score_details.score += score
		progress_stream(`${title}: ${data} ${data_type}, ${score} scores.`)
		score_details.logs.push({
			type: title,
			score: score
		})
		return data
	}
	function BaseGradingByTokenSize(title, str_array, scale = 1, base_score = 0, pow = 1) {
		let size = get_token_size(str_array)
		return BaseGrading(title, size, 'tokens', scale, base_score, pow)
	}
	function do_reparation(title, size, scale = 1, reparation_scale = 1 / 1.03) {
		let diff = Math.pow(size, reparation_scale) * scale
		score_details.score -= diff
		score_details.logs.push({
			type: `${title} too large`,
			score: -diff
		})
		progress_stream(`[reparation] ${title}: ${-diff} scores.`)
		return diff
	}
	function GradingByTokenSize(title, str_array, scale = 1, reparation_startsize = 450, reparation_scale = 1 / 1.03) {
		let size = BaseGradingByTokenSize(title, str_array, scale)
		if (size >= reparation_startsize)
			do_reparation(title + ' too large', size, scale, reparation_scale)
		return size
	}
	GradingByTokenSize('description & constant WI infos', [
		format_text
	], 1, 9037)
	json.mes_example = json.mes_example || ""
	json.mes_example = json.mes_example.split(/<START>/i)
	BaseGradingByTokenSize('mes_example', json.mes_example, 0.65)
	let superLargeMes = json.mes_example.filter(_ => _.length > 2500)
	if (superLargeMes.length) {
		do_reparation('some mes_example is too large', superLargeMes.map(_ => _.length).reduce((a, b) => a + b), 0.65)
	}
	GradingByTokenSize('personality & scenario', [
		json.personality, json.scenario
	], 0.5)
	let charData = json.data
	GradingByTokenSize('system_prompt & depth_prompt', [
		charData?.system_prompt, charData?.extensions?.depth_prompt?.prompt
	], 0.3)
	if (format_text.includes('\n    ') || format_text.includes('\n\t\t')) {
		let format_name = ''
		let yaml_score = format_text.match(/\n\s+-\s*\S/g)?.length
		let json_score = format_text.match(/\"\,\s*\n/g)?.length + format_text.match(/\{\s*\n/g)?.length
		let xml_score = format_text.match(/<([^>]*)>[^<]*<(\/|\\)\1>/g)?.length
		if (yaml_score >= json_score && yaml_score >= xml_score) format_name = 'yaml'
		else if (json_score >= yaml_score && json_score >= xml_score) format_name = 'json'
		else if (xml_score >= json_score && xml_score >= yaml_score) format_name = 'xml'
		if (format_name) {
			let scale = format_name === 'json' ? 0.6 : 0.8
			score_details.score *= scale
			score_details.logs.push({
				type: `format: ${format_name}`,
				scale: scale
			})
			progress_stream(`format: ${format_name}, all scores reduced as scale ${scale}.`)
		}
	}

	if (json?.data?.character_book?.entries) {
		let wibook_entries = json.data.character_book.entries.filter(_ => !_.constant)
		BaseGrading('greenWI_entries', wibook_entries.length, 'green entries', 5)
		let key_array = []
		for (const entry of wibook_entries) {
			key_array.push(...entry.keys)
			key_array.push(...entry.secondary_keys)
		}
		let key_num = [...new Set(key_array)].length
		BaseGrading('unique_key_num', key_num, 'unique keys', 2)
		key_num = key_array.length - key_num;
		BaseGrading('multi_time_key_num', key_num, 'multi time keys', 0.4)
		let gWI_size = get_token_size(wibook_entries.map(_ => _.content))
		let gWI_score = Math.pow(gWI_size, 1 / 1.15)
		BaseGrading("greenWI_total_token_size", gWI_size, "token size", 1, 20, 1 / 1.15)

		let related_names = [
			json.name, 'char', 'user', '你'
		]
		let related_regex = new RegExp(`(${related_names.join('|')})`, 'g')
		let quoted_regex = /(\"[^\"]+\")|([\”\“][^\”\“]+[\”\“])/g
		function is_related(str) {
			let matched = str.replace(quoted_regex, '').match(related_regex)
			return matched?.length > 1
		}
		function get_entrie_names(entries) {
			let named_entries = entries.filter(_ => _.comment && !_.tanji)
			let no_name_len = entries.length - named_entries.length
			let aret = named_entries.map(_ => _.comment).join(', ')
			if (no_name_len) {
				if (aret) aret += `and`
				aret += `${no_name_len} unnamed entrie${no_name_len > 1 ? 's' : ''}`
			}
			return aret
		}
		let unrelated_entries = wibook_entries.filter(_ => _?.content?.length > 27 && !is_related(_.content))
		if (unrelated_entries.length > 0) {
			let size = get_token_size(unrelated_entries.map(_ => _.content))
			let diff = Math.pow(gWI_size - size, 1 / 1.15)
			do_reparation(`greenWI ${get_entrie_names(unrelated_entries)} not directly related to ${json.name} or user`, gWI_score - diff, 1, 1.03)
			gWI_score -= diff
			gWI_size -= size
		}
		wibook_entries = wibook_entries.filter(_ => !unrelated_entries.includes(_))
		json.data.character_book.entries = wibook_entries

		let superLargeEntries = wibook_entries.filter(_ => _?.content?.length > 2710)
		if (superLargeEntries.length > 0) {
			let size = get_token_size(superLargeEntries.map(_ => _.content))
			let diff = Math.pow(gWI_size - size, 1 / 1.15)
			do_reparation(`greenWI ${get_entrie_names(superLargeEntries)} too large`, gWI_score - diff)
			gWI_score -= diff
			gWI_size -= size
		}
		wibook_entries = wibook_entries.filter(_ => !superLargeEntries.includes(_))
	}
	if (charData?.alternate_greetings)
		BaseGrading('alternate_greetings', charData.alternate_greetings.length, 'alternate greetings', 30)
	if (charData?.extensions?.group_greetings?.length)
		BaseGrading('group_greetings', charData.extensions.group_greetings.length, 'group greetings', 20)
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
		BaseGrading('card size', cardsizeMB, 'MB', 0.5)
		if (cardsizeMB > 100)
			do_reparation('card size too large', cardsizeMB)
	}
	json.creatorcomment = json.creatorcomment || ""
	let cleard_creatorcomment = json.creatorcomment.split('\n').filter(
		_ => (!_.match(/http|Discord|GitHub|类脑|Telegram|社区/i)) && _.trim().length
	).join('\n')
	if (cleard_creatorcomment)
		BaseGrading('creatorcomment', cleard_creatorcomment.length, 'bytes', 1 / 125, 5)
	else {
		let diff = -50
		score_details.score += diff
		score_details.logs.push({
			type: 'creatorcomment not found',
			score: diff
		})
		progress_stream(`creatorcomment not found: ${diff} scores.`)
	}
	json.tags = json.tags || []
	let cleard_tags = json.tags.filter(
		_ => (!_.match(/、|·|，|\\|\//g)) && _.trim().length
	)
	if (cleard_tags?.length)
		BaseGrading('tags', cleard_tags.length, 'tags', 3)
	else {
		let diff = -7
		score_details.score += diff
		score_details.logs.push({
			type: 'tags not found',
			score: diff
		})
		progress_stream(`tags not found: ${diff} scores.`)
	}
	return score_details
}
