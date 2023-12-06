<template>
    <div class="iptContainer">
      <div>
        <var-input placeholder="请输入昵称" v-model="nickName" clearable/>
      </div>
      <div>
        <var-input placeholder="请输入房间号" v-model="roomId" clearable/>
      </div>
      <var-button style="margin-top: 10px;float: right;" type="primary" @click="init">加入房间</var-button>
    </div>

    <div>
      <div>
        <div>本地：</div>
        <video ref="localVideoRef" width="500"></video>
      </div>

      <div v-for="(item) in otherUserList" :key="item.userId">
        <div>{{ item.nickName }}:</div>
        <var-button style="margin-top: 10px;" type="primary" @click="call(item)">发起通话</var-button>
        <video id="remoteVideoRef" width="500"></video>
      </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { io } from "socket.io-client";
import { v4 as uuidv4 } from 'uuid';
import { $msg } from '../utils/js/message.js'

var localVideoRef = ref()
var remoteVideoRef = ref()
var flag = ref(false)

var userId = uuidv4()
var nickName = ref('')
var roomId = ref('')
var ServerUrl = 'ws://localhost:18080'
var socket = ref()
var userInfo = ref({})
var roomList = ref([]) // 房间里的所有用户
var localRtcPc = ref()
var channel = ref()
let delayFn = []

// 一个计算属性 ref
const otherUserList = computed(() => {
  return roomList.value.filter(v => v.userId !== userId)
})


var log = console.log

function getShareSqeenStream() {
  return navigator.mediaDevices.getDisplayMedia({
    audio: true
  })
}

async function init() {
  if(!nickName.value) {
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

  socket.value.on('roomUserList', data => {
    roomList.value = data
  })

  let setRemoteDelay = function(){}

  socket.value.on('msg',(data) => {
    if(data['type'] === 'join' || data['type'] === 'leave') {
      $msg('success', data.msg)
      socket.value.emit("roomUserList", { roomId: roomId.value })
    }

    if(data['type'] === 'call') {
      initCalleeInfo(userId, data.data.userId).then(() => {
        setRemoteDelay()
      })
    }

    if(data['type'] === 'offer') {
      if(flag.value) {
        onRemoteOffer(data.data.userId, data.data.offer)
      }else{
        setRemoteDelay = () => {
          onRemoteOffer(data.data.userId, data.data.offer)
        }
      }
    }

    if(data['type'] === 'answer') {
      onRemoteAnswer(data.data.userId, data.data.answer)
    }

    if(data['type'] === 'candidate') {
      if(localRtcPc.value.remoteDescription) {
        localRtcPc.value.addIceCandidate(data.data.candidate)
      }else{
        delayFn.push(() => {
          localRtcPc.value.addIceCandidate(data.data.candidate)
        })
      }
          
    }
  })

  
}
// 发起通话
function call(item) {
  initCallerInfo(userId, item.userId)
  let params = {targetUid: item.userId, userId}
  socket.value.emit('call', params)
}

async function initCallerInfo(callerId, calleeId) {
  localRtcPc.value = new RTCPeerConnection()
    // 回调监听
    onPcEvent(localRtcPc.value, callerId, calleeId)
  // 获取本地媒体流
  let stream = await getShareSqeenStream()
  for(const s of stream.getTracks()) {
    localRtcPc.value.addTrack(s)
  }

  // 设置本地媒体流
  setVideoStream(localVideoRef, stream)



  // 创建offer
  let offer = await localRtcPc.value.createOffer()

  // 设置offer本地描述
  await localRtcPc.value.setLocalDescription(offer)

  // 发送offer给被呼叫端
  let params = {
    targetUid: calleeId,
    userId: callerId,
    offer: offer
  }
  socket.value.emit('offer', params)
}

async function initCalleeInfo(localUid, remoteUid) {
  localRtcPc.value = new RTCPeerConnection()

    // 回调监听
    onPcEvent(localRtcPc.value, localUid, remoteUid)

  // 获取本地媒体流
  let stream = await getShareSqeenStream()
  for(const s of stream.getTracks()) {
    localRtcPc.value.addTrack(s)
  }

  // 设置本地媒体流
  setVideoStream(localVideoRef, stream)

  flag.value = true
}

function onPcEvent(pc, localUid, remoteUid) {
  channel.value = pc.createDataChannel("chat")
  // 设置远端媒体流
  pc.ontrack = function(event) {
    setRemoteVideoStream('remoteVideoRef', event.track)
  }

  pc.onnegotiationneeded = function(e) {
    log('重新协商')
  }

  pc.ondatachannel = function(e) {
    log('datachannel 创建成功!')
  }

  // 创建icecandidate
  pc.onicecandidate = function(e) {
    if(e.candidate) {
      socket.value.emit('candidate', {targetUid: remoteUid, userId: localUid, candidate: e.candidate})
    }else{
      log('此次协商中，没有更多的候选')
    }
  }
}

// 设置本地媒体流
function setVideoStream(domId, newStream) {
  let video = domId.value
  let stream = video.srcObject
  if (stream) {
    stream.getAudioTracks().forEach((e) => {
      stream.removeTrack()
    })
    stream.getVideoTracks().forEach((e) => {
      stream.removeTrack()
    })
  }
  video.srcObject = newStream
	video.muted = true
  video.play()
}

// 设置远端媒体流
function setRemoteVideoStream(domId, track) {
  let video = document.getElementById(domId)
  let stream = video.srcObject
  if(stream){
    stream.addTrack(track)
  }else{
    let newStream = new MediaStream()
    newStream.addTrack(track)
    video.srcObject =newStream
    video.muted = true
    video.play()
  }
}

// 接到offer
async function onRemoteOffer(fromUid, offer) {
    await localRtcPc.value.setRemoteDescription(offer)
    delayFn.forEach(v => {
      v()
    })
    // 创建answer
    let answer = await localRtcPc.value.createAnswer()
    
    // 设置localDescription
    await localRtcPc.value.setLocalDescription(answer)

    // 将answer发送给fromUid
    let params = {targetUid: fromUid, userId, answer}
    socket.value.emit('answer', params)
}

// 接到answer
async function onRemoteAnswer(fromUid, answer) {
  await localRtcPc.value.setRemoteDescription(answer)
}


</script>

<style lang="less" scoped>
.iptContainer {
  width: 300px;
  overflow: hidden;
}
</style>
