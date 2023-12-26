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
          <var-button type="primary" @click="changeMedia">切换</var-button>
          <var-button type="danger" v-if="isRunning" @click="changeStreamStatus(false)">暂停</var-button>
          <var-button type="warning" v-if="!isRunning" @click="changeStreamStatus(true)">继续</var-button>
          <var-button type="primary" @click="showParamDia">视频属性设置</var-button>
          <var-button type="primary" @click="getStatsInfo">查看stats</var-button>
        </div>
      </div>
      <div class="headerTit">会议列表</div>
      <div class="meetingContainer">
        <div class="meetingtItem" v-for="(item) in otherUserList" :key="item.userId">
          <div>{{ item.nickName }}:</div>
          <div>{{ item.bitrate }}</div>
          <video @click="getRTCStreamParams(item.userId)" :id="item.userId + 'Ref'" width="300"></video>
        </div>
      </div>

      <div class="headerTit">消息列表</div>
        <div class="sendMsgBox">
          <var-input v-model="chatIpt" style="width: 300px;"></var-input>
          <var-button type="success" @click="sendChat">发送信息</var-button>
        </div>
        <div class="messageContainer">
          <div class="messageItem" v-for="(item, index) in messageList" :key="index">
            {{ item }}
          </div>
        </div>
    </div>

    <var-dialog title="属性设置" v-model:show="dialogVisible" width="500px"
    :cancel-button="false" @confirm="changeStreamParams">
      <StreamParamsCom v-if="dialogVisible" ref="StreamParamsComRef" :streamParam="streamParam" />
    </var-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, reactive } from 'vue'
import { io } from "socket.io-client";
import { v4 as uuidv4 } from 'uuid';
import { $msg } from '../utils/js/message.js'
import StreamParamsCom from '../components/streamParamsCom.vue'

var localVideoRef = ref()

var userId = uuidv4()
var nickName = ref('')
var roomId = ref('')
var ServerUrl = 'ws://localhost:18080'
var socket = ref()
var userInfo = ref({})
var roomList = ref([]) // 房间里的所有用户
let chatIpt = ref('')
let localStream = null
let meetingUserMap = new Map()
let meetingChannelMap = new Map()
let pendPromise = null
let messageList = reactive([])
let isRunning = ref(false) // 控制视频流的暂停与继续接通
let dialogVisible = ref(false)
let streamParam = ref({})
let StreamParamsComRef = ref(null)
let rtcPcParams = {
					iceTransportPolicy: 'relay', //强制走中继
					iceServers: [
						{url: 'turn:192.168.124.128:3478', username:'bia', credential:'bia1'},
						]
				}

function getStreamPromise() {
  if(!pendPromise) {
    isRunning.value = true
    pendPromise = new Promise((resolve,reject) => {
      initLocalStream().then(() => {
        resolve()
      })
    })
  } 
  return pendPromise
}

const selfUserInfo = computed(() => {
  return roomList.value.find(v => v.userId === userId)
})

// 一个计算属性 ref
const otherUserList = computed(() =>
  {
    return roomList.value.filter(v => v.userId !== userId)
  }
)

watch(otherUserList, async (val) => {
  await getStreamPromise()

  for(var i = 0;i < val.length;i++) {
    if(val[i].joinTime > selfUserInfo.value.joinTime) {
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
  let lrtc = new RTCPeerConnection(rtcPcParams)
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

function onPcEvent(pc, localUid, remoteUid) {
  if(!meetingChannelMap.has(localUid + '-' + remoteUid)) {
    meetingChannelMap.set(localUid + '-' + remoteUid, pc.createDataChannel(localUid + '-' + remoteUid))

  }
  // 设置远端媒体流
  pc.ontrack = function(event) {
    setRemoteVideoStream(remoteUid + 'Ref', event.track)
  }

  pc.onnegotiationneeded = function(e) {
    log('重新协商')
  }

  pc.ondatachannel = function(ev) {
    log('datachannel 创建成功!')
    ev.channel.onopen = function() {
        console.log('Data channel ------------open----------------');
      };
      ev.channel.onmessage = function(data) {
        console.log('Data channel ------------msg----------------',data);
        messageList.push(data.data)
      };
      ev.channel.onclose = function() {
        console.log('Data channel ------------close----------------');
      };
  }

  // 创建icecandidate
  pc.onicecandidate = function(e) {
    if(e.candidate) {
  log('onicecandidate-candidate')
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
    let lrtc = new RTCPeerConnection(rtcPcParams)

    meetingUserMap.set(userId + '-' + fromUid, lrtc)

    await getStreamPromise()

    // 回调监听
    onPcEvent(lrtc, userId, fromUid)


    for(const s of localStream.getTracks()) {
      lrtc.addTrack(s)
    }
  log('description-offer')
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
  log('description-answer')
  await lrtc.setRemoteDescription(answer)
}

// 切换分享流
async function changeMedia() {
  let stream = await getShareSqeenStream()
  let oldStream = localVideoRef.value.srcObject
  for(const s of oldStream.getTracks()) {
    s.stop()
  }
  localVideoRef.value.srcObject = stream
  localVideoRef.value.play()
  for(var i = 0;i < otherUserList.value.length;i++) {
    let lrtc = meetingUserMap.get(userId + '-' + otherUserList.value[i].userId)
    const senders = lrtc.getSenders()
    const [videoTrack] = stream.getVideoTracks()
    const send = senders.find(s => s.track.kind === 'video')
    send.replaceTrack(videoTrack)
  }
}

function changeStreamStatus(flag) {
  isRunning.value = flag
  for(var i = 0;i < otherUserList.value.length;i++) {
    let lrtc = meetingUserMap.get(userId + '-' + otherUserList.value[i].userId)
    const senders = lrtc.getSenders()
    const send = senders.find(s => s.track.kind === 'video')
    send.track.enabled = flag
  }
}

function showParamDia() {
  let videoTrack = localStream.getVideoTracks()[0]
  streamParam.value = videoTrack.getSettings()
  dialogVisible.value = true
}

async function changeStreamParams() {
  for(var i = 0;i < otherUserList.value.length;i++) {
    let lrtc = meetingUserMap.get(userId + '-' + otherUserList.value[i].userId)
    const senders = lrtc.getSenders()
    const send = senders.find(s => s.track.kind === 'video')
    //强制约束
    await send.track.applyConstraints(StreamParamsComRef.value.paramComputed);
  }
}

// 通过信道发送信息
function sendChat() {
  meetingChannelMap.forEach(channel => {
    channel.send(nickName.value + ':' + chatIpt.value)
  })
  messageList.push(nickName.value + ':' + chatIpt.value)
  chatIpt.value = ''
}


function getRTCStreamParams(remoteId) {
  let lrtc = meetingUserMap.get(userId + '-' + remoteId)
  const receivers = lrtc.getReceivers();
  const receive = receivers.find((s) => s.track.kind === 'video')
  let params = receive.track.getSettings()
  log(params)
}

let statsTimerMap = new Map() // 用于存储定时获取带宽信息的定时器
let lastPeerStatsMap = new Map() // 用于存储从rtc上获取的stats信息

// 获取入口带宽，出口带宽，显示网络信息
function getStatsInfo() {
  otherUserList.value.forEach(u => {
    let rtc = meetingUserMap.get(userId + '-' + u.userId)
    if(rtc) {
      getNetStats(u.userId, rtc)
    }
  })
}

function getNetStats(uid, pc) {
  let timer = statsTimerMap.get(uid)
  if(timer) {
    clearInterval(timer)
    statsTimerMap.delete(uid)
  }else{
    timer = setInterval(() => {
      calculateReceiveBitrate(uid, pc)
    }, 2000)
    statsTimerMap.set(uid, timer)
  }
}

function calculateReceiveBitrate(uid, pc) {
  let lastResultForStats = lastPeerStatsMap.get(uid)
  pc.getStats().then(res => {
    res.forEach(report => {
      let bytes;
      let headerBytes;
      let packets;

      if(report.type === 'inbound-rtp' && report.kind === 'video') {
        const now = report.timestamp;
        bytes = report.bytesReceived;
        headerBytes = report.headerBytesReceived;
        packets = report.packetsReceived;

        if(lastResultForStats && lastResultForStats.has(report.id)) {
          let bf = bytes - lastResultForStats.get(report.id).bytesReceived
          let hbf = headerBytes - lastResultForStats.get(report.id).headerBytesReceived
          let pacf = packets - lastResultForStats.get(report.id).packetsReceived
          let t = now - lastResultForStats.get(report.id).timestamp

          const bitrate = (8 * bf / t).toFixed(2)
          const headerrate = (8 * hbf / t).toFixed(2)
          const packetrate = Math.floor(1000 * pacf / t)
          otherUserList.value.find(v => v.userId === uid).bitrate = bitrate + 'kbps'
          console.log(`${uid} ==> Bitrate ${bitrate} kbps, overhead ${headerrate} kbps, ${packetrate} packets/second`)
        }
        lastPeerStatsMap.set(uid, res)
      }
    })
  })
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
  min-height: 100px;
  display: flex;
  .meetingtItem {
    border: 1px solid black;
    padding: 10px;
  }
}

.sendMsgBox {
  display: flex;
  align-items: center;
}

.headerTit {
  font-size: 18px;
  font-weight: 700;
}
.messageContainer {
  width: 400px;
}
.messageItem {
  line-height: 2;
  font-size: 18px;
  font-weight: 700;
  border-bottom: 1px solid #ccc;
}

.var-button {
  margin-right: 10px;
}
</style>
