<script lang="ts">
	import { translate } from '$lib/i18n';
	import Help from '$lib/components/Help.svelte';
	let { data, form } = $props();
	const t = (key: string) => translate(data.lang, key);
	const badge: Record<string, string> = { planned: 'bg-muted', current: 'bg-accent', done: 'bg-calm' };
</script>

<svelte:head><title>{t('scenario.title')} – {t('home.title')}</title></svelte:head>

<p><a href="/campaigns/{data.campaignId}" data-testid="back">{t('scenario.back')}</a></p>
<h1>{t('scenario.title')}</h1>

{#if form?.error}<p role="alert">{t(form.error)}</p>{/if}

<h2>{t('scenario.add')}</h2>
<form method="POST" action="?/add">
	<label>{t('scenario.sceneTitle')} <input name="title" required maxlength="100" /></label>
	<label>{t('scenario.notes')} <textarea name="notes" maxlength="5000"></textarea></label>
	<label>
		{t('scenario.environment')}
		<select name="environmentId">
			<option value="">{t('scenario.noEnvironment')}</option>
			{#each data.environments as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
		</select>
	</label>
	<button type="submit">{t('scenario.add')}</button>
</form>

{#each data.scenes as s, i (s.id)}
	<article class="mb-4 rounded-[0.5rem] border-2 border-solid p-3 {s.status === 'current' ? 'border-accent' : 'border-muted'}"
		data-testid="scene" data-status={s.status} aria-current={s.status === 'current' ? 'true' : undefined}>
		<h3>
			{s.title}
			<span class="inline-block rounded-[999px] px-[0.6rem] text-[0.875rem] text-bg {badge[s.status]}" data-testid="scene-status">{t(`scenario.status.${s.status}`)}</span>
		</h3>
		{#if s.notes}<p class="whitespace-pre-line">{s.notes}</p>{/if}
		{#if s.environment}
			{@const env = s.environment}
			<div data-testid="scene-environment">
				<p><strong lang="en">{env.name}</strong>
					<Help id="environment" name={env.name} lang={data.lang} en={env.features} /></p>
				<ul class="list-none pl-0!">
					<li>{t('scenario.env.type')}: <span lang="en">{env.type}</span></li>
					<li>{t('scenario.env.difficulty')}: {env.difficulty}</li>
					<li>{t('scenario.env.impulses')}: <span lang="en">{env.impulses}</span></li>
				</ul>
			</div>
		{/if}
		<div class="flex flex-wrap gap-2">
			<form class="mb-0! bg-transparent! p-0!" method="POST" action="?/move">
				<input type="hidden" name="sceneId" value={s.id} />
				<button type="submit" name="position" value={i - 1} disabled={i === 0}>{t('scenario.moveUp')}</button>
			</form>
			<form class="mb-0! bg-transparent! p-0!" method="POST" action="?/move">
				<input type="hidden" name="sceneId" value={s.id} />
				<button type="submit" name="position" value={i + 1} disabled={i === data.scenes.length - 1}>{t('scenario.moveDown')}</button>
			</form>
			<form class="mb-0! bg-transparent! p-0!" method="POST" action="?/status">
				<input type="hidden" name="sceneId" value={s.id} />
				{#if s.status !== 'current'}<button type="submit" name="status" value="current">{t('scenario.setCurrent')}</button>{/if}
				{#if s.status !== 'done'}<button type="submit" name="status" value="done">{t('scenario.markDone')}</button>{/if}
			</form>
			<form class="mb-0! bg-transparent! p-0!" method="POST" action="?/delete">
				<input type="hidden" name="sceneId" value={s.id} />
				<button type="submit">{t('scenario.delete')}</button>
			</form>
		</div>
		<form method="POST" action="?/edit">
			<input type="hidden" name="sceneId" value={s.id} />
			<label>{t('scenario.sceneTitle')} <input name="title" value={s.title} required maxlength="100" /></label>
			<label>{t('scenario.notes')} <textarea name="notes" maxlength="5000">{s.notes}</textarea></label>
			<label>
				{t('scenario.environment')}
				<select name="environmentId">
					<!-- Labels as attributes keep the option names out of the scene's text content. -->
					<option value="" selected={!s.environmentId} label={t('scenario.noEnvironment')}></option>
					{#each data.environments as o (o.id)}<option value={o.id} selected={o.id === s.environmentId} label={o.name}></option>{/each}
				</select>
			</label>
			<button type="submit">{t('scenario.save')}</button>
		</form>
	</article>
{:else}
	<p>{t('scenario.none')}</p>
{/each}
