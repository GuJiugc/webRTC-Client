<template>
    <div class="streamParamsDiaContainer">
        <div>
            <div class="paramItem">
                <div class="paramItemTit">分辨率<var-switch v-model="form.aspectRatio.open" /></div>
                <var-input type="number" variant="outlined" placeholder="请输入" clearable v-model="form.aspectRatio.value" />
            </div>
            <div class="paramItem">
                <div class="paramItemTit">FPS<var-switch v-model="form.frameRate.open" /></div>
                <var-input type="number" variant="outlined" placeholder="请输入" clearable v-model="form.frameRate.value" />
            </div>
            <div class="paramItem">
                <div class="paramItemTit">帧高度<var-switch v-model="form.height.open" /></div>
                <var-input type="number" variant="outlined" placeholder="请输入" clearable v-model="form.height.value" />
            </div>
            <div class="paramItem">
                <div class="paramItemTit">帧宽度<var-switch v-model="form.width.open" /></div>
                <var-input type="number" variant="outlined" placeholder="请输入" clearable v-model="form.width.value" />
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, reactive, onMounted } from 'vue';

let form = reactive({
    aspectRatio: {
        value:  '',
        open: false
    },
    frameRate: {
        value:  '',
        open: false
    },
    height: {
        value:  '',
        open: false
    },
    width: {
        value:  '',
        open: false
    }
})

let paramComputed = computed(() => {
    let xForm = {}
    for(var k in form) {
        if(Object.prototype.hasOwnProperty.call(form, k) && form[k].open) {
            xForm[k] = form[k].value
        }
    }
    return xForm
})

const props = defineProps({
    streamParam: {
        type: Object,
        default: () => {}
    }
})

onMounted(() => {
    form.aspectRatio.value = props.streamParam.aspectRatio
    form.frameRate.value = props.streamParam.frameRate
    form.height.value = props.streamParam.height
    form.width.value = props.streamParam.width
})

defineExpose({
    paramComputed
})

</script>

<style lang='less' scoped>
.streamParamsDiaContainer {
    padding: 10px;
}

.paramItem {
    margin-top: 10px;
    .paramItemTit {
        font-size: 18px;
        font-weight: 700;
        line-height: 2;
        margin-bottom: 10px;
    }
}
</style>