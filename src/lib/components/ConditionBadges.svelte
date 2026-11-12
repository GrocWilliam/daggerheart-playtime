<script lang="ts">
	import { translate, type Lang } from '$lib/i18n';
	import Help from './Help.svelte';

	let { conditions, lang }: { conditions: Record<string, boolean>; lang: Lang } = $props();
	const t = (key: string) => translate(lang, key);
</script>

<div>
	{#if conditions.vulnerable}<span class="inline-block rounded-[999px] px-[0.6rem] text-[0.875rem] text-bg bg-danger" data-testid="condition-vulnerable">{t('badge.vulnerable')}</span><Help id="vulnerable" name={t('badge.vulnerable')} {lang} />{/if}
	{#if conditions.restrained}<span class="inline-block rounded-[999px] px-[0.6rem] text-[0.875rem] text-bg bg-accent" data-testid="condition-restrained">{t('badge.restrained')}</span><Help id="restrained" name={t('badge.restrained')} {lang} />{/if}
	{#if conditions.hidden}<span class="inline-block rounded-[999px] px-[0.6rem] text-[0.875rem] text-bg bg-calm" data-testid="condition-hidden">{t('badge.hidden')}</span><Help id="hidden" name={t('badge.hidden')} {lang} />{/if}
</div>
