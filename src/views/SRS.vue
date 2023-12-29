<template>
     <var-button @click="initRTC">推流</var-button>
     <var-button @click="changeMedia">切换视频源</var-button>
</template>
    
<script setup>
import { ref } from 'vue';
import axios from 'axios';
import { $msg } from '../utils/js/message';

let log = console.log
let pc = ref(null)
let localStream = null
let srcServerAPIUrl = 'http://127.0.0.1:1985/'
let srcServerRTCUrl = 'webrtc://127.0.0.1:1985/live/'
let srcServerFlvUrl = 'http://127.0.0.1:1985/live/'

function getLocalUserMedia() {
    if(window.stream) {
        window.stream.getTracks().forEach(track => {
            track.stop()
        })
    }
    return navigator.mediaDevices.getDisplayMedia().catch(err => {
        log(err)
    })
}

async function initRTC() {
    localStream = await getLocalUserMedia()
    pc.value = new RTCPeerConnection()

    pc.value.addTransceiver("audio", { direction: "sendonly" })
    pc.value.addTransceiver("video", { direction: "sendonly" })

    localStream.getTracks().forEach(track => {
        pc.value.addTrack(track)
    })

    let offer = await pc.value.createOffer()
    await pc.value.setLocalDescription(offer)
    sendSRSrequest('localStream', offer)
}

function sendSRSrequest(streamId, offer) {
    let data = {
        api: srcServerAPIUrl + 'rtc/v1/publish/',
        streamurl: srcServerRTCUrl + streamId,
        sdp: offer.sdp
    }

    axios.post(srcServerAPIUrl + 'rtc/v1/publish/', data).then(async res => {
        res = res.data
        log(res)
        if(res.code === 0) {
            await pc.value.setRemoteDescription(new RTCSessionDescription({type: 'answer', sdp: res.sdp}))

        }
    }).catch(err => {
        log(err)
    })
}

async function changeMedia() {
    if(!pc.value) {
        return $msg("warning", "请先推流！")
    }
    let replaceStream = await getLocalUserMedia()

    for(const s of localStream.getTracks()) {
        s.stop()
    }

    localStream = replaceStream
    
    const [videotrack] = replaceStream.getVideoTracks()

    let sender = pc.value.getSenders()
    let send = sender.find(s => s.track && s.track.kind === 'video')

    send.replaceTrack(videotrack)
}



</script>
    
<style>
    
</style>