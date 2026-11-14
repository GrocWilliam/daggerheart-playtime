<script lang="ts">
	import { translate, type Lang } from '$lib/i18n';
	import Help from './Help.svelte';

	// Evasion and thresholds on one line. `.stats` is a marker class without CSS: frozen us-78 tests select `ul.stats`.
	let { evasion, major, severe, lang }: { evasion: number; major: number; severe: number; lang: Lang } = $props();
	const t = (key: string) => translate(lang, key);
</script>

<ul class="mt-0 mb-3 list-none pl-0!" class:stats={true}>
	<li class="inline"><Help id="evasion" name={t('stat.evasion')} label={t('stat.evasion')} {lang} /> <span data-testid="evasion">{evasion}</span></li>
	<li class="inline" aria-hidden="true">·</li>
	<li class="inline"><Help id="thresholds" name={t('stat.thresholds')} label={t('stat.thresholds')} {lang} /> <span data-testid="thresholds">{major}/{severe}</span></li>
</ul>
