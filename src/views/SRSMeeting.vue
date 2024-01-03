<template>
  <div class="SRSheader">SRS 会议</div>
  <div class="iptContainer">
    <div>
      <var-input placeholder="请输入昵称" v-model="nickName" clearable />
    </div>
    <div>
      <var-input placeholder="请输入房间号" v-model="roomId" clearable />
    </div>
    <var-button style="margin-top: 10px; float: right" type="primary" @click="init"
      >加入房间</var-button
    >
  </div>
  <div>
    <div>本地</div>
    <video ref="localVideoRef" style="width: 500px"></video>
    <div>
      <var-button style="margin-top: 10px" type="primary" @click="changeMedia"
        >切换视频流</var-button
      >
    </div>
  </div>
  <div class="otherVideoContainer">
    <div class="otherVideoItem" v-for="item in otherUserList" :key="item.userId">
      <SRSMeetingPullStream :user="item" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import axios from 'axios'
import { io } from 'socket.io-client'
import { v4 as uuidv4 } from 'uuid'
import SRSMeetingPullStream from '../components/SRSMeetingPullStream.vue'
import { $msg } from '../utils/js/message.js'

var log = console.log

let nickName = ref('')
let roomId = ref('')
var userId = uuidv4()
var ServerUrl = 'ws://localhost:18080'
var socket = ref()
var userInfo = ref({})
var roomList = ref([]) // 房间里的所有用户
let localVideoRef = ref(null)
let srcServerAPIUrl = 'http://127.0.0.1:1985/'
let srcServerRTCUrl = 'webrtc://127.0.0.1:1985/live/'
let srcServerFlvUrl = 'http://127.0.0.1:1985/live/'
let pc = ref(null)
let localStream = null

const selfUserInfo = computed(() => {
  return roomList.value.find((v) => v.userId === userId)
})

// 一个计算属性 ref
const otherUserList = computed(() => {
  return roomList.value.filter((v) => v.userId !== userId)
})

function getShareSqeenStream() {
  return navigator.mediaDevices.getDisplayMedia({
    audio: true
  })
}

async function init() {
  if (!nickName.value) {
    return
  }

  userInfo.value = {
    userId: userId,
    nickName: nickName.value,
    roomId: roomId.value
  }

  socket.value = io(ServerUrl, {
    reconnectionDelayMax: 10000, // 重连超时时间
    query: {
      userId,
      roomId: roomId.value,
      nickName: nickName.value
    }
  })

  socket.value.on('connect', (e) => {
    log('连接成功')
  })

  socket.value.on('roomUserList', (data) => {
    roomList.value = data
  })

  socket.value.on('msg', (data) => {
    if (data['type'] === 'join' || data['type'] === 'leave') {
      socket.value.emit('roomUserList', { roomId: roomId.value })
    }
  })

  initRTCandPushStream()
}

async function initRTCandPushStream() {
  localStream = await getShareSqeenStream()
  pc.value = new RTCPeerConnection()

  pc.value.addTransceiver('audio', { direction: 'sendonly' })
  pc.value.addTransceiver('video', { direction: 'sendonly' })

  localStream.getTracks().forEach((track) => {
    pc.value.addTrack(track)
  })

  let offer = await pc.value.createOffer()
  await pc.value.setLocalDescription(offer)
  sendSRSrequest(userId + 'video', offer)

  setVideoStream(localVideoRef, localStream)
}

function sendSRSrequest(streamId, offer) {
  let data = {
    api: srcServerAPIUrl + 'rtc/v1/publish/',
    streamurl: srcServerRTCUrl + streamId,
    sdp: offer.sdp
  }

  axios
    .post(srcServerAPIUrl + 'rtc/v1/publish/', data)
    .then(async (res) => {
      res = res.data
      log(res)
      if (res.code === 0) {
        await pc.value.setRemoteDescription(
          new RTCSessionDescription({ type: 'answer', sdp: res.sdp })
        )
      }
    })
    .catch((err) => {
      log(err)
    })
}

// 设置本地媒体流
function setVideoStream(domId, newStream) {
  let video = domId.value
  let stream = video.srcObject
  if (stream) {
    for (const s of stream.getTracks()) {
      s.stop()
    }
  }
  video.srcObject = newStream
  video.muted = true
  video.play()
}

async function changeMedia() {
  let replaceStream = await getShareSqeenStream()
  localStream = replaceStream

  setVideoStream(localVideoRef, localStream)

  const [videotrack] = replaceStream.getVideoTracks()

  let sender = pc.value.getSenders()
  let send = sender.find((s) => s.track && s.track.kind === 'video')

  send.replaceTrack(videotrack)
}
</script>

<style lang="less" scoped>
.SRSheader {
  font-weight: 700;
  font-size: 20px;
  text-align: center;
}

.iptContainer {
  width: 300px;
  overflow: hidden;
}

.otherVideoContainer {
  display: flex;
  justify-content: flex-start;
  .otherVideoItem {
    width: 620px;
    margin: 10px;
    border: 1px solid #ccc;
    border-radius: 10px;
  }
}
</style>
