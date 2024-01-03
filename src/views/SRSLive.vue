<template>
  <div class="SRSheader">SRS 直播</div>
  <div class="iptContainer">
    <div>
      <var-input placeholder="请输入昵称" v-model="nickName" clearable />
    </div>
    <div>
      <var-input placeholder="请输入房间号" v-model="roomId" clearable />
    </div>
    <var-radio-group v-model="userType">
      <var-radio :checked-value="0">观众</var-radio>
      <var-radio :checked-value="1">主播</var-radio>
    </var-radio-group>
    <var-button style="margin-top: 10px; float: right" type="primary" @click="init"
      >加入房间</var-button
    >
  </div>
  <div v-if="userType == 1">
    <div>本地</div>
    <video ref="localVideoRef" style="width: 500px"></video>
    <div>
      <var-button style="margin-top: 10px" type="primary" @click="changeMedia"
        >切换视频流</var-button
      >
    </div>
  </div>
  <div v-if="userType == 1">
    <div>连麦画面</div>
      <SRSMeetingPullStream v-if="applyMicUser.userId" :user="applyMicUser" />
    <!-- <video ref="applyMicRef" style="width: 500px"></video> -->
  </div>
  <div class="liveRoom" v-if="userType == 0 && anchor">
      <SRSMeetingPullStream :user="anchor" />
      <div>
        <var-button @click="applyMic" :loading="isLoading">申请连麦</var-button>
      </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import axios from 'axios'
import { io } from 'socket.io-client'
import { v4 as uuidv4 } from 'uuid'
import SRSMeetingPullStream from '@/components/SRSMeetingPullStream.vue'
import { $msg } from '../utils/js/message.js'
import { Dialog } from '@varlet/ui'
import { reactive } from 'vue'

var log = console.log

let nickName = ref('')
let roomId = ref('')
let userType = ref('')
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
let isLoading = ref(false)

const anchor = computed(() => {
  return roomList.value.find((v) => v.userType == 1)
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
      nickName: nickName.value,
      userType: userType.value
    }
  })

  socket.value.on('connect', (e) => {
    log('连接成功')
  })

  socket.value.on('roomUserList', (data) => {
    roomList.value = data
  })

  socket.value.on('msg', async (data) => {
    if (data['type'] === 'join' || data['type'] === 'leave') {
      socket.value.emit('roomUserList', { roomId: roomId.value })
    }else if(data["type"] === "applyMic") {
      let t = await Dialog({
        message: data.msg
      })
      if(t === "confirm") {
        acceptMic(data.data)
      }else{
        refuseMic(data.data)
      }
    }else if(data["type"] === "refuseMic") {
      // 拒绝连麦
      handleRefuseMic(data.msg)
    }else if(data["type"] === "acceptMic") {
      // 接收连麦
      handleAccessMic(data)
    }
  })

  // 是主播则推流
  if(userType.value == 1) {
    initRTCandPushStream()
  }
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

// 申请连麦
function applyMic() {
  isLoading.value = true
  socket.value.emit("applyMic", {
    targetUid: anchor.value.userId,
    applyUid: userId,
    applyNickName: nickName.value
  })
}

// 连麦人信息
let applyMicUser = reactive({})

// 接收连麦
function acceptMic(data) {
  socket.value.emit("acceptMic", { targetUid: data.applyUid, anchorId: userId, anchorNickname: nickName.value })
  applyMicUser.userId = data.applyUid
  applyMicUser.nickName = data.nickName
}

// 拒绝连麦
function refuseMic(data) {
  socket.value.emit("refuseMic", { targetUid: data.applyUid, anchorId: userId, anchorNickname: nickName.value })
}

// 观众端处理拒绝连麦
function handleRefuseMic(msg) {
  isLoading.value = false
  $msg("warning", msg)
}

// 观众端接收到主播接受连麦
async function handleAccessMic(data) {
  isLoading.value = false
  $msg("warning", data.msg)
  log(data)
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

.liveRoom {

}
</style>
