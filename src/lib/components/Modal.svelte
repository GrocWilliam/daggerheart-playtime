<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { translate, type Lang } from '$lib/i18n';

	let { kind, title, lang, children }: { kind: string; title: string; lang: Lang; children: Snippet } = $props();

	let dialog: HTMLDialogElement | undefined = $state();
	let opener: HTMLAnchorElement | undefined = $state();

	const href = (u: URL, add: boolean): string => {
		const params = new URLSearchParams(u.searchParams);
		if (add) params.set('new', kind);
		else params.delete('new');
		const q = params.toString();
		return u.pathname + (q ? `?${q}` : '');
	};
	const openHref = $derived(href(page.url, true));
	const closeHref = $derived(href(page.url, false));
	const isOpen = $derived(
		page.url.searchParams.get('new') === kind || (page.form as { modal?: unknown } | null)?.modal === kind
	);
	const titleId = $derived(`modal-${kind}-title`);

	function focusFirst() {
		dialog?.querySelector<HTMLElement>('input, select, textarea')?.focus();
	}
	function show() {
		if (!dialog) return;
		if (dialog.open) dialog.close();
		dialog.showModal();
		focusFirst();
	}

	function onOpen(e: MouseEvent) {
		e.preventDefault();
		show();
	}
	function onCancel(e: MouseEvent) {
		e.preventDefault();
		dialog?.close();
	}
	function onBackdrop(e: MouseEvent) {
		if (e.target === dialog) dialog?.close();
	}
	function onClose() {
		opener?.focus();
		if (page.url.searchParams.has('new')) {
			goto(closeHref, { replaceState: true, noScroll: true, keepFocus: true });
		}
	}

	onMount(() => {
		if (isOpen) tick().then(show);
	});
</script>

<a data-testid="new-{kind}" href={openHref} bind:this={opener} onclick={onOpen}>{title}</a>

<dialog
	bind:this={dialog}
	data-testid="modal-{kind}"
	aria-labelledby={titleId}
	open={isOpen}
	onclick={onBackdrop}
	onclose={onClose}
	class="m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto rounded-none bg-surface p-0 text-text backdrop:bg-bg backdrop:opacity-80 min-[600px]:m-auto min-[600px]:h-auto min-[600px]:max-h-[90dvh] min-[600px]:max-w-[32rem] min-[600px]:rounded-[0.5rem] min-[600px]:border-[3px] min-[600px]:border-double min-[600px]:border-accent"
>
	<div class="p-3">
		<h2 id={titleId} class="mt-0">{title}</h2>
		{@render children()}
		<a data-testid="modal-cancel" href={closeHref} onclick={onCancel}>{translate(lang, 'modal.cancel')}</a>
	</div>
</dialog>
