<template>
    <var-button @click="initRTC">
        拉流播放
    </var-button>
    <div>
        <video style="object-fit: fill;width: 600px;" ref="localRef"></video>
    </div>
</template>

<script setup>
import { ref } from 'vue'
import axios from 'axios'

let log = console.log
let pc = ref(null)
let localRef = ref(null)
let localStream = ref(null)
let srcServerAPIUrl = 'http://127.0.0.1:1985/'
let srcServerRTCUrl = 'webrtc://127.0.0.1:1985/live/'
let srcServerFlvUrl = 'http://127.0.0.1:1985/live/'

async function initRTC() {
    pc.value = new RTCPeerConnection()

    pc.value.addTransceiver("audio", {direction: "recvonly"})
    pc.value.addTransceiver("video", {direction: "recvonly"})

    pc.value.ontrack = function(e) {
        setDomVideoTrick(e.track)
    }

    let offer = await pc.value.createOffer()

    await pc.value.setLocalDescription(offer)

    sendSRSrequest("localStream", offer)
}

function sendSRSrequest(streamId, offer) {
    let data = {
        "api": srcServerAPIUrl+"rtc/v1/play/",
        "streamurl": srcServerRTCUrl+streamId,
        "sdp": offer.sdp
    }

    axios.post(srcServerAPIUrl+"rtc/v1/play/", data).then(async res => {
        res = res.data
        log(res)
        if(res.code === 0) {
            await pc.value.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: res.sdp }))
        }
    }).catch(err => {
        log('拉流异常', err)
    })
}

function setDomVideoTrick(track) {
    let video = localRef.value
    let stream = video.srcObject
    if(stream) {
        stream.addTrack(track)
    }else{
        stream = new MediaStream()
        stream.addTrack(track)
        video.srcObject = stream
        video.controls = true
        video.autoplay = true
        video.play()
    }
}
</script>

<style></style>
