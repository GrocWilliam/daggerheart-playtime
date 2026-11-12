<script lang="ts">
	import { enhance } from '$app/forms';
	import { busy } from '$lib/forms/busy';
	import { translate, type Lang } from '$lib/i18n';

	// The damage form on one row: amount, "use armor", submit. Labels lose the global bottom margin so the
	// input and the button share their bottom edge.
	let { action, characterId = undefined, lang }: { action: string; characterId?: string; lang: Lang } = $props();
	const t = (key: string) => translate(lang, key);
</script>

<form use:enhance={busy} class="flex flex-wrap items-end gap-2" method="POST" {action}>
	{#if characterId}<input type="hidden" name="characterId" value={characterId} />{/if}
	<label class="mb-0!">{t('damage.label')} <input class="w-[5rem]! min-w-0!" type="number" name="amount" min="0" required /></label>
	<label class="mb-0!"><input type="checkbox" name="useArmor" /> {t('damage.useArmor')}</label>
	<button type="submit">{t('damage.apply')}</button>
</form>
