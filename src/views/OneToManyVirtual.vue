<template>
    <div class="container">
      <header class="header">
      OneToMany 直播
    </header>
    <div class="iptContainer">
      <div>
        <var-input placeholder="请输入昵称" v-model="nickName" clearable/>
      </div>
      <div>
        <var-input placeholder="请输入房间号" v-model="roomId" clearable/>
      </div>
      <div>
        <var-radio-group v-model="userType">
          <var-radio :checked-value="0">学生</var-radio>
          <var-radio :checked-value="1">老师</var-radio>
        </var-radio-group>
      </div>
      <var-button type="warning" v-if="userType == 1" @click="publishScreen">开播</var-button>
      <var-button style="margin-top: 10px;float: right;" type="primary" @click="init">加入房间</var-button>
    </div>
    <div>
      <div>
        直播画面:
      </div>
      <video style="border: 1px solid #ccc;border-radius: 10px;margin: 10px;" ref="videoRef" width="500"></video>
      <div>
        算法处理后画面:
      </div>
      <canvas  id="output_canvas" class="output_canvas" style="width: 768px;height: 480px;"></canvas>
    </div>
    <div v-if="userType == 1">
      <var-button type="info" @click="changeMedia">切换分享流</var-button>
    </div>
    <div class="itemContainer">
      <div>学生列表:</div>
      <var-table>
        <thead>
          <tr>
            <th>userId</th>
            <th>昵称</th>
          </tr>
        </thead>
        <tbody>
          <tr  v-for="item in studentList" :key="item.userId">
            <td>{{ item.userId }}</td>
            <td>{{ item.nickName }}</td>
          </tr>
        </tbody>
      </var-table>
    </div>
    
    <div class="itemContainer" v-if="isPublist">
      <div>消息列表</div>
      <div class="barrageInput">
        <var-input v-model="chatIpt" style="width: 200px;" placeholder="请输入"></var-input>
        <var-button text outline type="primary" @click="sendChat">发送</var-button>
      </div>
      <div class="barrageBox">
        <div class="barrageItem" v-for="(item,index) in barrageList" :key="index">{{ item }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { io } from "socket.io-client";
import { v4 as uuidv4 } from 'uuid';
import { $msg } from '../utils/js/message.js'
import { reactive } from 'vue';
import * as SFS from '@mediapipe/selfie_segmentation'

var videoRef = ref()

var userId = uuidv4()
var nickName = ref('')
var roomId = ref('')
var ServerUrl = 'ws://localhost:18080'
var socket = ref()
var userInfo = ref({})
var roomList = ref([]) // 房间里的所有用户
let chatIpt = ref('')
let userType = ref(0) // 默认类型为 学生，老师只能有一个
let localRtcPcList = new Map()
let channelList = new Map()
let screenStream = null
let isPublist = ref(false)
let barrageList = reactive([])

// 算法处理
let selfieSegmentation = null
let image = null
let canvasElement = null
let canvasCtx = null

// 一个计算属性 ref
const studentList = computed(() => {
  return roomList.value.filter(v => v.userType != 1 && v.userId != userId)
})

const teacherInfo = computed(() => {
  return roomList.value.filter(v => v.userType == 1)[0]
})
watch(studentList, (newList) => {
  if(userType.value == 1 && isPublist.value) {
    for(var i = 0;i < newList.length;i++) {
      initPublisherInfo(userId, newList[i].userId)
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
    roomId: roomId.value,
    userType: userType.value
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

  socket.value.on('roomUserList', data => {
    roomList.value = data
  })

  socket.value.on('msg',(data) => {
    if(data['type'] === 'join' || data['type'] === 'leave') {
      $msg('success', data.msg)
      socket.value.emit("roomUserList", { roomId: roomId.value })
      if(data['type'] === 'leave') {
        if(teacherInfo.value && teacherInfo.value.userId) {
          localRtcPcList.delete(teacherInfo.value.userId + '-' + data.data.userId)
          channelList.delete(teacherInfo.value.userId + '-' + data.data.userId)
        }
      }
    }

    // 学生端接到offer，处理
    if(data['type'] === 'offer') {
      console.log(data)
      onRemoteOffer(data.data.teaUid, data.data.stuUid, data.data.offer)
    }

    // 教师端接到answer，处理
    if(data['type'] === 'answer') {
      onRemoteAnswer(data.data.teaUid, data.data.stuUid, data.data.answer)
    }

    // 双方接到candidate
    if(data['type'] === 'candidate') {
        if(userType.value == 1) {
          let stuUid = data.data.userId
          localRtcPcList.get(userId + '-' + stuUid).addIceCandidate(data.data.candidate)
        }else{
          console.log(teacherInfo.value.userId)
          localRtcPcList.get(teacherInfo.value.userId + '-' + userId).addIceCandidate(data.data.candidate)
        }
      }

     if(data['type'] === 'teacherClose') {
        videoRef.value.srcObject = null
     } 

     if(data['type'] === 'sendChat') {
      for(var i = 0;i < studentList.value.length;i++) {
        let stuUid = studentList.value[i].userId
        let channel = channelList.get(userId + '-' + stuUid)
        channel.send(data.msg)
      }
      barrageList.push(data.msg)
     }
  })

  
}

// 开播
async function publishScreen() {
  // 获取本地媒体流
  screenStream = await getShareSqeenStream()

  // 设置算法处理监听器
  virtualBg()

  // 设置本地媒体流
  setVideoStream(videoRef, screenStream)

  // 修改为开播状态
  isPublist.value = true

  for(var i = 0;i < studentList.value.length;i++) {
    initPublisherInfo(userId, studentList.value[i].userId)
  }
}

// 初始化开播rtc
async function initPublisherInfo(teaUid, stuUid) {
  if(localRtcPcList.has(teaUid + '-' + stuUid)) {
    return
  }
  let lrtc = new RTCPeerConnection()
  localRtcPcList.set(teaUid + '-' + stuUid, lrtc)

  // 回调监听
  onPcEvent(lrtc, teaUid, stuUid)

  for(const s of screenStream.getTracks()) {
    lrtc.addTrack(s)
  }

  // 存储rtc

   // 创建offer
  let offer = await lrtc.createOffer()

  // 设置offer本地描述
  await lrtc.setLocalDescription(offer)

  // 发送offer给被呼叫端
  let params = {
    stuUid,
    teaUid,
    offer
  }
  socket.value.emit('offer', params)
}

async function onPcEvent(pc, teaUid, stuUid) {
  if(!channelList.has(teaUid + '-' + stuUid)) {
    let channel = await pc.createDataChannel(teaUid + '-' + stuUid)
    channelList.set(teaUid + '-' + stuUid, channel)
  }
  
  // 设置远端媒体流
  pc.ontrack = function(event) {
    setRemoteVideoStream(videoRef, event.track)
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
        barrageList.push(data.data)
      };
      ev.channel.onclose = function() {
        console.log('Data channel ------------close----------------');
      };
  }

  // 创建icecandidate
  pc.onicecandidate = function(e) {
    if(e.candidate) {
      if(userType.value == 1) {
        studentList.value.forEach(stu => {
          socket.value.emit('candidate', {targetUid: stu.userId, userId: userId, candidate: e.candidate})
        })
      }else{
        if(teacherInfo.value.userId) {
          socket.value.emit('candidate', {targetUid: teacherInfo.value.userId, userId: userId, candidate: e.candidate})
        }
      }
    }else{
      log('此次协商中，没有更多的候选')
    }
  }
}

// 设置本地媒体流
function setVideoStream(domId, newStream) {
  let video = domId.value
  let stream = video.srcObject
  newStream.getVideoTracks()[0].addEventListener('ended', () => {
    socket.value.emit('teacherClose')
  });
  if (stream) {
    stream.getAudioTracks().forEach((e) => {
      stream.removeTrack()
    })
    stream.getVideoTracks().forEach((e) => {
      stream.removeTrack()
    })
  }
  video.srcObject = newStream
  video.play()
}

// 设置远端媒体流
function setRemoteVideoStream(domId, track) {
  let video = domId.value
  let stream = video.srcObject
  if(stream){
    stream.addTrack(track)
  }else{
    let newStream = new MediaStream()
    newStream.addTrack(track)
    video.srcObject =newStream
    video.play()
  }
}

// 学生端接到offer
async function onRemoteOffer(teaUid, stuUid, offer) {
    let lrtc = new RTCPeerConnection()

    // 修改为开播状态
    isPublist.value = true

      // 设置只接收不发送
    lrtc.addTransceiver('audio', { direction: 'recvonly' })
    lrtc.addTransceiver('video', { direction: 'recvonly' })

    localRtcPcList.set(teaUid + '-' + stuUid, lrtc)

    // 回调监听
    onPcEvent(lrtc, teaUid, stuUid)

    await lrtc.setRemoteDescription(offer)

    // 创建answer
    let answer = await lrtc.createAnswer()
    
    // 设置localDescription
    await lrtc.setLocalDescription(answer)


    // 将answer发送给fromUid
    let params = {teaUid, stuUid, answer}
    socket.value.emit('answer', params)
}

// 接到answer
async function onRemoteAnswer(teaUid, stuUid, answer) {
    let lrtc = localRtcPcList.get(teaUid + '-' + stuUid)
    if(lrtc) {
      await lrtc.setRemoteDescription(answer)
    }
}

// 切换分享流
async function changeMedia() {
  let stream = await getShareSqeenStream()
  stream.getVideoTracks()[0].addEventListener('ended', () => {
    socket.value.emit('teacherClose')
  });
  for(var i = 0;i < studentList.value.length;i++) {
    let stuId = studentList.value[i].userId
    let lrtc = localRtcPcList.get(userId + '-' + stuId)
    const senders = lrtc.getSenders()
    const [videoTrack] = stream.getVideoTracks()
    const send = senders.find(s => s.track.kind === 'video')
    send.replaceTrack(videoTrack)
  }
  
  let oldStream = videoRef.value.srcObject
  for(const s of oldStream.getTracks()) {
    s.stop()
  }
  videoRef.value.srcObject = stream
  videoRef.value.play()
}

// 通过信道发送信息
function sendChat() {
  let params = {
    teaUid: teacherInfo.value.userId,
    msg: nickName.value + ': ' + chatIpt.value
  }
  socket.value.emit('sendChat', params)
  chatIpt.value = ''
}


function initVb(){
    canvasElement = document.getElementById('output_canvas');
    canvasCtx = canvasElement.getContext('2d');
    image = new Image();
    image.src = 'http://127.0.0.1:8080/backgrond.png'
    selfieSegmentation = new SFS.SelfieSegmentation({locateFile: (file) => {
            console.log(file);
            return `http://127.0.0.1:8080/${file}`;//ng  代理模型文件夹
    }});                                
    selfieSegmentation.setOptions({
            modelSelection: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
    });
    selfieSegmentation.onResults(handleResults);
}

function handleResults(results) {
    // Prepare the new frame
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.segmentationMask, 0, 0, canvasElement.width, canvasElement.height);
   //利用canvas绘制新背景 
   //canvasCtx.globalCompositeOperation = 'source-in';则意味着处理分割后图像中的人体。 
    canvasCtx.globalCompositeOperation = 'source-out';
    canvasCtx.drawImage(image, 0, 0, image.width, image.height, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.globalCompositeOperation = 'destination-atop';
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    // Done
    canvasCtx.restore();
}

// 初始化算法处理所需的SFS
onMounted(() => {
  initVb()
})

/**
 * 监听触发模型处理
 */
 async function virtualBg(){
        let video = videoRef.value
        video.addEventListener('playing',function(){
                let myvideo = this;
                let lastTime = new Date();
                async function getFrames() {
                        const now = myvideo.currentTime;
                        if(now > lastTime){
                                await selfieSegmentation.send({image: myvideo});
                        }
                        lastTime = now;
                        //无限定时循环 退出记得取消 cancelAnimationFrame() 
                        requestAnimationFrame(getFrames);
                };
                getFrames()
        })
}



</script>

<style lang="less" scoped>
.container {
  width: 800px;
  margin: auto;
}
.iptContainer {
  width: 300px;
  overflow: hidden;
}

.header {
  font-size: 18px;
  font-weight: 700;
  text-align: center;
}

.itemContainer {
  margin-top: 20px;
}

.barrageInput {
  width: 300px;
  display: flex;
  align-items: center;
}
.barrageBox {
  max-height: 300px;
  .barrageItem {
    line-height: 1.5;
  }
}
</style>
