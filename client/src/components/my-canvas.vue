<script setup lang="ts">
import { onMounted, toRefs, watch } from '@vue/runtime-core';
import { generateID } from '../utils';
const props = defineProps<{
	data: ImageData;
}>();
const { data } = toRefs(props);
const id = generateID();
function update() {
	// console.log(data.value);
	const { height, width } = data.value;
	const element = document.getElementById(id) as HTMLCanvasElement;
	element.height = height;
	element.width = width;
	const ctx = element.getContext('2d');
	ctx.putImageData(data.value, 0, 0);
}
onMounted(() => {
	update();
});
watch(data, update);
</script>

<template>
	<canvas class="pixelated" :id="id"></canvas>
</template>

<style>
.pixelated {
	image-rendering: pixelated;
}
</style>
