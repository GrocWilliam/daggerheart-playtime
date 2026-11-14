<script lang="ts">
	import { translate, type Lang } from '$lib/i18n';
	import Help from './Help.svelte';

	let { conditions, lang }: { conditions: Record<string, boolean>; lang: Lang } = $props();
	const t = (key: string) => translate(lang, key);
</script>

<div>
	{#if conditions.vulnerable}<span class="inline-block rounded-[999px] border-2 border-danger px-[0.6rem] text-[0.875rem] text-bg bg-danger" data-testid="condition-vulnerable"><span class="-mx-[0.6rem] inline-block rounded-[999px] bg-surface px-[0.6rem] text-text"><Help id="vulnerable" name={t('badge.vulnerable')} label={t('badge.vulnerable')} {lang} /></span></span>{/if}
	{#if conditions.restrained}<span class="inline-block rounded-[999px] border-2 border-accent px-[0.6rem] text-[0.875rem] text-bg bg-accent" data-testid="condition-restrained"><span class="-mx-[0.6rem] inline-block rounded-[999px] bg-surface px-[0.6rem] text-text"><Help id="restrained" name={t('badge.restrained')} label={t('badge.restrained')} {lang} /></span></span>{/if}
	{#if conditions.hidden}<span class="inline-block rounded-[999px] border-2 border-calm px-[0.6rem] text-[0.875rem] text-bg bg-calm" data-testid="condition-hidden"><span class="-mx-[0.6rem] inline-block rounded-[999px] bg-surface px-[0.6rem] text-text"><Help id="hidden" name={t('badge.hidden')} label={t('badge.hidden')} {lang} /></span></span>{/if}
</div>
