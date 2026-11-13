<script lang="ts">
	import { translate, type Lang } from '$lib/i18n';
	import Help from './Help.svelte';

	let { conditions, lang }: { conditions: Record<string, boolean>; lang: Lang } = $props();
	const t = (key: string) => translate(lang, key);
</script>

<div>
	{#if conditions.vulnerable}<span class="inline-block rounded-[999px] px-[0.6rem] text-[0.875rem] text-bg bg-danger [&_button]:text-bg!" data-testid="condition-vulnerable"><Help id="vulnerable" name={t('badge.vulnerable')} label={t('badge.vulnerable')} {lang} /></span>{/if}
	{#if conditions.restrained}<span class="inline-block rounded-[999px] px-[0.6rem] text-[0.875rem] text-bg bg-accent [&_button]:text-bg!" data-testid="condition-restrained"><Help id="restrained" name={t('badge.restrained')} label={t('badge.restrained')} {lang} /></span>{/if}
	{#if conditions.hidden}<span class="inline-block rounded-[999px] px-[0.6rem] text-[0.875rem] text-bg bg-calm [&_button]:text-bg!" data-testid="condition-hidden"><Help id="hidden" name={t('badge.hidden')} label={t('badge.hidden')} {lang} /></span>{/if}
</div>
