<script setup lang="ts">
import { onMounted } from '@vue/runtime-core';
import { ref } from '@vue/reactivity';
import { decode } from '../transform';
const data = ref<ImageData | null>(null);

async function load() {
	const resp = await fetch('./api/board');
	const buffer = await resp.arrayBuffer();
	data.value = decode(buffer);
}
onMounted(load);
</script>

<script lang="ts">
// @ts-ignore
import MyCanvas from './my-canvas.vue';
export default {
	components: {
		MyCanvas,
	},
}
</script>

<template>
	<MyCanvas v-if="data" :data="data"></MyCanvas>
	<p v-else>Loading...</p>
</template>