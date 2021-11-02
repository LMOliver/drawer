<script setup lang="ts">
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
import { onMounted } from '@vue/runtime-core';
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