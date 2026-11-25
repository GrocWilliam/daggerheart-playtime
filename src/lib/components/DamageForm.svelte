<script lang="ts">
	import { enhance } from '$app/forms';
	import { busy } from '$lib/forms/busy';
	import { translate, type Lang } from '$lib/i18n';

	// Two rows in one form: the Minor/Major/Severe quick buttons (no `type`, so `button[type=submit]` is only Apply),
	// then the free amount with its label, "use armor" and Apply.
	let { action, characterId = undefined, lang, major, severe }: { action: string; characterId?: string; lang: Lang; major: number; severe: number } = $props();
	const t = (key: string, params?: Record<string, string | number>) => translate(lang, key, params);
</script>

<form use:enhance={busy} class="flex flex-col gap-0.5" method="POST" {action} aria-label={t('damage.label')}>
	{#if characterId}<input type="hidden" name="characterId" value={characterId} />{/if}
	<div class="flex flex-wrap gap-2">
		<button class="btn-secondary" name="quick" value="1" formnovalidate data-testid="damage-minor">{t('damage.minor')}</button>
		<button class="btn-secondary" name="quick" value={major} formnovalidate data-testid="damage-major">{t('damage.major', { major })}</button>
		<button class="btn-secondary" name="quick" value={severe} formnovalidate data-testid="damage-severe">{t('damage.severe', { severe })}</button>
	</div>
	<div class="flex flex-wrap items-end gap-2">
		<label class="mb-0!"><span class="block text-[0.875rem] leading-none">{t('damage.other')}</span><input class="mt-0! w-[5rem]! min-w-0!" type="number" name="amount" min="0" required /></label>
		<label class="mb-0!"><input type="checkbox" name="useArmor" /> {t('damage.useArmor')}</label>
		<button class="btn-primary" type="submit">{t('damage.apply')}</button>
	</div>
</form>
