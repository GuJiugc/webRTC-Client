<template>
  <div class="container">
      <header class="header">
      ManyToMany 会议
    </header>
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
        <div>
          <!-- <var-button type="primary" @click="changeMedia">切换</var-button> -->
        </div>
        <div>
          <var-input v-model="chatIpt"></var-input>
          <var-button type="success" @click="sendChat">发送信息</var-button>
        </div>
      </div>

      <div class="meetingContainer">
        <div class="meetingtItem" v-for="(item) in otherUserList" :key="item.userId">
          <div>{{ item.nickName }}:</div>
          <video :id="item.userId + 'Ref'" width="300"></video>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { io } from "socket.io-client";
import { v4 as uuidv4 } from 'uuid';
import { $msg } from '../utils/js/message.js'

var localVideoRef = ref()

var userId = uuidv4()
var nickName = ref('')
var roomId = ref('')
var ServerUrl = 'ws://localhost:18080'
var socket = ref()
var userInfo = ref({})
var roomList = ref([]) // 房间里的所有用户
var channel = ref()
let chatIpt = ref('')
let localStream = null
let meetingUserMap = new Map()

onMounted(() => {
  initLocalStream()
})

const selfUserInfo = computed(() => {
  return roomList.value.find(v => v.userId === userId)
})

// 一个计算属性 ref
const otherUserList = computed(() => {
  return roomList.value.filter(v => v.userId !== userId)
})

watch(otherUserList, (val) => {
  for(var i = 0;i < val.length;i++) {
    if(val[i].joinTime > selfUserInfo.value.joinTime) {
      console.log(777)
      initLocalRTC(userId, val[i].userId)
    }
  }
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


  socket.value.on('msg',(data) => {
    if(data['type'] === 'join' || data['type'] === 'leave') {
      $msg('success', data.msg)
      socket.value.emit("roomUserList", { roomId: roomId.value })
    }

    if(data['type'] === 'offer') {
        log('offer')
        onRemoteOffer(data.data.userId, data.data.offer)
    }

    if(data['type'] === 'answer') {
        log('answer')
      onRemoteAnswer(data.data.userId, data.data.answer)
    }

    if(data['type'] === 'candidate') {
        log('candidate')
      let lrtc = meetingUserMap.get(userId + '-' + data.data.userId)
      lrtc.addIceCandidate(data.data.candidate)
    }
  })

  
}

async function initLocalStream() {
  localStream = await getShareSqeenStream()

    // 设置本地媒体流
    setVideoStream(localVideoRef, localStream)
}

async function initLocalRTC(localUid, remoteUid) {
  if(meetingUserMap.has(localUid + '-' + remoteUid)) return  
  let lrtc = new RTCPeerConnection()
  console.log(lrtc)
  meetingUserMap.set(localUid + '-' + remoteUid, lrtc)

    // 回调监听
  onPcEvent(lrtc, localUid, remoteUid)

  // 获取本地媒体流
  let stream = localStream
  for(const s of stream.getTracks()) {
    lrtc.addTrack(s)
  }

  // 创建offer
  let offer = await lrtc.createOffer()

  // 设置offer本地描述
  await lrtc.setLocalDescription(offer)

  // 发送offer给被呼叫端
  let params = {
    targetUid: remoteUid,
    userId: localUid,
    offer: offer
  }
  socket.value.emit('offer', params)
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



function onPcEvent(pc, localUid, remoteUid) {
  // channel.value = pc.createDataChannel("chat")
  // 设置远端媒体流
  pc.ontrack = function(event) {
    setRemoteVideoStream(remoteUid + 'Ref', event.track)
  }

  pc.onnegotiationneeded = function(e) {
    log('重新协商')
  }

  // pc.ondatachannel = function(ev) {
  //   log('datachannel 创建成功!')
  //   ev.channel.onopen = function() {
  //       console.log('Data channel ------------open----------------');
  //     };
  //     ev.channel.onmessage = function(data) {
  //       console.log('Data channel ------------msg----------------',data);
  //     };
  //     ev.channel.onclose = function() {
  //       console.log('Data channel ------------close----------------');
  //     };
  // }

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
    if(meetingUserMap.has(userId + '-' + fromUid)) return
    let lrtc = new RTCPeerConnection()

    meetingUserMap.set(userId + '-' + fromUid, lrtc)

    // 回调监听
    onPcEvent(lrtc, userId, fromUid)

    for(const s of localStream.getTracks()) {
      lrtc.addTrack(s)
    }

    await lrtc.setRemoteDescription(offer)
    // 创建answer
    let answer = await lrtc.createAnswer()
    
    // 设置localDescription
    await lrtc.setLocalDescription(answer)

    // 将answer发送给fromUid
    let params = {targetUid: fromUid, userId, answer}
    socket.value.emit('answer', params)
}

// 接到answer
async function onRemoteAnswer(fromUid, answer) {
  let lrtc = meetingUserMap.get(userId + '-' + fromUid)
  await lrtc.setRemoteDescription(answer)
}

// 切换分享流
async function changeMedia() {
  const senders = localRtcPc.value.getSenders()
  let stream = await getShareSqeenStream()
  const [videoTrack] = stream.getVideoTracks()
  const send = senders.find(s => s.track.kind === 'video')
  send.replaceTrack(videoTrack)
  let oldStream = localVideoRef.value.srcObject
  for(const s of oldStream.getTracks()) {
    s.stop()
  }
  localVideoRef.value.srcObject = stream
  localVideoRef.value.play()
}

// 通过信道发送信息
function sendChat() {
  console.log('已发送')
  channel.value.send(chatIpt.value)
}

</script>

<style lang="less" scoped>
.container {
  margin: auto;
}

.header {
  font-size: 18px;
  font-weight: 700;
  text-align: center;
}

.iptContainer {
  width: 300px;
  overflow: hidden;
}

.meetingContainer {
  display: flex;
  .meetingtItem {
    border: 1px solid black;
    padding: 10px;
  }
}
</style>
